import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as apuestas from "@/app/api/v1/the-games/hub/apuestas/route";
import * as estado from "@/app/api/v1/the-games/hub/route";
import * as sesion from "@/app/api/v1/the-games/hub/sesion/route";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  type CompetitionActor,
  createCompetitionAs,
  createMarketAs,
  createTeamAs,
  grantStartingCreditsAs,
  HUB_COOKIE,
  hubCookieValue,
  hubSessionFromCookie,
  hubStateSchema,
  issueTeamCodesAs,
  setCompetitionStatusAs,
  setMarketOpenAs,
  updateCompetitionSettingsAs,
} from "@/modules/competition";
import { clearHubFailures } from "@/modules/competition/domain/hub";
import { HUB_TERMS_VERSION } from "@/modules/competition/domain/hub-pure";
import { competitionTeam } from "@/modules/competition/schema";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

// El contrato del hub de capitanes en la API pública v1 (ADR-096, ADR-099), tal como lo recibe DÍAS:
// el código de estado y el cuerpo JSON de cada respuesta, con las rutas de verdad y el dominio de
// verdad contra Postgres. Es una prueba de caracterización: fija lo que la casa responde hoy para que
// un cambio de adentro no le mueva nada a DÍAS, que rechaza una forma de JSON que no conoce.

const DIAS = "https://dias.oeeafit.com";

// El origen de DÍAS se fija antes del primer `getEnv()`: el `.env` local no decide quién escribe.
vi.hoisted(() => {
  process.env.PUBLIC_API_ORIGINS = "https://dias.oeeafit.com";
});

interface CallInit {
  method?: "GET" | "POST";
  origin?: string | null;
  json?: unknown;
  /** Un cuerpo crudo, para lo que no es JSON. */
  text?: string;
  contentType?: string;
  cookie?: string | undefined;
}

function call(path: string, init: CallInit = {}): NextRequest {
  const headers = new Headers();
  const origin = init.origin === undefined ? DIAS : init.origin;
  if (origin) headers.set("origin", origin);
  const body = init.text ?? (init.json === undefined ? undefined : JSON.stringify(init.json));
  const contentType = init.contentType ?? (body === undefined ? undefined : "application/json");
  if (contentType) headers.set("content-type", contentType);
  if (init.cookie) headers.set("cookie", `${HUB_COOKIE}=${init.cookie}`);
  return new NextRequest(`https://oeeafit.com/api/v1/the-games/hub${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

const getState = (cookie?: string) => estado.GET(call("", { cookie }));
const postBet = (json: unknown, cookie?: string) =>
  apuestas.POST(call("/apuestas", { method: "POST", json, cookie }));

/** El código de estado y el cuerpo exactos, y lo que DÍAS necesita para poder leerlos. */
async function expectAnswer(response: Response, status: number, body: unknown): Promise<void> {
  expect({ status: response.status, body: await response.json() }).toEqual({ status, body });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBe(DIAS);
  expect(response.headers.get("access-control-allow-credentials")).toBe("true");
}

/** Una competencia en vivo con apuestas: tres equipos con 1.000 puntos y su código, y una apuesta
 *  abierta entre el 1 y el 2. */
async function seedHub() {
  await seedTerm();
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "dias-eafit",
      name: "Días EAFIT",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  const actor: CompetitionActor = {
    personId: await seedMember("admin-hub@example.com"),
    isAdmin: true,
    ip: null,
  };
  const { id } = await createCompetitionAs(actor, {
    editionId: edicion.id,
    slug: "the-games-2026",
    name: "The Games 2026",
  });
  const teamIds: string[] = [];
  for (let n = 1; n <= 3; n++) {
    teamIds.push((await createTeamAs(actor, id, { number: n, name: `E${n}` })).id);
  }
  const [e1 = "", e2 = ""] = teamIds;
  await updateCompetitionSettingsAs(actor, id, {
    name: "The Games 2026",
    bettingEnabled: true,
    startingCredits: 1000,
  });
  await grantStartingCreditsAs(actor, id);
  const codes = await issueTeamCodesAs(actor, id, false);
  const market = await createMarketAs(actor, id, {
    title: "¿Quién gana la base de inflables?",
    teamIds: [e1, e2],
  });
  await setMarketOpenAs(actor, id, market.id, true);
  await setCompetitionStatusAs(actor, id, "LIVE");
  return {
    id,
    actor,
    teamId: e1,
    code: codes.find((item) => item.teamId === e1)?.code ?? "",
    marketId: market.id,
  };
}

/** Entra por la ruta, como DÍAS, y devuelve la cookie de la sesión del equipo. */
async function enter(code: string): Promise<string> {
  const response = await sesion.POST(
    call("/sesion", { method: "POST", json: { code, accept: HUB_TERMS_VERSION } }),
  );
  expect(response.status).toBe(200);
  const cookie = new RegExp(`${HUB_COOKIE}=([^;]+)`).exec(
    response.headers.get("set-cookie") ?? "",
  )?.[1];
  if (!cookie) throw new Error("la ruta no dejó la cookie del hub");
  return decodeURIComponent(cookie);
}

const SESSION_GONE = { error: t("T-3038") };

describe("contrato del hub de capitanes en la API pública v1 (ADR-096)", () => {
  beforeEach(async () => {
    await truncateAll();
    clearHubFailures();
  });
  afterAll(() => closeDb());

  describe("sin sesión", () => {
    it("el estado responde 401 sin motivo y la apuesta responde 401 con el motivo de la sesión", async () => {
      const { marketId } = await seedHub();
      await expectAnswer(await getState(), 401, { error: null });
      await expectAnswer(await postBet({ marketId, pick: 2, stake: 100 }), 401, SESSION_GONE);
      // Sin sesión la apuesta ni se lee: un cuerpo que no vale responde lo mismo.
      await expectAnswer(await postBet({ pick: "dos" }), 401, SESSION_GONE);
    });
  });

  describe("con una sesión que no vale", () => {
    it("una cookie alterada o vencida responde 401 con el motivo, en el estado y en la apuesta", async () => {
      const { code, marketId } = await seedHub();
      const cookie = await enter(code);
      const session = hubSessionFromCookie(cookie);
      if (!session) throw new Error("la cookie que dejó la ruta no se pudo leer");
      const altered = `${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`;
      const expired = hubCookieValue({ ...session, expiresAt: Date.now() - 1000 });
      for (const bad of [altered, expired, "cualquier-cosa"]) {
        await expectAnswer(await getState(bad), 401, SESSION_GONE);
        await expectAnswer(
          await postBet({ marketId, pick: 2, stake: 100 }, bad),
          401,
          SESSION_GONE,
        );
      }
      // La cookie buena sigue sirviendo: lo que no valía eran las otras.
      expect((await getState(cookie)).status).toBe(200);
    });

    it("volver a emitir el código deja la sesión en 401, en el estado y en la apuesta", async () => {
      const { id, actor, code, marketId } = await seedHub();
      const cookie = await enter(code);
      await issueTeamCodesAs(actor, id, false);
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(
        await postBet({ marketId, pick: 2, stake: 100 }, cookie),
        401,
        SESSION_GONE,
      );
    });

    it("unas instrucciones que ya no son las vigentes dejan la sesión en 401", async () => {
      const { teamId, code, marketId } = await seedHub();
      const cookie = await enter(code);
      await getDb()
        .update(competitionTeam)
        .set({ hubTermsVersion: HUB_TERMS_VERSION - 1 })
        .where(eq(competitionTeam.id, teamId));
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(
        await postBet({ marketId, pick: 2, stake: 100 }, cookie),
        401,
        SESSION_GONE,
      );
    });

    it("un equipo retirado deja la sesión en 401", async () => {
      const { teamId, code, marketId } = await seedHub();
      const cookie = await enter(code);
      await getDb()
        .update(competitionTeam)
        .set({ status: "WITHDRAWN" })
        .where(eq(competitionTeam.id, teamId));
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(
        await postBet({ marketId, pick: 2, stake: 100 }, cookie),
        401,
        SESSION_GONE,
      );
    });

    it("una competencia que vuelve a borrador deja la sesión en 401", async () => {
      const { id, actor, code, marketId } = await seedHub();
      const cookie = await enter(code);
      await setCompetitionStatusAs(actor, id, "DRAFT");
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(
        await postBet({ marketId, pick: 2, stake: 100 }, cookie),
        401,
        SESSION_GONE,
      );
    });

    it("con las apuestas apagadas o la competencia cerrada, el estado responde 401 y la apuesta responde 400 con el motivo de la competencia", async () => {
      const { id, actor, code, marketId } = await seedHub();
      const cookie = await enter(code);
      await updateCompetitionSettingsAs(actor, id, {
        name: "The Games 2026",
        bettingEnabled: false,
        startingCredits: 1000,
      });
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(await postBet({ marketId, pick: 2, stake: 100 }, cookie), 400, {
        error: t("T-2786"),
      });
      await setCompetitionStatusAs(actor, id, "FINISHED");
      await expectAnswer(await getState(cookie), 401, SESSION_GONE);
      await expectAnswer(await postBet({ marketId, pick: 2, stake: 100 }, cookie), 400, {
        error: t("T-2793"),
      });
    });
  });

  describe("con una apuesta que no vale", () => {
    it("un cuerpo que no es una apuesta responde 400 con el texto de validación", async () => {
      const { code, marketId } = await seedHub();
      const cookie = await enter(code);
      const invalid = { error: t("T-260") };
      const notJson = await apuestas.POST(
        call("/apuestas", { method: "POST", text: "marketId=1&pick=2", cookie }),
      );
      await expectAnswer(notJson, 400, invalid);
      const bodies: unknown[] = [
        null,
        [],
        {},
        { marketId, pick: 2 },
        { marketId, stake: 100 },
        { pick: 2, stake: 100 },
        { marketId, pick: "2", stake: 100 },
        { marketId, pick: 2, stake: "100" },
        { marketId, pick: 2.5, stake: 100 },
        { marketId: "", pick: 2, stake: 100 },
        { marketId: "m".repeat(41), pick: 2, stake: 100 },
        // Estos pasan la forma de la ruta y los rechaza el esquema del dominio.
        { marketId, pick: 0, stake: 100 },
        { marketId, pick: 100, stake: 100 },
        { marketId, pick: 2, stake: 0 },
        { marketId, pick: 2, stake: -50 },
        { marketId, pick: 2, stake: 1_000_001 },
        { marketId: "   ", pick: 2, stake: 100 },
      ];
      for (const body of bodies) await expectAnswer(await postBet(body, cookie), 400, invalid);
    });

    it("una apuesta que el dominio rechaza responde 400 con su motivo, y la sesión sigue sirviendo", async () => {
      const { id, actor, code, marketId } = await seedHub();
      const cookie = await enter(code);
      const rejected: [body: unknown, motivo: string][] = [
        [{ marketId: "no-existe", pick: 2, stake: 100 }, t("T-2764")],
        [{ marketId, pick: 1, stake: 100 }, t("T-2785")],
        [{ marketId, pick: 3, stake: 100 }, t("T-2784")],
        [{ marketId, pick: 99, stake: 100 }, t("T-2784")],
        [{ marketId, pick: 2, stake: 5000 }, t("T-2782", { saldo: 1000 })],
      ];
      for (const [body, motivo] of rejected) {
        await expectAnswer(await postBet(body, cookie), 400, { error: motivo });
      }

      // Nada de eso gastó saldo ni cerró la sesión: la apuesta buena entra y devuelve el estado.
      const placed = await postBet({ marketId, pick: 2, stake: 300 }, cookie);
      expect(placed.status).toBe(200);
      const state = hubStateSchema.parse(await placed.json());
      expect(state).toMatchObject({
        version: 1,
        team: { number: 1, name: "E1" },
        balance: 700,
        markets: [{ id: marketId, myBet: { pick: 2, stake: 300 } }],
      });
      expect(placed.headers.get("cache-control")).toBe("no-store");
      expect(placed.headers.get("access-control-allow-origin")).toBe(DIAS);

      await expectAnswer(await postBet({ marketId, pick: 2, stake: 100 }, cookie), 400, {
        error: t("T-2783"),
      });
      await setMarketOpenAs(actor, id, marketId, false);
      await expectAnswer(await postBet({ marketId, pick: 2, stake: 100 }, cookie), 400, {
        error: t("T-2781"),
      });
      expect((await getState(cookie)).status).toBe(200);
    });
  });

  describe("desde otro origen o sin JSON", () => {
    it("la apuesta responde 403 antes de mirar la sesión", async () => {
      const { code, marketId } = await seedHub();
      const cookie = await enter(code);
      const body = { marketId, pick: 2, stake: 100 };
      const refused = { error: "origen no permitido" };
      const attempts: CallInit[] = [
        { json: body, cookie, origin: "https://otro.example" },
        { json: body, cookie, origin: null },
        { json: body, cookie, contentType: "text/plain" },
        { json: body, origin: "https://otro.example" },
      ];
      for (const attempt of attempts) {
        const response = await apuestas.POST(call("/apuestas", { method: "POST", ...attempt }));
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 403,
          body: refused,
        });
        expect(response.headers.get("cache-control")).toBe("no-store");
      }
      // Ninguna apostó: el saldo sigue entero.
      const state = hubStateSchema.parse(await (await getState(cookie)).json());
      expect(state.balance).toBe(1000);
    });
  });

  describe("al entrar", () => {
    it("un código que no es de ningún equipo responde 400 y unas instrucciones sin aceptar responden 409 con su versión", async () => {
      const { code } = await seedHub();
      const post = (json: unknown) => sesion.POST(call("/sesion", { method: "POST", json }));
      await expectAnswer(await post({ code: "ZZZZ-ZZZZ" }), 400, { error: t("T-3036") });
      await expectAnswer(await post({ codigo: code }), 400, { error: t("T-3036") });
      const terms = await post({ code });
      await expectAnswer(terms, 409, { error: t("T-3120"), terms: HUB_TERMS_VERSION });
      expect(terms.headers.get("set-cookie")).toBeNull();
      const entered = await post({ code, accept: HUB_TERMS_VERSION });
      expect(entered.status).toBe(200);
      expect(hubStateSchema.parse(await entered.json())).toMatchObject({
        version: 1,
        team: { number: 1, name: "E1" },
        balance: 1000,
      });
    });
  });
});
