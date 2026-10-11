import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { wordleCompleted } from "@/domain-events/participation";
import {
  challengeInputSchema,
  createChallengeAs,
  EVIDENCE_TEXT_MAX,
  EVIDENCE_TEXT_MIN,
  publishChallengeAs,
} from "@/modules/participation";
import {
  achievement,
  boosterItem,
  occasion,
  pointEntry,
  wordleGame,
} from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { headObject } from "@/shared/adapters/storage";
import { t, tList } from "@/shared/copy";
import { utcToBogotaInput } from "@/shared/lib/dates";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { rejectBucketUploads } from "./bucket-helper";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

// Retos en Mi OE (ADR-067 reglas 3 a 6 y 15): la bandera se prende desde /admin/gamificacion/limites,
// el admin crea y publica, el miembro participa y su historia queda en el ledger.
// La bandera vuelve a apagarse sola: el baseline se restaura antes de cada prueba.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const ADMIN_STATE = "tests/e2e/.auth/admin.json";

async function personId(email: string): Promise<string> {
  const [row] = await getDb().select({ id: person.id }).from(person).where(eq(person.email, email));
  if (!row) throw new Error(`sin persona ${email}`);
  return row.id;
}

async function currentTermId(): Promise<string> {
  const [row] = await getDb()
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_TERM.code));
  if (!row) throw new Error("sin término E2E");
  return row.id;
}

/** Lo que muestra el check-in: el sello de marca ya dice «¡OE OE OE!», así que el texto no lo repite. */
function checkInOk(n: number): string {
  return t("T-092", { n }).replace(/\s*¡OE OE OE!$/, "");
}

/** Estado de la última corrida de conciliación seguido de sus conteos (T-2559 · T-2560). */
function corrida(estado: 0 | 1, desbloqueadas = "\\d+"): RegExp {
  const conteos = copyPattern("T-2560", {
    procesadas: "PROCESADAS",
    desbloqueadas: "DESBLOQUEADAS",
  })
    .source.replace("PROCESADAS", "\\d+")
    .replace("DESBLOQUEADAS", desbloqueadas);
  return new RegExp(`${tList("T-2559")[estado]} · ${conteos}`);
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  return context.newPage();
}

/** Prende `gamification.enabled` desde la pantalla de límites, como lo haría GH. */
async function activarRetos(admin: Page): Promise<void> {
  await admin.goto("/admin/gamificacion/limites");
  const bandera = admin.getByLabel(t("T-2552"));
  if (!(await bandera.isChecked())) {
    await bandera.check();
  }
  await admin.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(admin.getByText(t("T-2554"))).toBeVisible();
}

/** Reto publicado por la vía auditada (las mismas funciones que llaman las acciones del admin). */
async function crearReto(input: Parameters<typeof challengeInputSchema.parse>[0]): Promise<string> {
  const actor = { personId: await personId(E2E_EMAIL), ip: "127.0.0.1" };
  const parsed = challengeInputSchema.parse(input);
  const created = await createChallengeAs(actor, parsed);
  await publishChallengeAs(actor, created.id);
  return created.id;
}

async function saldoMiembro(): Promise<number> {
  const miembro = await personId(E2E_MEMBER_EMAIL);
  const entries = await getDb()
    .select({ points: pointEntry.points })
    .from(pointEntry)
    .where(eq(pointEntry.personId, miembro));
  return entries.reduce((total, entry) => total + entry.points, 0);
}

function ventana(): { opensAt: Date; closesAt: Date } {
  return { opensAt: new Date(Date.now() - 3_600_000), closesAt: new Date(Date.now() + 86_400_000) };
}

test.beforeEach(async ({ browser }) => {
  const admin = await adminPage(browser);
  await activarRetos(admin);
  await admin.context().close();
});

test.afterEach(async () => {
  await drenarOutbox();
  await closeDb();
});

test("trivia: el admin la crea por la interfaz y el miembro la responde por teclado", async ({
  page,
  browser,
}) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/retos/nuevo");
  await admin.getByLabel(tList("T-2504")[0]).selectOption({ label: tList("T-2409")[1] });
  await admin.getByLabel(tList("T-2504")[1], { exact: true }).fill("e2e-Trivia relámpago");
  await admin
    .getByLabel(tList("T-2504")[5])
    .fill(utcToBogotaInput(new Date(Date.now() - 3_600_000)));
  await admin
    .getByLabel(tList("T-2504")[6])
    .fill(utcToBogotaInput(new Date(Date.now() + 86_400_000)));
  const grupo = admin.getByRole("group", { name: copyPattern("T-2509", {}, "i") });
  await grupo.getByRole("button", { name: tList("T-2508")[3], exact: true }).click();
  const bloques = grupo.locator("div.rounded-xl");
  await expect(bloques).toHaveCount(2);
  const preguntas = [
    { prompt: "e2e-¿Cuánto es 2 + 2?", opciones: ["4", "5"] },
    { prompt: "e2e-¿Cuánto es 3 + 3?", opciones: ["6", "7"] },
  ];
  for (const [index, pregunta] of preguntas.entries()) {
    const bloque = bloques.nth(index);
    await bloque.locator("input:not([type])").nth(0).fill(pregunta.prompt);
    await bloque
      .locator("input:not([type])")
      .nth(1)
      .fill(pregunta.opciones[0] ?? "");
    await bloque
      .locator("input:not([type])")
      .nth(2)
      .fill(pregunta.opciones[1] ?? "");
  }
  await admin.getByRole("button", { name: tList("T-2510")[0] }).click();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/[a-z0-9]+\?guardado=1$/);
  await admin.getByRole("button", { name: tList("T-2510")[1], exact: true }).click();
  // La URL ya traía `guardado=1` del borrador: no prueba que se publicó. El botón solo existe en
  // borrador, así que su ausencia sí; cerrar antes el contexto abortaba la publicación en vuelo.
  await expect(admin.getByRole("button", { name: tList("T-2510")[1], exact: true })).toHaveCount(0);
  await admin.context().close();

  const antes = await saldoMiembro();
  await page.goto("/app/gh-points/retos");
  await page.getByRole("link", { name: /e2e-Trivia relámpago/ }).click();
  await page.getByRole("radio", { name: "4", exact: true }).press(" ");
  await page.getByRole("radio", { name: "6", exact: true }).press(" ");
  await page.getByRole("button", { name: tList("T-2420")[1] }).press("Enter");
  await expect(page.getByText(t("T-2422", { aciertos: 2, total: 2, n: 5 }))).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/reto-trivia-desktop.png", fullPage: true });

  await page.goto("/app/gh-points");
  await expect(page.getByText(t("T-2469", { reto: "e2e-Trivia relámpago" }))).toBeVisible();
  await expect(page.getByRole("cell", { name: tList("T-085")[5] }).first()).toBeVisible();
  expect(await saldoMiembro()).toBe(antes + 5);
});

test("editor: una misión nacida en trivia guarda la hora de Colombia, se publica y se retitula", async ({
  browser,
}) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/retos/nuevo");
  // El formulario abre en trivia con una pregunta vacía que sigue oculta al cambiar de formato.
  await admin.getByLabel(tList("T-2504")[0]).selectOption({ label: tList("T-2409")[2] });
  await admin.getByLabel(tList("T-2504")[1], { exact: true }).fill("e2e-Misión desde el editor");
  await admin.getByLabel(tList("T-2504")[2], { exact: true }).fill("e2e-Foto con la estatua.");
  // Una ventana corta: leída como UTC, el cierre quedaría en el pasado y no se podría publicar.
  const abre = utcToBogotaInput(new Date(Date.now() - 3_600_000));
  const cierra = utcToBogotaInput(new Date(Date.now() + 2 * 3_600_000));
  await admin.getByLabel(tList("T-2504")[5]).fill(abre);
  await admin.getByLabel(tList("T-2504")[6]).fill(cierra);
  await admin.getByLabel(tList("T-2504")[7]).fill("20");
  await admin.getByRole("button", { name: tList("T-2510")[0] }).click();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/[a-z0-9]+\?guardado=1$/);
  await expect(admin.getByLabel(tList("T-2504")[5])).toHaveValue(abre);
  await expect(admin.getByLabel(tList("T-2504")[6])).toHaveValue(cierra);
  await admin.getByRole("button", { name: tList("T-2510")[1], exact: true }).click();
  await expect(admin.getByRole("button", { name: tList("T-2510")[1], exact: true })).toHaveCount(0);

  // Publicado, los campos congelados van deshabilitados; el título y la descripción se siguen guardando.
  await admin.getByLabel(tList("T-2504")[1], { exact: true }).fill("e2e-Misión retitulada");
  await admin.getByRole("button", { name: tList("T-2510")[0] }).click();
  await expect(
    admin.getByRole("heading", { level: 1, name: "e2e-Misión retitulada" }),
  ).toBeVisible();
  await expect(admin.getByLabel(tList("T-2504")[6])).toHaveValue(cierra);
  await admin.context().close();
});

test("editor: un error al crear deja el formulario nuevo con lo escrito", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/retos/nuevo");
  const pregunta = admin
    .getByRole("group", { name: copyPattern("T-2509", {}, "i") })
    .locator("input:not([type])")
    .first();
  await pregunta.fill("e2e-¿Dónde está la estatua?");
  await admin.getByLabel(tList("T-2504")[0]).selectOption({ label: tList("T-2409")[2] });
  await admin
    .getByLabel(tList("T-2504")[1], { exact: true })
    .fill("e2e-Misión con fechas cruzadas");
  const abre = utcToBogotaInput(new Date(Date.now() + 2 * 3_600_000));
  await admin.getByLabel(tList("T-2504")[5]).fill(abre);
  await admin
    .getByLabel(tList("T-2504")[6])
    .fill(utcToBogotaInput(new Date(Date.now() + 3_600_000)));
  await admin.getByRole("button", { name: tList("T-2510")[0] }).click();
  await expect(admin.getByText(tList("T-2520")[0])).toBeVisible();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/nuevo\?/);
  await expect(admin.getByLabel(tList("T-2504")[0])).toHaveValue("EVIDENCE");
  await expect(admin.getByLabel(tList("T-2504")[1], { exact: true })).toHaveValue(
    "e2e-Misión con fechas cruzadas",
  );
  await expect(admin.getByLabel(tList("T-2504")[5])).toHaveValue(abre);
  // El formulario se remonta tras el error: el formato y las preguntas vuelven con el borrador.
  await admin.getByLabel(tList("T-2504")[0]).selectOption({ label: tList("T-2409")[1] });
  await expect(pregunta).toHaveValue("e2e-¿Dónde está la estatua?");
  await admin.context().close();
});

test("evidencia: el miembro entrega texto e imagen y el admin la aprueba", async ({
  page,
  browser,
}) => {
  const id = await crearReto({
    kind: "EVIDENCE",
    title: "e2e-Misión de la semana",
    description: "Contá qué hiciste.",
    ...ventana(),
    basePoints: 10,
  });

  await page.goto(`/app/gh-points/retos/${id}`);
  await page
    .getByLabel(t("T-2428"))
    .fill("e2e-Organicé el puesto de bienvenida con dos compañeros del comité.");
  const png = await sharp(randomBytes(640 * 360 * 3), {
    raw: { width: 640, height: 360, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await page
    .getByLabel(t("T-2429"))
    .setInputFiles({ name: "e2e-evidencia.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "e2e-evidencia.png" })).toBeVisible();
  await page.getByRole("button", { name: tList("T-2420")[2] }).click();
  // router.refresh reemplaza el aviso del uploader por el estado persistido del servidor.
  // Esperar ese resultado evita depender de cuánto dura el mensaje de confirmación.
  await expect(page.getByText(t("T-2433"))).toBeVisible();
  await expect(page.getByText(t("T-2572", { n: 10 }), { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(t("T-2433"))).toBeVisible();
  await expect(page.getByText(t("T-2572", { n: 10 }), { exact: true })).toBeVisible();
  await sinViolaciones(page);
  await drenarOutbox();

  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/revision");
  const entrega = admin.getByRole("listitem").filter({ hasText: "e2e-Misión de la semana" });
  await entrega.getByRole("button", { name: tList("T-2525")[0], exact: true }).click();
  await expect(admin.getByText(t("T-259"))).toBeVisible();
  await admin.context().close();

  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText(t("T-2434", { n: 10 }))).toBeVisible();
  await sinViolaciones(page);
});

test("evidencia: un archivo rechazado o una subida fallida se avisan con su texto, no dejan imagen y el selector queda vacío", async ({
  page,
}) => {
  const id = await crearReto({
    kind: "EVIDENCE",
    title: "e2e-Misión con subidas fallidas",
    description: "Contá qué hiciste.",
    ...ventana(),
    basePoints: 10,
  });
  let presigns = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/retos/evidencia/presign")) presigns += 1;
  });
  await page.goto(`/app/gh-points/retos/${id}`);
  const form = page.locator("form").filter({ has: page.locator('input[type="file"]') });
  const picker = form.locator('input[type="file"]');
  /** Un selector que conserva el archivo rechazado no avisa si se vuelve a elegir ese mismo. */
  const pickedFiles = () => picker.evaluate((input: HTMLInputElement) => input.files?.length);
  await picker.setInputFiles({
    name: "e2e-notas.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("No es una imagen"),
  });
  await expect(form.getByRole("alert")).toHaveText(tList("T-2430")[0]);
  expect(await pickedFiles()).toBe(0);
  const tiny = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#001f3e" },
  })
    .png()
    .toBuffer();
  expect(tiny.byteLength).toBeLessThan(5 * 1024);
  await picker.setInputFiles({ name: "e2e-diminuta.png", mimeType: "image/png", buffer: tiny });
  await expect(form.getByRole("alert")).toHaveText(t("T-3264"));
  expect(await pickedFiles()).toBe(0);
  await picker.setInputFiles({
    name: "e2e-enorme.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(form.getByRole("alert")).toHaveText(tList("T-2430")[1]);
  expect(await pickedFiles()).toBe(0);
  expect(presigns).toBe(0);

  const png = await sharp(randomBytes(320 * 180 * 3), {
    raw: { width: 320, height: 180, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const evidence = { name: "e2e-evidencia-fallida.png", mimeType: "image/png", buffer: png };
  // La evidencia no repite lo que diga el servidor: cualquier fallo lleva su propio texto.
  await page.route("**/api/retos/evidencia/presign", (route) =>
    route.fulfill({ status: 403, json: { error: "Mensaje de prueba del servidor." } }),
  );
  await picker.setInputFiles(evidence);
  await expect(form.getByRole("alert")).toHaveText(tList("T-2430")[3]);
  expect(presigns).toBe(1);
  expect(await picker.evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await page.unroute("**/api/retos/evidencia/presign");

  const bucket = await rejectBucketUploads(page, "/api/retos/evidencia/presign");
  await picker.setInputFiles(evidence);
  await expect.poll(() => bucket.uploads).toBe(1);
  await expect(form.getByRole("alert")).toHaveText(tList("T-2430")[3]);
  expect(await picker.evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await expect(page.getByRole("img", { name: evidence.name })).toHaveCount(0);
  await expect(picker).toBeEnabled();
});

test("evidencia: quitar de la lista una imagen ya subida la borra del bucket", async ({ page }) => {
  const id = await crearReto({
    kind: "EVIDENCE",
    title: "e2e-Misión con una imagen quitada",
    description: "Contá qué hiciste.",
    ...ventana(),
    basePoints: 10,
  });
  await page.goto(`/app/gh-points/retos/${id}`);
  const png = await sharp(randomBytes(640 * 360 * 3), {
    raw: { width: 640, height: 360, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const presigned = page.waitForResponse(
    (response) => response.url().includes("/api/retos/evidencia/presign") && response.ok(),
  );
  await page
    .getByLabel(t("T-2429"))
    .setInputFiles({ name: "e2e-evidencia-quitada.png", mimeType: "image/png", buffer: png });
  const { key } = (await (await presigned).json()) as { key: string };
  const preview = page.getByRole("img", { name: "e2e-evidencia-quitada.png" });
  await expect(preview).toBeVisible();
  expect(await headObject(key)).not.toBeNull();

  await page.getByRole("button", { name: t("T-1489"), exact: true }).click();
  await expect(preview).toHaveCount(0);
  // La casa lo borra sin que la pantalla espere la respuesta (ADR-122 regla 20).
  await expect.poll(() => headObject(key)).toBeNull();
});

test("evidencia: un texto que queda corto sin los espacios de los bordes avisa con el largo pedido", async ({
  page,
}) => {
  const id = await crearReto({
    kind: "EVIDENCE",
    title: "e2e-Misión con un texto corto",
    description: "Contá qué hiciste.",
    ...ventana(),
    basePoints: 10,
  });
  await page.goto(`/app/gh-points/retos/${id}`);
  // El navegador cuenta los espacios y deja enviar; el formulario no (ADR-122 regla 16).
  await page.getByLabel(t("T-2428")).fill(`e2e-corto${" ".repeat(EVIDENCE_TEXT_MIN)}`);
  await page.getByRole("button", { name: tList("T-2420")[2] }).click();
  await expect(
    page.getByText(t("T-3261", { min: EVIDENCE_TEXT_MIN, max: EVIDENCE_TEXT_MAX })),
  ).toBeVisible();
  await expect(page.getByText(t("T-2426"))).toHaveCount(0);
  // No se entregó nada: al recargar el formulario sigue ahí.
  await page.reload();
  await expect(page.getByLabel(t("T-2428"))).toBeVisible();
});

test("presencial: el check-in de la actividad completa el reto solo", async ({ page }) => {
  const termId = await currentTermId();
  const now = Date.now();
  const [ocasion] = await getDb()
    .insert(occasion)
    .values({
      publicId: "e2ereto001",
      termId,
      title: "e2e-Actividad con reto",
      category: "INTEGRATION",
      location: "Bloque 38",
      points: 20,
      status: "OPEN",
      approval: "AUTO",
      startsAt: new Date(now),
      checkInOpensAt: new Date(now - 3_600_000),
      checkInClosesAt: new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id });
  if (!ocasion) throw new Error("sin ocasión");
  const id = await crearReto({
    kind: "PRESENTIAL",
    title: "e2e-Reto presencial",
    description: "Asistí y listo.",
    occasionId: ocasion.id,
    ...ventana(),
    basePoints: 10,
  });

  await page.goto("/a/e2ereto001");
  await page.getByRole("button", { name: t("T-091") }).click();
  await expect(page.getByText(checkInOk(20))).toBeVisible();

  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText(t("T-2434", { n: 10 }))).toBeVisible();
  await sinViolaciones(page);
});

test("booster: el admin lo otorga, el miembro lo apunta a una trivia y suma el extra", async ({
  page,
  browser,
}) => {
  const id = await crearReto({
    kind: "TRIVIA",
    title: "e2e-Trivia con booster",
    description: "Una pregunta.",
    passPercent: 100,
    questions: [{ prompt: "e2e-¿Cuánto es 4 + 4?", options: ["8", "9"], correctIndex: 0 }],
    ...ventana(),
    basePoints: 5,
  });

  // Alta manual desde el bloque de boosters de la página de insignias (se mudó en G-T5).
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/insignias");
  const bloque = admin.locator("section[aria-labelledby='otorgar-booster-titulo']");
  await bloque.getByRole("textbox", { name: tList("T-2546")[0] }).fill(E2E_MEMBER_EMAIL);
  await bloque.getByRole("button", { name: t("T-250"), exact: true }).click();
  await bloque.getByRole("link", { name: "Miembro E2E" }).click();
  await bloque
    .getByRole("combobox", { name: tList("T-2546")[1] })
    .selectOption({ label: tList("T-2451")[0] });
  await bloque
    .getByRole("textbox", { name: tList("T-2546")[2], exact: true })
    .fill("e2e-Reconocimiento de prueba");
  await bloque.getByRole("button", { name: t("T-2545"), exact: true }).click();
  await expect(admin.getByText(tList("T-2548")[1])).toBeVisible();
  await admin.context().close();

  // El miembro lo apunta a la trivia desde su inventario.
  await page.goto("/app/gh-points/boosters");
  await expect(page.getByRole("heading", { name: t("T-2452") })).toBeVisible();
  await expect(page.getByRole("heading", { name: tList("T-2451")[0] })).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/boosters-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/boosters-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByText(t("T-2457")).click();
  await page.getByRole("radio", { name: /e2e-Trivia con booster/ }).check();
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(
    page.getByText(
      t("T-2459", { booster: tList("T-2451")[0], objetivo: "e2e-Trivia con booster" }),
    ),
  ).toBeVisible();

  // Responde la trivia: base 5 + booster floor(5 × 0.5) = 2.
  const antes = await saldoMiembro();
  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText(t("T-2415", { booster: tList("T-2451")[0] }))).toBeVisible();
  await page.getByRole("radio", { name: "8", exact: true }).press(" ");
  await page.getByRole("button", { name: tList("T-2420")[1] }).press("Enter");
  await expect(page.getByText(t("T-2422", { aciertos: 1, total: 1, n: 7 }))).toBeVisible();
  await expect(page.getByText(t("T-2435", { base: 5, extra: 2 }))).toBeVisible();
  await sinViolaciones(page);

  // El movimiento Impulso queda en su historia.
  await page.goto("/app/gh-points");
  await expect(page.getByRole("cell", { name: tList("T-085")[6] }).first()).toBeVisible();
  expect(await saldoMiembro()).toBe(antes + 7);
});

test("campaña: el admin cubre una actividad y el check-in suma el extra", async ({
  page,
  browser,
}) => {
  const termId = await currentTermId();
  const now = Date.now();
  const [ocasion] = await getDb()
    .insert(occasion)
    .values({
      publicId: "e2eboost01",
      termId,
      title: "e2e-Actividad con campaña",
      category: "INTEGRATION",
      location: "Bloque 38",
      points: 10,
      status: "OPEN",
      approval: "AUTO",
      startsAt: new Date(now),
      checkInOpensAt: new Date(now - 3_600_000),
      checkInClosesAt: new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id });
  if (!ocasion) throw new Error("sin ocasión");

  // Campaña +50 % por la interfaz admin, con ventana ya vigente.
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/campanas");
  await admin.getByLabel(tList("T-2533")[0]).fill("e2e-Campaña de bienvenida");
  await admin.getByRole("checkbox", { name: /e2e-Actividad con campaña/ }).check();
  await admin.getByLabel(tList("T-2533")[3]).fill(utcToBogotaInput(new Date(now - 3_600_000)));
  await admin.getByRole("button", { name: tList("T-2537")[0], exact: true }).click();
  await expect(admin.getByText(t("T-259"))).toBeVisible();
  await expect(admin.getByRole("cell", { name: "e2e-Campaña de bienvenida" })).toBeVisible();
  await admin.context().close();

  // Check-in del miembro: 10 de asistencia + floor(10 × 0.5) = 5 de campaña.
  const antes = await saldoMiembro();
  await page.goto("/a/e2eboost01");
  await page.getByRole("button", { name: t("T-091") }).click();
  await expect(page.getByText(checkInOk(10))).toBeVisible();
  expect(await saldoMiembro()).toBe(antes + 15);

  await page.goto("/app/gh-points");
  await expect(page.getByRole("cell", { name: tList("T-085")[6] }).first()).toBeVisible();
  await sinViolaciones(page);
});

test("trivia en móvil: radios por teclado y sin scroll horizontal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await crearReto({
    kind: "TRIVIA",
    title: "e2e-Trivia móvil",
    description: "Dos preguntas.",
    passPercent: 80,
    questions: [
      { prompt: "e2e-¿Cuánto es 5 + 5?", options: ["10", "11"], correctIndex: 0 },
      { prompt: "e2e-¿Cuánto es 1 + 1?", options: ["2", "3"], correctIndex: 0 },
    ],
    ...ventana(),
    basePoints: 5,
  });

  await page.goto(`/app/gh-points/retos/${id}`);
  await page.getByRole("radio", { name: "10", exact: true }).press(" ");
  await page.getByRole("radio", { name: "2", exact: true }).press(" ");
  await page.getByRole("button", { name: tList("T-2420")[1] }).press("Enter");
  await expect(page.getByText(t("T-2422", { aciertos: 2, total: 2, n: 5 }))).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/reto-trivia-mobile.png", fullPage: true });
});

test("colección: cerrar el aviso de una insignia sin conexión deja la página en pie y el aviso vuelve a salir", async ({
  page,
}) => {
  const member = await personId(E2E_MEMBER_EMAIL);
  await getDb().delete(boosterItem).where(eq(boosterItem.personId, member));
  await getDb().delete(achievement).where(eq(achievement.personId, member));
  const id = await crearReto({
    kind: "TRIVIA",
    title: "e2e-Trivia insignia sin conexión",
    description: "Una pregunta.",
    passPercent: 100,
    questions: [{ prompt: "e2e-¿Cuánto es 6 + 6?", options: ["12", "13"], correctIndex: 0 }],
    ...ventana(),
    basePoints: 5,
  });
  await page.goto(`/app/gh-points/retos/${id}`);
  await page.getByRole("radio", { name: "12", exact: true }).press(" ");
  await page.getByRole("button", { name: tList("T-2420")[1] }).press("Enter");
  await expect(page.getByText(copyPattern("T-2422", { aciertos: 1, total: 1 }))).toBeVisible();
  await drenarOutbox(); // challenge.completed → recompute → Relámpago 1 + booster
  await drenarOutbox(); // badge.unlocked

  await page.goto("/app/gh-points/coleccion");
  await expect(page.getByRole("dialog").getByText(t("T-2495"))).toBeVisible();
  // El pedido que marca la insignia como vista no llega a la casa.
  await page.route("**/app/gh-points/coleccion", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  const rejected = page.waitForEvent("requestfailed", (request) => request.method() === "POST");
  await page.keyboard.press("Escape");
  await rejected;
  // Cuando termina la transición del cierre, el botón del aviso deja de estar ocupado: el aviso
  // sigue montado, cerrado, y la colección sigue en pie.
  await expect(page.locator("dialog", { hasText: t("T-2495") }).locator("button")).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-2471"));

  // El pedido nunca llegó, así que la insignia sigue sin ver: el aviso sale en la siguiente visita.
  await page.unroute("**/app/gh-points/coleccion");
  await page.reload();
  await expect(page.getByRole("dialog").getByText(t("T-2495"))).toBeVisible();
});

test("colección: la insignia abre el diálogo una vez, se destaca y sale en el directorio", async ({
  page,
}) => {
  // Logros/boosters previos del miembro limpios para que el desbloqueo sea nuevo y no visto.
  const miembro = await personId(E2E_MEMBER_EMAIL);
  await getDb().delete(boosterItem).where(eq(boosterItem.personId, miembro));
  await getDb().delete(achievement).where(eq(achievement.personId, miembro));

  const id = await crearReto({
    kind: "TRIVIA",
    title: "e2e-Trivia insignia",
    description: "Una pregunta.",
    passPercent: 100,
    questions: [{ prompt: "e2e-¿Cuánto es 6 + 6?", options: ["12", "13"], correctIndex: 0 }],
    ...ventana(),
    basePoints: 5,
  });
  await page.goto(`/app/gh-points/retos/${id}`);
  await page.getByRole("radio", { name: "12", exact: true }).press(" ");
  await page.getByRole("button", { name: tList("T-2420")[1] }).press("Enter");
  await expect(page.getByText(copyPattern("T-2422", { aciertos: 1, total: 1 }))).toBeVisible();
  await drenarOutbox(); // challenge.completed → recompute → Relámpago 1 + booster
  await drenarOutbox(); // badge.unlocked

  // El diálogo aparece una sola vez con el nombre, el nivel y el booster ganado.
  await page.goto("/app/gh-points/coleccion");
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(t("T-2495"))).toBeVisible();
  await expect(dialogo.getByText(t("T-2496", { insignia: "Relámpago", nivel: 1 }))).toBeVisible();
  await expect(
    dialogo.getByText(copyPattern("T-2497", { booster: tList("T-2451")[0] })),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/coleccion-dialogo-desktop.png", fullPage: true });
  // dispatchEvent: el router.push de cierre re-renderiza la página y desmonta el diálogo
  // a mitad del click, y Playwright reintentaría sobre un nodo muerto. La espera del POST
  // evita que el reload compita con markSeen y reabra el diálogo animado bajo axe.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/app/gh-points/coleccion") && res.request().method() === "POST",
    ),
    dialogo.getByRole("button", { name: t("T-2498") }).dispatchEvent("click"),
  ]);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/coleccion-desktop.png", fullPage: true });

  // Destacarla la lleva a la tarjeta del directorio (el botón de la familia Relámpago:
  // otras familias también pueden estar desbloqueadas por pruebas anteriores).
  const familia = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: tList("T-2473")[2], exact: true }) });
  await familia.getByRole("button", { name: t("T-2491") }).click();
  await expect(familia.getByText(t("T-2502"))).toBeVisible();
  // El directorio pagina alfabéticamente: la búsqueda lo lleva a su tarjeta.
  await page.goto("/app/personas?q=E2E");
  const tarjeta = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Miembro E2E" }) });
  await expect(
    tarjeta
      .getByRole("list", { name: t("T-2502") })
      .getByText(`Relámpago · ${t("T-2482", { nivel: 1 })}`),
  ).toBeVisible();
});

test("colección en móvil y movimiento reducido: alternativa estática sin animación", async ({
  page,
}) => {
  const miembro = await personId(E2E_MEMBER_EMAIL);
  const termId = await currentTermId();
  await getDb().delete(boosterItem).where(eq(boosterItem.personId, miembro));
  await getDb().delete(achievement).where(eq(achievement.personId, miembro));

  // Palabra a palabra 1: un Wordle ganado en base + el evento que lo publica.
  const [game] = await getDb()
    .insert(wordleGame)
    .values({
      personId: miembro,
      day: "2026-01-15",
      termId,
      answer: "PRUEB",
      dictionaryVersion: "e2e",
      rulesVersion: "e2e",
      status: "WON",
      completedAt: new Date(),
    })
    .returning({ id: wordleGame.id });
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    ctx.emit(
      eventOf(wordleCompleted, {
        personId: miembro,
        termId,
        gameId: game?.id ?? "",
        day: "2026-01-15",
        attempts: 4,
        points: 5,
      }),
    ),
  );
  await drenarOutbox();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/gh-points/coleccion");
  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByText(t("T-2499", { insignia: "Palabra a palabra", nivel: 1 })),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/coleccion-dialogo-mobile.png", fullPage: true });
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/app/gh-points/coleccion") && res.request().method() === "POST",
    ),
    dialogo.getByRole("button", { name: t("T-2498") }).dispatchEvent("click"),
  ]);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/coleccion-mobile.png", fullPage: true });
});

test("conciliación: el admin simula y aplica, y la insignia histórica aparece en la colección", async ({
  page,
  browser,
}) => {
  // Un hecho viejo del miembro: un Wordle ganado en el término. La conciliación lo recoge
  // como Palabra a palabra 1 histórica (sin booster ni aviso, ADR-067 regla 11).
  const miembro = await personId(E2E_MEMBER_EMAIL);
  const termId = await currentTermId();
  await getDb()
    .insert(wordleGame)
    .values({
      personId: miembro,
      day: "2024-11-05",
      termId,
      answer: "TESTO",
      dictionaryVersion: "e2e",
      rulesVersion: "e2e",
      status: "WON",
      completedAt: new Date("2024-11-05T20:00:00Z"),
    });

  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion");
  await expect(admin.getByRole("heading", { name: t("T-2556") })).toBeVisible();
  await admin.getByRole("button", { name: tList("T-2558")[0] }).click();
  await expect(admin.getByText(corrida(0))).toBeVisible();
  await drenarOutbox();
  await admin.reload();
  await expect(admin.getByText(corrida(1, "[1-9]\\d*"))).toBeVisible();
  // El simulacro no escribe logros.
  await page.goto("/app/gh-points/coleccion");
  await expect(page.getByText(copyPattern("T-2487"))).toHaveCount(0);

  await admin.getByRole("link", { name: tList("T-2558")[1] }).click();
  const panel = admin.getByRole("dialog");
  await expect(panel.getByText(copyPattern("T-2591"))).toBeVisible();
  await panel.getByRole("button", { name: tList("T-2558")[1] }).click();
  await expect(admin.getByText(corrida(0))).toBeVisible();
  await drenarOutbox();
  await admin.reload();
  await expect(admin.getByText(corrida(1, "[1-9]\\d*"))).toBeVisible();
  await admin.screenshot({
    path: "test-results/admin-gamificacion-conciliacion.png",
    fullPage: true,
  });
  await admin.context().close();
  const logros = await getDb()
    .select({ historical: achievement.historical })
    .from(achievement)
    .where(eq(achievement.personId, miembro));
  expect(logros.some((logro) => logro.historical)).toBe(true);

  await page.reload();
  await expect(page.getByText(tList("T-2473")[3]).first()).toBeVisible();
  await expect(page.getByText(copyPattern("T-2487"))).toBeVisible();
  await sinViolaciones(page);
});
