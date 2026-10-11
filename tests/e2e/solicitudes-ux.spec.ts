import { randomBytes } from "node:crypto";
import { type BrowserContext, expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { request, task } from "@/modules/crm/schema";
import { occasion } from "@/modules/participation/schema";
import { committee, committeeMembership, consent, person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedMembership, seedPerson } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: { cookies: [], origins: [] } });

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let personId: string;
let committeeIds: string[];
let occasionId: string | null = null;
const prefix = `e2e-solicitud-ux-${randomBytes(4).toString("hex")}`;

test.beforeEach(async ({ browser }) => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  personId = await seedPerson(`${prefix}@eafit.edu.co`, {
    firstName: "Solicitud",
    lastName: "UX",
    source: "E2E",
  });
  await seedMembership(personId, current.id);
  // ADR-048: sin autorización viva no se entra a Mi OE; esta suite prueba solicitudes, no la pantalla.
  await db
    .insert(consent)
    .values({ personId, purpose: "MEMBERSHIP", source: "SELF", policyVersion: "prueba-v1" });
  const committees = await db
    .insert(committee)
    .values(
      Array.from({ length: 13 }, (_, index) => ({
        name: `${prefix} comité ${String(index).padStart(2, "0")}`,
        slug: `${prefix}-${index}`,
      })),
    )
    .returning();
  // ADR-073: uno desactivado, que no se debe ofrecer para entrar.
  const [desactivado] = await db
    .insert(committee)
    .values({
      name: `${prefix} comité desactivado`,
      slug: `${prefix}-off`,
      status: "INACTIVE",
      deactivatedOn: "2026-06-30",
    })
    .returning();
  if (!desactivado) throw new Error("No se creó el comité desactivado");
  committeeIds = [...committees.map((row) => row.id), desactivado.id];
  await db.insert(committeeMembership).values({
    personId,
    committeeId: committeeIds[0] as string,
    termId: current.id,
    roleCode: "MIEMBRO",
  });
  const context = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/ingresar/codigo?next=%2Fapp%2Fsolicitudes");
  await page.getByLabel(t("T-042")).fill(`${prefix}@eafit.edu.co`);
  await page.getByRole("button", { name: t("T-043") }).click();
  await page.getByLabel(t("T-238")).fill(process.env.OTP_FIXED_CODE ?? "123456");
  await page.getByRole("button", { name: t("T-046"), exact: true }).click();
  await expect(page).toHaveURL(/\/app\/solicitudes$/);
  cookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(cookies);
});

test.afterEach(async () => {
  await drenarOutbox();
  const db = getDb();
  if (personId) {
    await db.delete(request).where(eq(request.personId, personId));
    await db.delete(task).where(eq(task.personId, personId));
    await db.delete(person).where(eq(person.id, personId));
  }
  if (committeeIds?.length) await db.delete(committee).where(inArray(committee.id, committeeIds));
  if (occasionId) await db.delete(occasion).where(eq(occasion.id, occasionId));
  occasionId = null;
  await closeDb();
});

test("elegís un trámite y el historial conserva su contexto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/solicitudes?origen=agenda");
  await expect(page.getByRole("form", { name: t("T-1593") })).toHaveCount(0);
  await page.getByRole("link", { name: tList("T-139")[0], exact: true }).click();
  await expect(page).toHaveURL(/origen=agenda&tipo=licencia/);
  await expect(page.getByRole("form", { name: t("T-1593") })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: tList("T-139")[0], exact: true })).toBeFocused();
  await page.getByRole("link", { name: t("T-1582") }).click();
  await expect(page).toHaveURL(/solicitudes\?origen=agenda$/);
  await expect(page.getByRole("form", { name: t("T-1593") })).toHaveCount(0);
  await sinViolaciones(page);
});

test("el error de motivo conserva el texto y las casillas del cambio", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=cambio");
  const form = page.getByRole("form", { name: t("T-1593") });
  const join = form.getByRole("group", { name: t("T-885") });
  await join.getByRole("searchbox", { name: t("T-1589") }).fill(`${prefix} comité 01`);
  const chosen = join.getByRole("checkbox", { name: `${prefix} comité 01`, exact: true });
  await chosen.check();
  await form.getByLabel(t("T-880"), { exact: true }).fill("x");
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText(t("T-1584"));
  await expect(form.getByLabel(t("T-880"), { exact: true })).toBeFocused();
  await expect(form.getByLabel(t("T-880"), { exact: true })).toHaveValue("x");
  await expect(chosen).toBeChecked();
  await expect(join.getByRole("searchbox")).toHaveValue(`${prefix} comité 01`);
  // ADR-073: un comité desactivado no se ofrece para entrar, ni buscándolo por su nombre.
  await join.getByRole("searchbox").fill(`${prefix} comité desactivado`);
  await expect(join.getByRole("checkbox")).toHaveCount(0);
  await join.getByRole("searchbox").fill("sin coincidencias");
  await expect(join.getByRole("checkbox")).toHaveCount(0);
  await expect(join.getByText(t("T-1590", { n: 1 }))).toBeVisible();
  await expect(join.getByText(t("T-1591"))).toBeVisible();
  await sinViolaciones(page);
  await form.getByLabel(t("T-880"), { exact: true }).fill(`${prefix} motivo del cambio`);
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await expect(page).toHaveURL(/enviada=1#solicitudes$/);
  const item = page.getByRole("listitem").filter({ hasText: `${prefix} motivo del cambio` });
  await expect(item.getByText(tList("T-876")[0], { exact: true })).toBeVisible();
  await expect(item).toContainText(`${prefix} comité 01`);
});

test("el retiro conserva consentimiento y correo al corregir un campo", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=retiro");
  const form = page.getByRole("form", { name: t("T-1593") });
  await expect(page.getByText(t("T-143"))).toBeVisible();
  await form.getByLabel(t("T-880"), { exact: true }).fill("Motivo de prueba sintético.");
  await form.getByLabel(tList("T-888")[0], { exact: true }).check();
  await form.getByLabel(t("T-889")).fill("correo-incompleto");
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel(t("T-889"))).toBeFocused();
  await expect(form.getByLabel(t("T-889"))).toHaveValue("correo-incompleto");
  await expect(form.getByLabel(tList("T-888")[0], { exact: true })).toBeChecked();
  await expect(form.getByLabel(t("T-890"), { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await sinViolaciones(page);
});

test("un fallo de red conserva los datos y permite reintentar", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=licencia");
  const form = page.getByRole("form", { name: t("T-1593") });
  await form.getByLabel(t("T-880"), { exact: true }).fill("x");
  await form.getByLabel(t("T-881")).fill(E2E_TERM.endsOn);
  await page.route("**/app/solicitudes**", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText(t("T-1588"));
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(form.getByLabel(t("T-880"), { exact: true })).toHaveValue("x");
  await expect(form.getByLabel(t("T-881"))).toHaveValue(E2E_TERM.endsOn);
  await page.unroute("**/app/solicitudes**");
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText(t("T-1584"));
  await expect(form.getByLabel(t("T-880"), { exact: true })).toBeFocused();
  await expect(form.getByLabel(t("T-881"))).toHaveValue(E2E_TERM.endsOn);
});

// Las dos listas de la excusa (DT-258): son controladas y React reinicia el formulario cuando su acción
// termina. Con los dos rechazos, el envío que no responde y el que responde un error, lo elegido sigue a
// la vista, y el reintento lo manda: la solicitud queda con esa ocasión y esa causal.
test("la excusa conserva la ocasión y la causal cuando el envío falla o se rechaza, y el reintento las manda", async ({
  page,
}) => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const startsAt = Date.now() + 12 * 3_600_000;
  const [activity] = await db
    .insert(occasion)
    .values({
      termId: current.id,
      publicId: `e2ex${randomBytes(3).toString("hex")}`,
      title: `${prefix} actividad`,
      category: "OTHER",
      location: "Bloque 38",
      points: 0,
      status: "OPEN",
      startsAt: new Date(startsAt),
      checkInOpensAt: new Date(startsAt - 3_600_000),
      checkInClosesAt: new Date(startsAt + 3_600_000),
    })
    .returning();
  if (!activity) throw new Error("No se creó la ocasión sintética");
  occasionId = activity.id;

  await page.goto("/app/solicitudes?tipo=excusa");
  const form = page.getByRole("form", { name: t("T-1593") });
  const occasionList = form.getByLabel(tList("T-2218")[0] ?? "", { exact: true });
  const causeList = form.getByLabel(tList("T-2218")[1] ?? "", { exact: true });
  const reason = form.getByLabel(t("T-880"), { exact: true });
  const send = form.getByRole("button", { name: t("T-893"), exact: true });
  await occasionList.selectOption(activity.id);
  const cause = await causeList.locator("option").nth(1).getAttribute("value");
  if (!cause) throw new Error("El formulario no ofrece causales");
  await causeList.selectOption(cause);
  await reason.fill("x");

  await page.route("**/app/solicitudes**", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await send.click();
  await expect(form.getByRole("alert")).toHaveText(t("T-1588"));
  await expect(occasionList).toHaveValue(activity.id);
  await expect(causeList).toHaveValue(cause);
  await page.unroute("**/app/solicitudes**");

  await send.click();
  await expect(form.getByRole("alert")).toHaveText(t("T-1584"));
  await expect(occasionList).toHaveValue(activity.id);
  await expect(causeList).toHaveValue(cause);

  await reason.fill(`${prefix} motivo de la excusa`);
  await send.click();
  await expect(page).toHaveURL(/enviada=1/);
  const [saved] = await db
    .select({ occasionId: request.occasionId, payload: request.payload })
    .from(request)
    .where(and(eq(request.personId, personId), eq(request.kind, "EXCUSE")));
  expect(saved).toMatchObject({ occasionId: activity.id, payload: { cause } });
});

test("el envío bloquea cambios y dobles envíos y permite retirar la solicitud", async ({
  page,
}) => {
  await page.goto("/app/solicitudes?tipo=licencia&origen=agenda");
  const form = page.getByRole("form", { name: t("T-1593") });
  const reason = `${prefix} motivo de prueba`;
  await form.getByLabel(t("T-880"), { exact: true }).fill(reason);
  await form.getByLabel(t("T-881")).fill(E2E_TERM.endsOn);
  let release = () => {};
  let started = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let postCount = 0;
  await page.route("**/app/solicitudes**", async (route) => {
    if (route.request().method() === "POST") {
      postCount++;
      started();
      await gate;
    }
    await route.continue();
  });
  await form.getByRole("button", { name: t("T-893"), exact: true }).click();
  await requestStarted;
  try {
    await expect(form.getByLabel(t("T-880"), { exact: true })).toBeDisabled();
    await expect(form.getByRole("button", { name: t("T-1583") })).toBeDisabled();
    await form.evaluate((node: HTMLFormElement) => node.requestSubmit());
    await expect(page.getByRole("link", { name: t("T-1582") })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  } finally {
    release();
  }
  await expect(page).toHaveURL(/origen=agenda&enviada=1#solicitudes$/);
  await expect(page.getByRole("status").filter({ hasText: t("T-140") })).toBeVisible();
  expect(postCount).toBe(1);
  const item = page.getByRole("listitem").filter({ hasText: reason });
  await expect(item.getByText(tList("T-876")[0], { exact: true })).toBeVisible();
  await item.getByRole("button", { name: t("T-878"), exact: true }).click();
  await expect(page).toHaveURL(/origen=agenda&retirada=1#solicitudes$/);
  await expect(item.getByText(tList("T-876")[3], { exact: true })).toBeVisible();
  await sinViolaciones(page);
});

test("una sesión vencida vuelve al ingreso sin crear solicitudes", async ({ page, context }) => {
  const before = await getDb()
    .select({ id: request.id })
    .from(request)
    .where(eq(request.personId, personId));
  // Sin cookie verifica el proxy; una cookie inválida deja pasar al guard de la Server Action.
  for (const missingCookie of [true, false]) {
    await context.addCookies(cookies);
    await page.goto("/app/solicitudes?tipo=licencia");
    const form = page.getByRole("form", { name: t("T-1593") });
    await form.getByLabel(t("T-880"), { exact: true }).fill(`${prefix} sin sesión válida`);
    await form.getByLabel(t("T-881")).fill(E2E_TERM.endsOn);
    await context.clearCookies();
    if (!missingCookie) {
      const session = cookies.find((cookie) => cookie.name === "oe_sesion");
      if (!session) throw new Error("No se creó la sesión sintética");
      await context.addCookies([{ ...session, value: "sesion-sintetica-vencida" }]);
    }
    await form.getByRole("button", { name: t("T-893"), exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/ingresar" &&
        Boolean(url.searchParams.get("next")?.startsWith("/app/solicitudes")),
    );
    await expect(page.getByLabel(t("T-042"))).toBeVisible();
    await expect(page.getByText(t("T-1588"), { exact: true })).toHaveCount(0);
    const after = await getDb()
      .select({ id: request.id })
      .from(request)
      .where(eq(request.personId, personId));
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  }
});

test("Ajustes con sesión vencida vuelve al ingreso sin cambiar datos", async ({
  page,
  context,
}) => {
  const before = await getDb()
    .select({ phone: person.phone, personalEmail: person.personalEmail })
    .from(person)
    .where(eq(person.id, personId));
  for (const missingCookie of [true, false]) {
    await context.addCookies(cookies);
    await page.goto("/app/ajustes#mis-datos");
    const form = page.locator("form").filter({ has: page.getByLabel(t("T-404"), { exact: true }) });
    await form.getByLabel(t("T-404"), { exact: true }).fill("+573001234567");
    await context.clearCookies();
    if (!missingCookie) {
      const session = cookies.find((cookie) => cookie.name === "oe_sesion");
      if (!session) throw new Error("No se creó la sesión sintética");
      await context.addCookies([{ ...session, value: "sesion-sintetica-vencida" }]);
    }
    await form.getByRole("button", { name: t("T-253"), exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/ingresar" && url.searchParams.get("next") === "/app/ajustes",
    );
    await expect(page.getByLabel(t("T-042"))).toBeVisible();
    const after = await getDb()
      .select({ phone: person.phone, personalEmail: person.personalEmail })
      .from(person)
      .where(eq(person.id, personId));
    expect(after).toEqual(before);
  }
});

// El enlace de Mis datos navega (no lleva `download`): con la sesión vencida, el navegador sigue la
// redirección de la ruta hasta el ingreso en vez de guardar esa página como archivo, y el destino que
// el ingreso recibe es la sección de Ajustes que origina la descarga, con su aviso (ADR-113 regla 10).
// La vuelta se abre con la sesión repuesta, sin pasar otra vez por el formulario de ingreso.
test("Mis datos con sesión vencida lleva al ingreso sin descargar nada, y de vuelta en Ajustes sí descarga", async ({
  page,
  context,
}) => {
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  const link = page.getByRole("link", { name: t("T-135"), exact: true });
  const selfExports = () =>
    getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, "export.self"), eq(auditLog.entityId, personId)));
  for (const missingCookie of [true, false]) {
    await context.addCookies(cookies);
    await page.goto("/app/ajustes#privacidad");
    await expect(link).toBeVisible();
    await context.clearCookies();
    if (!missingCookie) {
      const session = cookies.find((cookie) => cookie.name === "oe_sesion");
      if (!session) throw new Error("No se creó la sesión sintética");
      await context.addCookies([{ ...session, value: "sesion-sintetica-vencida" }]);
    }
    await link.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/ingresar" && url.searchParams.get("next") === "/app/ajustes?descarga=1",
    );
    await expect(page.getByLabel(t("T-042"))).toBeVisible();
  }
  expect(downloads).toEqual([]);
  expect(await selfExports()).toEqual([]);

  const next = new URL(page.url()).searchParams.get("next");
  if (!next) throw new Error("El ingreso no recibió a dónde volver");
  await context.addCookies(cookies);
  await page.goto(next);
  await expect(page.getByText(t("T-3211"), { exact: true })).toBeVisible();
  // Volver no descarga solo: la persona hace clic otra vez.
  expect(await selfExports()).toEqual([]);
  const download = page.waitForEvent("download");
  await link.click();
  expect((await download).suggestedFilename()).toMatch(/^mis-datos-.+\.json$/);
  await expect.poll(selfExports).toHaveLength(1);
});
