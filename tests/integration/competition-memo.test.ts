import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import {
  clearRouteMemo,
  clearShowcaseMemo,
  getShowcase,
  getTeamRoute,
} from "@/modules/competition";
import { clearHubFailures, enterHub } from "@/modules/competition/domain/hub";
import {
  HUB_FAILURE_WINDOW_MS,
  HUB_MAX_FAILURES_PER_IP,
} from "@/modules/competition/domain/hub-pure";
import { countQueries } from "../helpers/queries";
import { truncateAll } from "./db";

// Lo que The Games guarda en la memoria del proceso por una clave que escribe quien pide (ADR-122
// regla 10): el memo de 3 s de la vitrina y el del recorrido (ADR-090 regla 3), con el slug de la URL,
// y los fallos de entrada al hub (ADR-096), con la IP. Cada uno suelta lo vencido al escribir: un
// anónimo pidiendo claves distintas ya no lo hace crecer hasta el reinicio (DT-221). Lo que el memo
// ahorra no cambia, tampoco para lo que no existe: sigue costando una lectura cada 3 s por clave.

const T0 = new Date("2026-10-01T15:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const UNKNOWN = 40;

describe("lo que The Games guarda en memoria por clave de quien pide", () => {
  beforeEach(async () => {
    await truncateAll();
    clearShowcaseMemo();
    clearRouteMemo();
    clearHubFailures();
  });
  afterAll(() => closeDb());

  describe("el memo de la vitrina", () => {
    it("suelta lo vencido al guardar: pedir slugs que no existen no lo hace crecer", async () => {
      for (let i = 0; i < UNKNOWN; i++) {
        expect(await getShowcase(`no-existe-${i}`, T0)).toBeNull();
      }
      // Pasados los 3 s ninguna de esas respuestas sirve ya: la que entra las saca.
      expect(await getShowcase("otra-que-no-existe", at(3000))).toBeNull();
      expect(clearShowcaseMemo()).toBe(1);
    });

    it("lo que no existe también se guarda 3 s: pedirlo otra vez no vuelve a leer la base", async () => {
      const first = await countQueries(() => getShowcase("no-existe", T0));
      const again = await countQueries(() => getShowcase("no-existe", at(2999)));
      const expired = await countQueries(() => getShowcase("no-existe", at(3000)));
      expect({
        first: first.queries.length,
        again: again.queries.length,
        expired: expired.queries.length,
      }).toEqual({ first: 1, again: 0, expired: 1 });
    });

    it("guardar otra clave no suelta la que sigue vigente", async () => {
      await getShowcase("no-existe", T0);
      await getShowcase("otra-que-no-existe", at(1000));
      const again = await countQueries(() => getShowcase("no-existe", at(2000)));
      expect(again.queries).toHaveLength(0);
      expect(clearShowcaseMemo()).toBe(2);
    });
  });

  describe("el memo del recorrido de un equipo", () => {
    it("suelta lo vencido al guardar: pedir equipos de slugs que no existen no lo hace crecer", async () => {
      for (let i = 0; i < UNKNOWN; i++) {
        expect(await getTeamRoute(`no-existe-${i}`, 1, T0)).toBeNull();
      }
      expect(await getTeamRoute("otra-que-no-existe", 1, at(3000))).toBeNull();
      expect(clearRouteMemo()).toBe(1);
    });

    it("lo que no existe también se guarda 3 s: pedirlo otra vez no vuelve a leer la base", async () => {
      const first = await countQueries(() => getTeamRoute("no-existe", 7, T0));
      const again = await countQueries(() => getTeamRoute("no-existe", 7, at(2999)));
      const expired = await countQueries(() => getTeamRoute("no-existe", 7, at(3000)));
      expect({
        first: first.queries.length,
        again: again.queries.length,
        expired: expired.queries.length,
      }).toEqual({ first: 1, again: 0, expired: 1 });
    });

    it("guardar otra clave no suelta la que sigue vigente", async () => {
      await getTeamRoute("no-existe", 7, T0);
      await getTeamRoute("no-existe", 8, at(1000));
      const again = await countQueries(() => getTeamRoute("no-existe", 7, at(2000)));
      expect(again.queries).toHaveLength(0);
      expect(clearRouteMemo()).toBe(2);
    });
  });

  describe("los fallos de entrada al hub", () => {
    const from = (ip: string): Actor => ({ personId: null, ip });
    const fail = (ip: string, now: Date) =>
      runCommand(from(ip), (ctx) => enterHub(ctx, "ZZZZ-ZZZZ", null, now));

    it("al anotar un fallo se sueltan las IP cuyos fallos ya salieron de la ventana", async () => {
      for (let i = 0; i < UNKNOWN; i++) {
        expect(await fail(`198.51.100.${i}`, T0)).toMatchObject({ ok: false, reason: "INVALID" });
      }
      // Un fallo cuenta mientras tenga menos de 15 minutos: a los 15 justos ya no.
      await fail("203.0.113.7", at(HUB_FAILURE_WINDOW_MS));
      expect(clearHubFailures()).toBe(1);
    });

    it("el fallo de otra IP no le borra la cuenta a la que ya llegó al tope", async () => {
      for (let i = 0; i < HUB_MAX_FAILURES_PER_IP; i++) await fail("198.51.100.1", T0);
      await fail("203.0.113.7", at(60_000));
      expect(await fail("198.51.100.1", at(120_000))).toMatchObject({
        ok: false,
        reason: "RATE_LIMITED",
      });
      expect(clearHubFailures()).toBe(2);
    });
  });
});
