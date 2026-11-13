import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { appointment, boardCalendarEvent, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedAppointment } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El calendario de la junta (ADR-197 regla 6): quien tiene un cargo de la junta agenda por su área o por
// la junta en pleno; las fechas salen en la capa «Junta» del Calendario y lo que cae a la misma hora se
// marca como cruce. Sin Google configurado, la pantalla lo dice y todo queda en la casa. ADMIN lo ve
// sin agendar. El miembro de pruebas es Presidencia solo durante la prueba.

const marca = randomBytes(3).toString("hex");
// Un día dentro de cinco semanas: la pantalla muestra lo de los próximos meses.
const dia = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const diaVisible = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
}).format(new Date(`${dia}T12:00:00Z`));
const limpiar: string[] = [];

test.afterEach(async () => {
  if (limpiar.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, limpiar.splice(0)));
  await getDb()
    .delete(boardCalendarEvent)
    .where(like(boardCalendarEvent.title, `e2e-%${marca}%`));
  await closeDb();
});

test.describe("la Presidencia", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("agenda dos fechas que se cruzan y las ve en la capa «Junta» del Calendario", async ({
    page,
  }) => {
    const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
    const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!current || !member) throw new Error("Faltan el semestre y el miembro sintéticos");
    limpiar.push(await seedAppointment(member.id, current.id, "PRESIDENT"));
    await closeDb();

    const [titulo] = tList("T-5115");
    const [que, area, empieza, termina, lugar] = tList("T-5116");
    const [agregar, , , , listo] = tList("T-5117");
    const [, , apagada] = tList("T-5119");

    await page.goto("/admin/calendario/junta");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await expect(page.getByText(apagada ?? "")).toBeVisible();
    await sinViolaciones(page);

    const agendar = async (nombre: string, cargo: string, desde: string, hasta: string) => {
      await page.getByLabel(que ?? "", { exact: true }).fill(nombre);
      await page.getByLabel(area ?? "", { exact: true }).selectOption(cargo);
      await page.getByLabel(empieza ?? "", { exact: true }).fill(desde);
      await page.getByLabel(termina ?? "", { exact: true }).fill(hasta);
      await page.getByLabel(lugar ?? "", { exact: true }).fill("Bloque 29");
      await page.getByRole("button", { name: agregar ?? "", exact: true }).click();
      // El aviso de la fecha anterior sigue en pantalla: se espera a ver la nueva en la lista.
      await expect(page.getByRole("listitem").filter({ hasText: nombre })).toBeVisible();
      await expect(page.getByText(listo ?? "", { exact: true })).toBeVisible();
    };
    await agendar(`e2e-Reunión de junta ${marca}`, "BOARD", `${dia}T18:00`, `${dia}T20:00`);
    await agendar(
      `e2e-Cierre de presupuesto ${marca}`,
      "PRESIDENT",
      `${dia}T19:00`,
      `${dia}T21:00`,
    );

    const [guardada] = await getDb()
      .select()
      .from(boardCalendarEvent)
      .where(eq(boardCalendarEvent.title, `e2e-Reunión de junta ${marca}`));
    expect(guardada).toMatchObject({
      area: "BOARD",
      origin: "CASA",
      createdById: member.id,
      startsAt: new Date(`${dia}T23:00:00Z`),
    });
    await closeDb();

    await page.goto(`/admin/calendario?vista=semana&fecha=${dia}`);
    const region = page.getByRole("region", { name: new RegExp(diaVisible) });
    const [cruce] = tList("T-5122");
    for (const nombre of [`e2e-Reunión de junta ${marca}`, `e2e-Cierre de presupuesto ${marca}`]) {
      const enlace = region.getByRole("link", { name: new RegExp(nombre) });
      await expect(enlace).toBeVisible();
      await expect(enlace.getByText(cruce ?? "", { exact: true })).toBeVisible();
    }
    await sinViolaciones(page);
  });
});

test.describe("ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ve el calendario de la junta, pero no agenda: agenda quien tiene el cargo", async ({
    page,
  }) => {
    await page.goto("/admin/calendario/junta");
    const [titulo] = tList("T-5115");
    const [agregar] = tList("T-5117");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await expect(page.getByRole("button", { name: agregar ?? "", exact: true })).toHaveCount(0);
  });
});
