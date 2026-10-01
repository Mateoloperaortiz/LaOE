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
  deliverPowerGrantsAs,
  formatTeamCode,
  generateDayScheduleAs,
  grantStartingCreditsAs,
  importPowerGrantsAs,
  importStaffSheetAs,
  issueTeamCodesAs,
  saveBaseAs,
  setCompetitionStatusAs,
  setMarketOpenAs,
  updateCompetitionSettingsAs,
} from "@/modules/competition";
import { HUB_TERMS_VERSION } from "@/modules/competition/domain/hub-pure";
import { dayOneRounds } from "@/modules/competition/domain/schedule-pure";
import { event, eventEdition } from "@/modules/events/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM, withinTermInput } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// The Games (ADR-089, ADR-090): el operador genera la jornada, avanza y registra un resultado; el juez
// registra desde el celular en su base; la vitrina sale con CORS y sin datos personales. Con poderes
// (ADR-098), el líder registra las tarjetas, empieza la base y ve el resultado oficial. El personal de
// cada base sale de la hoja del GAP (ADR-101), con nombres sintéticos.

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

    // El recorrido del equipo 1 (ADR-097): tres rotaciones y ganó la primera.
    const route = await request.get("/api/v1/the-games/the-games-e2e/equipos/1", {
      headers: { origin: "http://localhost:3101" },
    });
    expect(route.status()).toBe(200);
    const recorrido = await route.json();
    expect(recorrido.team).toMatchObject({ number: 1, name: "Equipo sintético 1" });
    expect(recorrido.stops).toHaveLength(3);
    expect(recorrido.stops[0]).toMatchObject({ day: 1, rotation: 1, result: "WIN" });
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

test.describe("poderes", () => {
  test.describe("líder de base", () => {
    test.use({
      storageState: "tests/e2e/.auth/member.json",
      viewport: { width: 390, height: 844 },
    });

    test("registra las tarjetas, empieza la base y la cuenta del minuto sigue al recargar", async ({
      page,
    }) => {
      const { id, admin, bases } = await seedCompetition("the-games-poderes");
      await assignStaffAs(admin, id, {
        personId: await personId(E2E_MEMBER_EMAIL),
        role: "JUDGE",
        baseId: bases[0] ?? "",
      });
      await generateDayScheduleAs(admin, id, { day: 1, rotations: 3, plannedMinutes: 15 });
      // En la rotación 1, la base 1 la juegan el equipo 1 y el 6.
      await importPowerGrantsAs(admin, id, {
        text: "1\tMultiplicador x2\tjueves\n6\t1 min tarde\tjueves",
      });
      await deliverPowerGrantsAs(admin, id, { day: 1 });
      await advanceRotationAs(admin, id);
      const [x2, tarde] = tList("T-3040").filter((_, index) => index === 1 || index === 3);

      await page.goto("/admin");
      await expect(page).toHaveURL(new RegExp(`/admin/the-games/${id}/juez`));
      await sinViolaciones(page);
      await page.getByText(t("T-3098", { poder: x2 ?? "", n: 1 }), { exact: true }).click();
      await page.getByRole("button", { name: t("T-3101") }).click();
      await expect(
        page.getByText(t("T-3115", { poder: x2 ?? "", equipo: "Equipo sintético 1" })),
      ).toBeVisible();
      await page.getByText(t("T-3098", { poder: tarde ?? "", n: 1 }), { exact: true }).click();
      await page.getByRole("button", { name: t("T-3101") }).click();
      await page.getByText(t("T-3104"), { exact: true }).click();
      await page.getByRole("button", { name: t("T-3106") }).click();
      await expect(page.getByText(t("T-3117"))).toBeVisible();

      const waiting = page.getByText(t("T-3108", { equipo: "Equipo sintético 1" }));
      await expect(waiting).toBeVisible();
      const clock = page.getByText(/^0:\d\d$/);
      const seconds = async () => Number((await clock.textContent())?.split(":")[1] ?? "99");
      const before = await seconds();
      await page.reload();
      await expect(waiting).toBeVisible();
      expect(await seconds()).toBeLessThanOrEqual(before);
      await sinViolaciones(page);

      await page
        .getByRole("button", { name: t("T-2846", { equipo: "Equipo sintético 1" }) })
        .click();
      await expect(
        page.getByText(
          t("T-3113", {
            equipo: "Equipo sintético 1",
            total: "2.000",
            base: "1.000",
            bono: "1.000",
          }),
        ),
      ).toBeVisible();
    });
  });

  test.describe("operación", () => {
    test.use({ storageState: "tests/e2e/.auth/admin.json" });

    test("pega el reparto, corrige una línea mala y entrega las tarjetas del jueves", async ({
      page,
    }) => {
      const { id } = await seedCompetition("the-games-reparto");
      await page.goto(`/admin/the-games/${id}?area=poderes`);
      await expect(page.getByRole("heading", { name: t("T-3076") })).toBeVisible();
      const sheet = page.getByLabel(t("T-3066"));
      await sheet.fill("1\tMultiplicador x2\tjueves\n2\tSúper poder\tjueves");
      await page.getByRole("button", { name: t("T-3067") }).click();
      await expect(page.getByText(t("T-3071", { linea: 2, poder: "Súper poder" }))).toBeVisible();
      await sinViolaciones(page);
      await sheet.fill("1\tMultiplicador x2\tjueves\n2\tCambio de resultados\tjueves");
      await page.getByRole("button", { name: t("T-3067") }).click();
      await expect(page.getByText(t("T-3068", { tarjetas: 2, equipos: 2 }))).toBeVisible();
      await page
        .getByRole("button", {
          name: t("T-3080", { dia: tList("T-3048")[0]?.toLowerCase() ?? "" }),
        })
        .click();
      await expect(
        page.getByText(t("T-3077", { entregadas: 2, total: 2, completos: 0, equipos: 6 })),
      ).toBeVisible();
      await sinViolaciones(page);
    });
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

    // La primera vez hay que aceptar las instrucciones del hub (ADR-099).
    const terms = await request.post(`${hub}/sesion`, {
      headers: json,
      data: { code: formatTeamCode(team(1).code).toLowerCase() },
    });
    expect(terms.status()).toBe(409);
    expect(await terms.json()).toEqual({ error: t("T-3120"), terms: HUB_TERMS_VERSION });

    const entered = await request.post(`${hub}/sesion`, {
      headers: json,
      data: { code: formatTeamCode(team(1).code).toLowerCase(), accept: HUB_TERMS_VERSION },
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

/** Un miembro activo sintético para la hoja del GAP; el escenario restaura la base al terminar. */
async function seedHelper(email: string, firstName: string, lastName: string): Promise<void> {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  const [row] = await db
    .insert(person)
    .values({ email, firstName, lastName, stage: "MEMBER", source: "E2E" })
    .returning({ id: person.id });
  if (!current || !row) throw new Error("No se creó el miembro sintético");
  await db
    .insert(membership)
    .values({ personId: row.id, status: "ACTIVE", firstTermId: current.id });
}

test.describe("personal desde la hoja del GAP", () => {
  test.describe("operación", () => {
    test.use({ storageState: "tests/e2e/.auth/admin.json" });

    test("revisa la hoja, corrige una línea, guarda y ve cada base con su gente", async ({
      page,
    }) => {
      const { id } = await seedCompetition("the-games-personal");
      await seedHelper("calificadora.personal@eafit.edu.co", "Calificadora", "Personal Sintética");
      await seedHelper("veedor.personal@eafit.edu.co", "Veedor", "Personal Sintético");

      await page.goto(`/admin/the-games/${id}?area=personal`);
      await page.getByText(t("T-3124"), { exact: true }).click();
      const sheet = page.getByLabel(t("T-3126"));
      const lines = [
        "PERSONA\tBASE\tFUNCION",
        "MIEMBRO E2E\t1\tLIDER DE BASE",
        "CALIFICADORA PERSONAL\t\tCALIFICADOR",
      ];
      await sheet.fill([...lines, "XQZ WVK\t\tVEEDORES"].join("\n"));
      await page.getByRole("button", { name: t("T-3128") }).click();
      const missing = t("T-3147", { linea: 4, nombre: "XQZ WVK" }).split(" entre")[0] ?? "";
      await expect(page.getByText(missing)).toBeVisible();
      await sinViolaciones(page);

      await sheet.fill([...lines, "VEEDOR PERSONAL SINTETICO\t\tVEEDORES"].join("\n"));
      await page.getByRole("button", { name: t("T-3128") }).click();
      await expect(
        page.getByText(
          t("T-3133", {
            linea: 3,
            hoja: "CALIFICADORA PERSONAL",
            nombre: "Calificadora Personal Sintética",
          }),
        ),
      ).toBeVisible();
      await sinViolaciones(page);
      await page.getByRole("button", { name: t("T-3129", { dia: "jueves" }) }).click();
      await expect(
        page.getByText(t("T-3139", { dia: "jueves", lideres: 1, apoyo: 2, bases: 1 })),
      ).toBeVisible();
      const base = page.getByRole("listitem").filter({ hasText: "Base sintética 1" });
      await expect(base.getByText("Miembro E2E", { exact: true })).toBeVisible();
      await expect(
        base.getByText("Calificadora Personal Sintética", { exact: true }),
      ).toBeVisible();
      await expect(base.getByText("Veedor Personal Sintético", { exact: true })).toBeVisible();
      await sinViolaciones(page);
    });
  });

  test.describe("líder de base", () => {
    test.use({
      storageState: "tests/e2e/.auth/member.json",
      viewport: { width: 390, height: 844 },
    });

    test("ve con quién está en su base", async ({ page }) => {
      const { id, admin } = await seedCompetition("the-games-equipo");
      await seedHelper("calificadora.equipo@eafit.edu.co", "Calificadora", "Equipo Sintética");
      const text = "MIEMBRO E2E\t1\tLIDER DE BASE\nCALIFICADORA EQUIPO SINTETICA\t\tCALIFICADOR";
      const preview = await importStaffSheetAs(admin, id, { day: 1, text });
      await importStaffSheetAs(admin, id, { day: 1, text, fingerprint: preview.fingerprint });

      await page.goto("/admin");
      await expect(page).toHaveURL(new RegExp(`/admin/the-games/${id}/juez`));
      await expect(
        page.getByRole("heading", { name: t("T-3161", { base: "Base sintética 1" }) }),
      ).toBeVisible();
      await expect(
        page.getByText(`${tList("T-3155")[1]}: Calificadora Equipo Sintética`),
      ).toBeVisible();
      await sinViolaciones(page);
    });
  });
});

test.describe("jurados de The Challenge", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("carga las notas de un jurado y ve el orden con el podio sugerido", async ({ page }) => {
    const { id, admin } = await seedCompetition("the-games-jurados");
    await createExtraAs(admin, id, { name: "The Challenge", day: 1 });
    await page.goto(`/admin/the-games/${id}?area=extras`);
    const extra = t("T-2825", { dia: 1 });
    await page.getByText(`The Challenge · ${extra}`).click();
    await page.getByText(t("T-3163"), { exact: true }).click();
    await page.getByLabel(t("T-3165"), { exact: true }).fill("Jurado sintético");
    await page
      .getByLabel(t("T-3166"))
      .fill(
        [
          "#\tEquipo\tTalento\tImpacto\tIntegración\tEstructura\tProducción\tNormas\tTotal\tNivel",
          "1\tEquipo sintético 1\tBaile\t9\t9\t9\t9\t9\t#REF!\t",
          "2\tEquipo sintético 2\tTeatro\t10\t10\t10\t10\t10\t#REF!\t",
          "3\tEquipo sintético 3\tCanto\t7\t7\t7\t7\t7\t#REF!\t",
        ].join("\n"),
      );
    await sinViolaciones(page);
    await page.getByRole("button", { name: t("T-3167") }).click();
    await expect(
      page.getByText(t("T-3168", { jurado: "Jurado sintético", equipos: 3 })),
    ).toBeVisible();
    await page.getByText(`The Challenge · ${extra}`).click();
    const table = page.getByRole("table", { name: t("T-3180") });
    await expect(table).toBeVisible();
    const first = table.getByRole("row").nth(1);
    await expect(first).toContainText("2 Equipo sintético 2");
    await expect(first).toContainText(t("T-3177", { puntos: (2000).toLocaleString("es-CO") }));
    await sinViolaciones(page);
    // En el celular la tabla se desplaza: su región tiene que admitir el teclado.
    await page.setViewportSize({ width: 390, height: 844 });
    await sinViolaciones(page);
  });
});
