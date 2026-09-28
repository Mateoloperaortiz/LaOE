import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  advanceRotationAs,
  assignStaffAs,
  type CompetitionActor,
  createCompetitionAs,
  createExtraAs,
  createMarketAs,
  createTeamAs,
  formatTeamCode,
  generateDayScheduleAs,
  grantStartingCreditsAs,
  issueTeamCodesAs,
  saveBaseAs,
  setCompetitionStatusAs,
  setMarketOpenAs,
  updateCompetitionSettingsAs,
} from "@/modules/competition";
import { dayOneRounds } from "@/modules/competition/domain/schedule-pure";
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

test.describe("importar", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("importa la jornada pegando la hoja y conserva la hoja si hay que corregirla", async ({
    page,
  }) => {
    const { id } = await seedCompetition("the-games-importar");
    const sheet = (nameOf: (seed: number) => string) => {
      const lines = ["Equipo\tRotacion\tBase\tRival"];
      for (const [index, round] of dayOneRounds(3).entries()) {
        for (const { base, a, b } of round) {
          lines.push(`${nameOf(a)}\t${index + 1}\t${base + 1}\t${nameOf(b)}`);
          lines.push(`${nameOf(b)}\t${index + 1}\t${base + 1}\t${nameOf(a)}`);
        }
      }
      return lines.join("\n");
    };
    await page.goto(`/admin/the-games/${id}?area=rotaciones`);
    const importer = page.locator("details").filter({ hasText: t("T-2902", { dia: 1 }) });
    await importer.getByText(t("T-2902", { dia: 1 })).click();
    const [hoja, minutos] = tList("T-2904");
    const typo = sheet((seed) =>
      seed === 4 ? "Equipo sintetico cuatro" : `Equipo sintético ${seed}`,
    );
    await importer.getByLabel(hoja ?? "").fill(typo);
    await importer.getByLabel(minutos ?? "").fill("15");
    await importer.getByRole("button", { name: t("T-2905", { dia: 1 }) }).click();
    await expect(importer.getByText(t("T-2924"))).toBeVisible();
    await expect(
      importer.getByText(t("T-2917", { nombre: "Equipo sintetico cuatro" })),
    ).toBeVisible();
    await expect(importer.getByLabel(hoja ?? "")).toHaveValue(typo);
    await sinViolaciones(page);

    await importer.getByLabel(hoja ?? "").fill(sheet((seed) => `equipo sintético ${seed}`));
    await importer.getByRole("button", { name: t("T-2905", { dia: 1 }) }).click();
    await expect(
      page.getByText(
        t("T-2908", { dia: 1, rotaciones: 3, enfrentamientos: 9, equipos: 0, bases: 0 }),
      ),
    ).toBeVisible();
    await expect(page.getByText(t("T-2837", { n: 3, dia: 1 })).first()).toBeVisible();
    await expect(page.getByText(t("T-2843"))).toBeVisible();
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

test.describe("capitanes", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("el ADMIN pega tres columnas, la operación los ve y la vitrina lleva solo los nombres", async ({
    page,
    request,
  }) => {
    const { id, admin } = await seedCompetition("the-games-capitanes");
    await page.goto(`/admin/the-games/${id}?area=equipos`);
    const importer = page.locator("details").filter({ hasText: t("T-3017") });
    await importer.getByText(t("T-3017")).click();
    const campo = importer.getByLabel(t("T-3018"));
    // La fila completa de la hoja (sintética) no entra: trae más de tres columnas.
    const completa = "Equipo 1\tAna Sintética\t3000000001\t1000000000\tO+";
    await campo.fill(completa);
    await importer.getByRole("button", { name: t("T-3019") }).click();
    await expect(importer.getByText(t("T-3023", { linea: 1 }))).toBeVisible();
    await expect(campo).toHaveValue(completa);
    await sinViolaciones(page);

    await campo.fill(
      [
        "Equipo\tNombre\tCelular",
        "Equipo 1\tAna Sintética\t300 000 0001",
        "1\tLuis Sintético\t3000000002",
        "Equipo sintético 2\tSara Sintética\t",
      ].join("\n"),
    );
    await importer.getByRole("button", { name: t("T-3019") }).click();
    await expect(page.getByText(t("T-3021", { capitanes: 3, equipos: 2 }))).toBeVisible();
    const fila = page.getByRole("row").filter({ hasText: "Equipo sintético 1" });
    await expect(fila).toContainText("Luis Sintético");
    await expect(
      fila.getByRole("link", { name: `${t("T-3035", { nombre: "Ana Sintética" })} 300 000 0001` }),
    ).toHaveAttribute("href", "tel:+573000000001");
    await sinViolaciones(page);

    await page.getByRole("button", { name: tList("T-3031")[0] }).click();
    await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();
    await expect(page.getByText(tList("T-3030")[0] ?? "")).toBeVisible();
    await setCompetitionStatusAs(admin, id, "LIVE");
    const response = await request.get("/api/v1/the-games/the-games-capitanes", {
      headers: { origin: "http://localhost:3101" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.captains).toEqual([
      { number: 1, names: ["Ana Sintética", "Luis Sintético"] },
      { number: 2, names: ["Sara Sintética"] },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/300000000\d/);
  });
});

test.describe("hub de capitanes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("la API del hub: entrar con el código del equipo, apostar, ver la apuesta y salir", async ({
    request,
  }) => {
    const { id, admin } = await seedCompetition("the-games-hub");
    await updateCompetitionSettingsAs(admin, id, {
      name: "The Games de prueba",
      bettingEnabled: true,
      startingCredits: 1000,
    });
    await setCompetitionStatusAs(admin, id, "LIVE");
    await grantStartingCreditsAs(admin, id);
    const codes = await issueTeamCodesAs(admin, id, false);
    const team = (n: number) => {
      const item = codes.find((code) => code.number === n);
      if (!item) throw new Error(`Falta el código del equipo ${n}`);
      return item;
    };
    const market = await createMarketAs(admin, id, {
      title: "¿Quién gana la base 1?",
      teamIds: [team(2).teamId, team(3).teamId],
    });
    await setMarketOpenAs(admin, id, market.id, true);

    // DÍAS en local; la casa de las pruebas lo tiene en PUBLIC_API_ORIGINS.
    const origin = "http://localhost:3101";
    const json = { origin, "content-type": "application/json" };
    const hub = "/api/v1/the-games/hub";

    const anon = await request.get(hub, { headers: { origin } });
    expect(anon.status()).toBe(401);
    expect(anon.headers()["access-control-allow-origin"]).toBe(origin);
    expect(anon.headers()["access-control-allow-credentials"]).toBe("true");
    expect(anon.headers()["cache-control"]).toBe("no-store");

    const foreign = await request.post(`${hub}/sesion`, {
      headers: { origin: "https://otro.example", "content-type": "application/json" },
      data: { code: team(1).code },
    });
    expect(foreign.status()).toBe(403);

    const wrong = await request.post(`${hub}/sesion`, {
      headers: json,
      data: { code: "ZZZZ-ZZZZ" },
    });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe(t("T-3036"));

    const entered = await request.post(`${hub}/sesion`, {
      headers: json,
      data: { code: formatTeamCode(team(1).code).toLowerCase() },
    });
    expect(entered.status()).toBe(200);
    expect(entered.headers()["set-cookie"]).toContain("HttpOnly");
    expect(await entered.json()).toMatchObject({
      version: 1,
      team: { number: 1, name: "Equipo sintético 1" },
      balance: 1000,
      markets: [{ id: market.id, myBet: null }],
    });

    const bet = await request.post(`${hub}/apuestas`, {
      headers: json,
      data: { marketId: market.id, pick: 2, stake: 300 },
    });
    expect(bet.status()).toBe(200);
    expect(await bet.json()).toMatchObject({
      balance: 700,
      markets: [{ myBet: { pick: 2, stake: 300 } }],
      bets: [{ pick: { number: 2 }, stake: 300, result: "PENDING" }],
    });
    const again = await request.post(`${hub}/apuestas`, {
      headers: json,
      data: { marketId: market.id, pick: 3, stake: 100 },
    });
    expect(again.status()).toBe(400);
    expect((await again.json()).error).toBe(t("T-2783"));

    const state = await request.get(hub, { headers: { origin } });
    expect(state.status()).toBe(200);
    expect(JSON.stringify(await state.json())).not.toContain(team(1).teamId);

    const out = await request.delete(`${hub}/sesion`, { headers: { origin } });
    expect(out.status()).toBe(200);
    expect((await request.get(hub, { headers: { origin } })).status()).toBe(401);
  });
});
