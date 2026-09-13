import { randomBytes } from "node:crypto";
import { type BrowserContext, expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { request, task } from "@/modules/crm/schema";
import {
  committee,
  committeeMembership,
  consent,
  membership,
  person,
} from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: { cookies: [], origins: [] } });

let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let personId: string;
let committeeIds: string[];
const prefix = `e2e-solicitud-ux-${randomBytes(4).toString("hex")}`;

test.beforeEach(async ({ browser }) => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const [who] = await db
    .insert(person)
    .values({
      email: `${prefix}@eafit.edu.co`,
      firstName: "Solicitud",
      lastName: "UX",
      stage: "MEMBER",
      source: "E2E",
    })
    .returning();
  if (!who) throw new Error("No se creó el miembro sintético");
  personId = who.id;
  await db.insert(membership).values({ personId, status: "ACTIVE", firstTermId: current.id });
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
  committeeIds = committees.map((row) => row.id);
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
  await page.getByLabel("Correo @eafit.edu.co").fill(`${prefix}@eafit.edu.co`);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(process.env.OTP_FIXED_CODE ?? "123456");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
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
  await closeDb();
});

test("elegís un trámite y el historial conserva su contexto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/solicitudes?origen=agenda");
  await expect(page.getByRole("form", { name: "Datos de la solicitud" })).toHaveCount(0);
  await page.getByRole("link", { name: "Pedir licencia", exact: true }).click();
  await expect(page).toHaveURL(/origen=agenda&tipo=licencia/);
  await expect(page.getByRole("form", { name: "Datos de la solicitud" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Pedir licencia", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "Cambiar de trámite" }).click();
  await expect(page).toHaveURL(/solicitudes\?origen=agenda$/);
  await expect(page.getByRole("form", { name: "Datos de la solicitud" })).toHaveCount(0);
  await sinViolaciones(page);
});

test("el error de motivo conserva el texto y las casillas del cambio", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=cambio");
  const form = page.getByRole("form", { name: "Datos de la solicitud" });
  const join = form.getByRole("group", { name: "Comités a los que entrás" });
  await join.getByRole("searchbox", { name: "Buscá un comité" }).fill(`${prefix} comité 01`);
  const chosen = join.getByRole("checkbox", { name: `${prefix} comité 01`, exact: true });
  await chosen.check();
  await form.getByLabel("Contanos por qué", { exact: true }).fill("x");
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Revisá los campos señalados antes de enviar.");
  await expect(form.getByLabel("Contanos por qué", { exact: true })).toBeFocused();
  await expect(form.getByLabel("Contanos por qué", { exact: true })).toHaveValue("x");
  await expect(chosen).toBeChecked();
  await expect(join.getByRole("searchbox")).toHaveValue(`${prefix} comité 01`);
  await join.getByRole("searchbox").fill("sin coincidencias");
  await expect(join.getByRole("checkbox")).toHaveCount(0);
  await expect(join.getByText("Seleccionados: 1")).toBeVisible();
  await expect(join.getByText("No hay comités para esa búsqueda.")).toBeVisible();
  await sinViolaciones(page);
  await form.getByLabel("Contanos por qué", { exact: true }).fill(`${prefix} motivo del cambio`);
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(page).toHaveURL(/enviada=1#solicitudes$/);
  const item = page.getByRole("listitem").filter({ hasText: `${prefix} motivo del cambio` });
  await expect(item.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(item).toContainText(`${prefix} comité 01`);
});

test("el retiro conserva consentimiento y correo al corregir un campo", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=retiro");
  const form = page.getByRole("form", { name: "Datos de la solicitud" });
  await expect(
    page.getByText(
      "¿Seguro querés retirarte de la OE? Tu historia se conserva, pero no vas a poder volver a entrar a Mi OE.",
    ),
  ).toBeVisible();
  await form.getByLabel("Contanos por qué", { exact: true }).fill("Motivo de prueba sintético.");
  await form.getByLabel("Quiero aparecer en la galería de egresados", { exact: true }).check();
  await form.getByLabel("Correo personal para contactarte (opcional)").fill("correo-incompleto");
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Correo personal para contactarte (opcional)")).toBeFocused();
  await expect(form.getByLabel("Correo personal para contactarte (opcional)")).toHaveValue(
    "correo-incompleto",
  );
  await expect(
    form.getByLabel("Quiero aparecer en la galería de egresados", { exact: true }),
  ).toBeChecked();
  await expect(
    form.getByLabel("Entiendo que al aprobarse mi retiro pierdo el acceso a Mi OE.", {
      exact: true,
    }),
  ).toHaveAttribute("aria-invalid", "true");
  await sinViolaciones(page);
});

test("un fallo de red conserva los datos y permite reintentar", async ({ page }) => {
  await page.goto("/app/solicitudes?tipo=licencia");
  const form = page.getByRole("form", { name: "Datos de la solicitud" });
  await form.getByLabel("Contanos por qué", { exact: true }).fill("x");
  await form.getByLabel("Hasta cuándo volvés").fill(E2E_TERM.endsOn);
  await page.route("**/app/solicitudes**", async (route) => {
    if (route.request().method() === "POST") await route.abort("failed");
    else await route.continue();
  });
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "No pudimos confirmar el envío. Tus datos siguen acá; intentá de nuevo.",
  );
  await expect(form.getByRole("alert")).toBeFocused();
  await expect(form.getByLabel("Contanos por qué", { exact: true })).toHaveValue("x");
  await expect(form.getByLabel("Hasta cuándo volvés")).toHaveValue(E2E_TERM.endsOn);
  await page.unroute("**/app/solicitudes**");
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Revisá los campos señalados antes de enviar.");
  await expect(form.getByLabel("Contanos por qué", { exact: true })).toBeFocused();
  await expect(form.getByLabel("Hasta cuándo volvés")).toHaveValue(E2E_TERM.endsOn);
});

test("el envío bloquea cambios y dobles envíos y permite retirar la solicitud", async ({
  page,
}) => {
  await page.goto("/app/solicitudes?tipo=licencia&origen=agenda");
  const form = page.getByRole("form", { name: "Datos de la solicitud" });
  const reason = `${prefix} motivo de prueba`;
  await form.getByLabel("Contanos por qué", { exact: true }).fill(reason);
  await form.getByLabel("Hasta cuándo volvés").fill(E2E_TERM.endsOn);
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
  await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
  await requestStarted;
  try {
    await expect(form.getByLabel("Contanos por qué", { exact: true })).toBeDisabled();
    await expect(form.getByRole("button", { name: "Enviando solicitud…" })).toBeDisabled();
    await form.evaluate((node: HTMLFormElement) => node.requestSubmit());
    await expect(page.getByRole("link", { name: "Cambiar de trámite" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  } finally {
    release();
  }
  await expect(page).toHaveURL(/origen=agenda&enviada=1#solicitudes$/);
  await expect(
    page.getByRole("status").filter({ hasText: "Tu solicitud llegó a GH." }),
  ).toBeVisible();
  expect(postCount).toBe(1);
  const item = page.getByRole("listitem").filter({ hasText: reason });
  await expect(item.getByText("Pendiente", { exact: true })).toBeVisible();
  await item.getByRole("button", { name: "Retirar solicitud", exact: true }).click();
  await expect(page).toHaveURL(/origen=agenda&retirada=1#solicitudes$/);
  await expect(item.getByText("Retirada", { exact: true })).toBeVisible();
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
    const form = page.getByRole("form", { name: "Datos de la solicitud" });
    await form.getByLabel("Contanos por qué", { exact: true }).fill(`${prefix} sin sesión válida`);
    await form.getByLabel("Hasta cuándo volvés").fill(E2E_TERM.endsOn);
    await context.clearCookies();
    if (!missingCookie) {
      const session = cookies.find((cookie) => cookie.name === "oe_sesion");
      if (!session) throw new Error("No se creó la sesión sintética");
      await context.addCookies([{ ...session, value: "sesion-sintetica-vencida" }]);
    }
    await form.getByRole("button", { name: "Enviar solicitud", exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/ingresar" &&
        Boolean(url.searchParams.get("next")?.startsWith("/app/solicitudes")),
    );
    await expect(page.getByLabel("Correo @eafit.edu.co")).toBeVisible();
    await expect(
      page.getByText("No pudimos confirmar el envío. Tus datos siguen acá; intentá de nuevo.", {
        exact: true,
      }),
    ).toHaveCount(0);
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
    const form = page.locator("form").filter({ has: page.getByLabel("Celular", { exact: true }) });
    await form.getByLabel("Celular", { exact: true }).fill("+573001234567");
    await context.clearCookies();
    if (!missingCookie) {
      const session = cookies.find((cookie) => cookie.name === "oe_sesion");
      if (!session) throw new Error("No se creó la sesión sintética");
      await context.addCookies([{ ...session, value: "sesion-sintetica-vencida" }]);
    }
    await form.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === "/ingresar" && url.searchParams.get("next") === "/app/ajustes",
    );
    await expect(page.getByLabel("Correo @eafit.edu.co")).toBeVisible();
    const after = await getDb()
      .select({ phone: person.phone, personalEmail: person.personalEmail })
      .from(person)
      .where(eq(person.id, personId));
    expect(after).toEqual(before);
  }
});
