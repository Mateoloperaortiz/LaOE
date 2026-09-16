import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  challengeInputSchema,
  createChallengeAs,
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
import { utcToBogotaInput } from "@/shared/lib/dates";
import { sinViolaciones } from "./axe";
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

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: ADMIN_STATE });
  return context.newPage();
}

/** Prende `gamification.enabled` desde la pantalla de límites, como lo haría GH. */
async function activarRetos(admin: Page): Promise<void> {
  await admin.goto("/admin/gamificacion/limites");
  const bandera = admin.getByLabel("Retos activos para los miembros");
  if (!(await bandera.isChecked())) {
    await bandera.check();
  }
  await admin.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(admin.getByText("Límites guardados.")).toBeVisible();
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
  await admin.getByLabel("Formato").selectOption({ label: "Trivia" });
  await admin.getByLabel("Título", { exact: true }).fill("e2e-Trivia relámpago");
  await admin.getByLabel("Abre").fill(utcToBogotaInput(new Date(Date.now() - 3_600_000)));
  await admin.getByLabel("Cierra").fill(utcToBogotaInput(new Date(Date.now() + 86_400_000)));
  const grupo = admin.getByRole("group", { name: /preguntas con 2 a 6 opciones/i });
  await grupo.getByRole("button", { name: "+", exact: true }).last().click();
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
  await admin.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/[a-z0-9]+\?guardado=1$/);
  await admin.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(admin).toHaveURL(/guardado=1/);
  await admin.context().close();

  const antes = await saldoMiembro();
  await page.goto("/app/gh-points/retos");
  await page.getByRole("link", { name: /e2e-Trivia relámpago/ }).click();
  await page.getByRole("radio", { name: "4", exact: true }).press(" ");
  await page.getByRole("radio", { name: "6", exact: true }).press(" ");
  await page.getByRole("button", { name: "Enviar respuestas" }).press("Enter");
  await expect(page.getByText("¡Acertaste 2 de 2 y sumaste 5 GH Points!")).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/reto-trivia-desktop.png", fullPage: true });

  await page.goto("/app/gh-points");
  await expect(page.getByText("Reto: e2e-Trivia relámpago")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Reto" }).first()).toBeVisible();
  expect(await saldoMiembro()).toBe(antes + 5);
});

test("editor: una misión nacida en trivia guarda la hora de Colombia, se publica y se retitula", async ({
  browser,
}) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/retos/nuevo");
  // El formulario abre en trivia con una pregunta vacía que sigue oculta al cambiar de formato.
  await admin.getByLabel("Formato").selectOption({ label: "Misión con evidencia" });
  await admin.getByLabel("Título", { exact: true }).fill("e2e-Misión desde el editor");
  await admin.getByLabel("Descripción", { exact: true }).fill("e2e-Foto con la estatua.");
  // Una ventana corta: leída como UTC, el cierre quedaría en el pasado y no se podría publicar.
  const abre = utcToBogotaInput(new Date(Date.now() - 3_600_000));
  const cierra = utcToBogotaInput(new Date(Date.now() + 2 * 3_600_000));
  await admin.getByLabel("Abre").fill(abre);
  await admin.getByLabel("Cierra").fill(cierra);
  await admin.getByLabel("Premio base").fill("20");
  await admin.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/[a-z0-9]+\?guardado=1$/);
  await expect(admin.getByLabel("Abre")).toHaveValue(abre);
  await expect(admin.getByLabel("Cierra")).toHaveValue(cierra);
  await admin.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(admin.getByRole("button", { name: "Publicar", exact: true })).toHaveCount(0);

  // Publicado, los campos congelados van deshabilitados; el título y la descripción se siguen guardando.
  await admin.getByLabel("Título", { exact: true }).fill("e2e-Misión retitulada");
  await admin.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(
    admin.getByRole("heading", { level: 1, name: "e2e-Misión retitulada" }),
  ).toBeVisible();
  await expect(admin.getByLabel("Cierra")).toHaveValue(cierra);
  await admin.context().close();
});

test("editor: un error al crear deja el formulario nuevo con lo escrito", async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/retos/nuevo");
  const pregunta = admin
    .getByRole("group", { name: /preguntas con 2 a 6 opciones/i })
    .locator("input:not([type])")
    .first();
  await pregunta.fill("e2e-¿Dónde está la estatua?");
  await admin.getByLabel("Formato").selectOption({ label: "Misión con evidencia" });
  await admin.getByLabel("Título", { exact: true }).fill("e2e-Misión con fechas cruzadas");
  const abre = utcToBogotaInput(new Date(Date.now() + 2 * 3_600_000));
  await admin.getByLabel("Abre").fill(abre);
  await admin.getByLabel("Cierra").fill(utcToBogotaInput(new Date(Date.now() + 3_600_000)));
  await admin.getByRole("button", { name: "Guardar borrador" }).click();
  await expect(
    admin.getByText("La fecha de cierre debe ser posterior a la de apertura."),
  ).toBeVisible();
  await expect(admin).toHaveURL(/\/admin\/gamificacion\/retos\/nuevo\?/);
  await expect(admin.getByLabel("Formato")).toHaveValue("EVIDENCE");
  await expect(admin.getByLabel("Título", { exact: true })).toHaveValue(
    "e2e-Misión con fechas cruzadas",
  );
  await expect(admin.getByLabel("Abre")).toHaveValue(abre);
  // El formulario se remonta tras el error: el formato y las preguntas vuelven con el borrador.
  await admin.getByLabel("Formato").selectOption({ label: "Trivia" });
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
    .getByLabel("Contanos qué hiciste")
    .fill("e2e-Organicé el puesto de bienvenida con dos compañeros del comité.");
  const png = await sharp(randomBytes(640 * 360 * 3), {
    raw: { width: 640, height: 360, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  await page
    .getByLabel("Agregar imagen")
    .setInputFiles({ name: "e2e-evidencia.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("img", { name: "e2e-evidencia.png" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar evidencia" }).click();
  // router.refresh reemplaza el aviso del uploader por el estado persistido del servidor.
  // Esperar ese resultado evita depender de cuánto dura el mensaje de confirmación.
  await expect(
    page.getByText(
      "Tu participación está en revisión. Reservamos tu premio con las reglas de hoy.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Premio reservado: 10 GH Points", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Tu participación está en revisión. Reservamos tu premio con las reglas de hoy.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Premio reservado: 10 GH Points", { exact: true })).toBeVisible();
  await sinViolaciones(page);
  await drenarOutbox();

  const admin = await adminPage(browser);
  await admin.goto("/admin/gamificacion/revision");
  const entrega = admin.getByRole("listitem").filter({ hasText: "e2e-Misión de la semana" });
  await entrega.getByRole("button", { name: "Aprobar", exact: true }).click();
  await expect(admin.getByText("Guardado.")).toBeVisible();
  await admin.context().close();

  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText("¡Reto completado! Sumaste 10 GH Points.")).toBeVisible();
  await sinViolaciones(page);
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
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("¡Listo! Sumaste 20 GH Points.")).toBeVisible();

  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText("¡Reto completado! Sumaste 10 GH Points.")).toBeVisible();
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
  await bloque.getByRole("textbox", { name: "Persona" }).fill(E2E_MEMBER_EMAIL);
  await bloque.getByRole("button", { name: "Buscar", exact: true }).click();
  await bloque.getByRole("link", { name: "Miembro E2E" }).click();
  await bloque.getByRole("combobox", { name: "Booster" }).selectOption({ label: "Impulso" });
  await bloque
    .getByRole("textbox", { name: "Motivo", exact: true })
    .fill("e2e-Reconocimiento de prueba");
  await bloque.getByRole("button", { name: "Otorgar booster", exact: true }).click();
  await expect(admin.getByText("Booster otorgado.")).toBeVisible();
  await admin.context().close();

  // El miembro lo apunta a la trivia desde su inventario.
  await page.goto("/app/gh-points/boosters");
  await expect(page.getByRole("heading", { name: "Tus boosters" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Impulso" })).toBeVisible();
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/boosters-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/boosters-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByText("¿Dónde lo usás?").click();
  await page.getByRole("radio", { name: /e2e-Trivia con booster/ }).check();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(
    page.getByText("Listo: tu Impulso está reservado para e2e-Trivia con booster."),
  ).toBeVisible();

  // Responde la trivia: base 5 + booster floor(5 × 0.5) = 2.
  const antes = await saldoMiembro();
  await page.goto(`/app/gh-points/retos/${id}`);
  await expect(page.getByText("Vas a usar tu Impulso acá")).toBeVisible();
  await page.getByRole("radio", { name: "8", exact: true }).press(" ");
  await page.getByRole("button", { name: "Enviar respuestas" }).press("Enter");
  await expect(page.getByText("¡Acertaste 1 de 1 y sumaste 7 GH Points!")).toBeVisible();
  await expect(page.getByText("5 de base + 2 de booster")).toBeVisible();
  await sinViolaciones(page);

  // El movimiento Impulso queda en su historia.
  await page.goto("/app/gh-points");
  await expect(page.getByRole("cell", { name: "Impulso" }).first()).toBeVisible();
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
  await admin.getByLabel("Nombre").fill("e2e-Campaña de bienvenida");
  await admin.getByRole("checkbox", { name: /e2e-Actividad con campaña/ }).check();
  await admin.getByLabel("Empieza").fill(utcToBogotaInput(new Date(now - 3_600_000)));
  await admin.getByRole("button", { name: "Crear campaña", exact: true }).click();
  await expect(admin.getByText("Guardado.")).toBeVisible();
  await expect(admin.getByRole("cell", { name: "e2e-Campaña de bienvenida" })).toBeVisible();
  await admin.context().close();

  // Check-in del miembro: 10 de asistencia + floor(10 × 0.5) = 5 de campaña.
  const antes = await saldoMiembro();
  await page.goto("/a/e2eboost01");
  await page.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(page.getByText("¡Listo! Sumaste 10 GH Points.")).toBeVisible();
  expect(await saldoMiembro()).toBe(antes + 15);

  await page.goto("/app/gh-points");
  await expect(page.getByRole("cell", { name: "Impulso" }).first()).toBeVisible();
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
  await page.getByRole("button", { name: "Enviar respuestas" }).press("Enter");
  await expect(page.getByText("¡Acertaste 2 de 2 y sumaste 5 GH Points!")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/reto-trivia-mobile.png", fullPage: true });
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
  await page.getByRole("button", { name: "Enviar respuestas" }).press("Enter");
  await expect(page.getByText("¡Acertaste 1 de 1")).toBeVisible();
  await drenarOutbox(); // challenge.completed → recompute → Relámpago 1 + booster
  await drenarOutbox(); // badge.unlocked

  // El diálogo aparece una sola vez con el nombre, el nivel y el booster ganado.
  await page.goto("/app/gh-points/coleccion");
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("¡Nueva insignia!")).toBeVisible();
  await expect(dialogo.getByText("Desbloqueaste Relámpago nivel 1. ¡OE OE OE!")).toBeVisible();
  await expect(dialogo.getByText(/Además ganaste un Impulso/)).toBeVisible();
  await page.screenshot({ path: "test-results/coleccion-dialogo-desktop.png", fullPage: true });
  // dispatchEvent: el router.push de cierre re-renderiza la página y desmonta el diálogo
  // a mitad del click, y Playwright reintentaría sobre un nodo muerto. La espera del POST
  // evita que el reload compita con markSeen y reabra el diálogo animado bajo axe.
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/app/gh-points/coleccion") && res.request().method() === "POST",
    ),
    dialogo.getByRole("button", { name: "Ver mi colección" }).dispatchEvent("click"),
  ]);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await sinViolaciones(page);
  await page.screenshot({ path: "test-results/coleccion-desktop.png", fullPage: true });

  // Destacarla la lleva a la tarjeta del directorio (el botón de la familia Relámpago:
  // otras familias también pueden estar desbloqueadas por pruebas anteriores).
  const familia = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Relámpago", exact: true }) });
  await familia.getByRole("button", { name: "Destacar en el directorio" }).click();
  await expect(familia.getByText("Insignias destacadas")).toBeVisible();
  // El directorio pagina alfabéticamente: la búsqueda lo lleva a su tarjeta.
  await page.goto("/app/personas?q=E2E");
  const tarjeta = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Miembro E2E" }) });
  await expect(
    tarjeta.getByRole("list", { name: "Insignias destacadas" }).getByText("Relámpago · Nivel 1"),
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
    ctx.emit({
      type: "wordle.completed",
      payload: {
        personId: miembro,
        termId,
        gameId: game?.id ?? "",
        day: "2026-01-15",
        attempts: 4,
        points: 5,
      },
    }),
  );
  await drenarOutbox();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/gh-points/coleccion");
  const dialogo = page.getByRole("dialog");
  await expect(
    dialogo.getByText("Nueva insignia desbloqueada: Palabra a palabra nivel 1."),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/coleccion-dialogo-mobile.png", fullPage: true });
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/app/gh-points/coleccion") && res.request().method() === "POST",
    ),
    dialogo.getByRole("button", { name: "Ver mi colección" }).dispatchEvent("click"),
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
  await expect(admin.getByRole("heading", { name: "Conciliación histórica" })).toBeVisible();
  await admin.getByRole("button", { name: "Simular" }).click();
  await expect(admin.getByText(/En curso · \d+ personas/)).toBeVisible();
  await drenarOutbox();
  await admin.reload();
  await expect(admin.getByText(/Terminada · \d+ personas · [1-9]\d* desbloqueadas/)).toBeVisible();
  // El simulacro no escribe logros.
  await page.goto("/app/gh-points/coleccion");
  await expect(page.getByText(/Reconocida por tu historia/)).toHaveCount(0);

  await admin.getByRole("link", { name: "Aplicar" }).click();
  const panel = admin.getByRole("dialog");
  await expect(panel.getByText(/escribe logros históricos/)).toBeVisible();
  await panel.getByRole("button", { name: "Aplicar" }).click();
  await expect(admin.getByText(/En curso · \d+ personas/)).toBeVisible();
  await drenarOutbox();
  await admin.reload();
  await expect(admin.getByText(/Terminada · \d+ personas · [1-9]\d* desbloqueadas/)).toBeVisible();
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
  await expect(page.getByText("Palabra a palabra").first()).toBeVisible();
  await expect(page.getByText(/Reconocida por tu historia/)).toBeVisible();
  await sinViolaciones(page);
});
