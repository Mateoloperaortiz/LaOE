import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  advanceRotationAs,
  assignStaffAs,
  type CompetitionActor,
  createCompetitionAs,
  createExtraAs,
  createTeamAs,
  generateDayScheduleAs,
  saveBaseAs,
} from "@/modules/competition";
import { event, eventEdition } from "@/modules/events/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { withinTermInput } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// The Games (ADR-089, ADR-090): el operador genera la jornada, avanza y registra un resultado; el juez
// registra desde el celular en su base; la vitrina sale con CORS y sin datos personales.

async function personId(email: string): Promise<string> {
  const [row] = await getDb().select({ id: person.id }).from(person).where(eq(person.email, email));
  if (!row) throw new Error(`Falta la persona sintética ${email}`);
  return row.id;
}

/** Una competencia de 6 equipos y 3 bases por jornada, sembrada con los comandos del dominio. */
async function seedCompetition(slug: string) {
  const db = getDb();
  const [dias] = await db.select().from(event).where(eq(event.slug, "dias-eafit"));
  if (!dias) throw new Error("Falta el evento dias-eafit");
  const [edition] = await db
    .insert(eventEdition)
    .values({
      eventId: dias.id,
      slug: `edicion-${slug}`,
      name: `Edición ${slug}`,
      startsAt: new Date(`${withinTermInput()}-05:00`),
    })
    .returning({ id: eventEdition.id });
  if (!edition) throw new Error("No se creó la edición");
  const admin: CompetitionActor = { personId: await personId(E2E_EMAIL), isAdmin: true };
  const { id } = await createCompetitionAs(admin, {
    editionId: edition.id,
    slug,
    name: "The Games de prueba",
  });
  for (let n = 1; n <= 6; n++) {
    await createTeamAs(admin, id, { number: n, name: `Equipo sintético ${n}` });
  }
  const bases: string[] = [];
  for (let i = 0; i < 3; i++) {
    const base = await saveBaseAs(admin, id, null, {
      day: 1,
      orderIndex: i,
      name: `Base sintética ${i + 1}`,
      kind: i === 2 ? "MACRO" : "NORMAL",
    });
    bases.push(base.id);
  }
  return { id, admin, bases };
}

test.describe("operador", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("genera la jornada, avanza, registra un resultado y publica la vitrina", async ({
    page,
    request,
  }) => {
    const { id } = await seedCompetition("the-games-e2e");
    await page.goto("/admin/the-games");
    await page.getByRole("link", { name: "The Games de prueba" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Games de prueba");

    await page.goto(`/admin/the-games/${id}?area=rotaciones`);
    const [rotaciones, minutos] = tList("T-2832");
    await page
      .getByLabel(rotaciones ?? "")
      .first()
      .fill("3");
    await page
      .getByLabel(minutos ?? "")
      .first()
      .fill("15");
    await page.getByRole("button", { name: t("T-2831", { dia: 1 }) }).click();
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
    await expect(page.getByText(t("T-2843"))).toBeVisible();
    await page.getByRole("button", { name: tList("T-2835")[3] }).click();
    await expect(page.getByText(t("T-2837", { n: 1, dia: 1 })).first()).toBeVisible();

    await page.goto(`/admin/the-games/${id}?area=resultados`);
    await sinViolaciones(page);
    await page.getByRole("button", { name: t("T-2846", { equipo: "Equipo sintético 1" }) }).click();
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();

    await page.goto(`/admin/the-games/${id}?area=posiciones`);
    const first = page.getByRole("row").nth(1);
    await expect(first).toContainText("Equipo sintético 1");
    await expect(first).toContainText("1000");

    await page.goto(`/admin/the-games/${id}?area=resumen`);
    await page.getByRole("button", { name: tList("T-2808")[1] }).click();
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
    const response = await request.get("/api/v1/the-games/the-games-e2e", {
      headers: { origin: "http://localhost:3101" },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("max-age=5");
    const body = await response.json();
    expect(body.version).toBe(1);
    expect(body.currentRotation.matchups).toHaveLength(3);
    expect(JSON.stringify(body)).not.toContain("@");
  });
});

test.describe("rúbrica", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("el operador carga las notas de The Challenge y el equipo suma el total × 10", async ({
    page,
  }) => {
    const { id, admin } = await seedCompetition("the-games-rubrica");
    await createExtraAs(admin, id, {
      name: "Competencia de talentos",
      day: 1,
      kind: "THE_CHALLENGE_RUBRIC",
    });
    await page.goto(`/admin/the-games/${id}?area=extras`);
    await page.getByText(`Competencia de talentos · ${t("T-2825", { dia: 1 })}`).click();
    const row = page
      .locator("li")
      .filter({ has: page.getByText("Equipo sintético 1", { exact: true }) })
      .filter({ has: page.locator('input[name="scores"]') })
      .first();
    await expect(row.getByText(t("T-2897"))).toBeVisible();
    for (const input of await row.locator('input[name="scores"]').all()) await input.fill("10");
    await row.getByRole("button", { name: t("T-253") }).click();
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
    await sinViolaciones(page);
    await page.getByText(`Competencia de talentos · ${t("T-2825", { dia: 1 })}`).click();
    await expect(
      page.getByText(t("T-2896", { total: "100", nivel: tList("T-2895")[0] ?? "", puntos: 1000 })),
    ).toBeVisible();
    await page.goto(`/admin/the-games/${id}?area=posiciones&alcance=day1`);
    await expect(page.getByRole("row").nth(1)).toContainText("1000");
  });
});

test.describe("juez", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json", viewport: { width: 390, height: 844 } });

  test("registra el resultado de su base desde el celular", async ({ page }) => {
    const { id, admin, bases } = await seedCompetition("the-games-juez");
    await assignStaffAs(admin, id, {
      personId: await personId(E2E_MEMBER_EMAIL),
      role: "JUDGE",
      baseId: bases[0] ?? "",
    });
    await generateDayScheduleAs(admin, id, { day: 1, rotations: 3, plannedMinutes: 15 });
    await advanceRotationAs(admin, id);

    await page.goto("/admin");
    await expect(page).toHaveURL(new RegExp(`/admin/the-games/${id}/juez`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-2875"));
    await sinViolaciones(page);
    await page.getByRole("button", { name: t("T-2847") }).click();
    await expect(page.getByText(t("T-2879", { resultado: t("T-2847") }))).toBeVisible();
  });
});
