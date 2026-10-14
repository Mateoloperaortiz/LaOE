import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { changeMembershipStatus, honoraryFacts, recordSanctionAs } from "@/modules/people";
// La regla de la vista previa del roster no sale por el `index.ts` del módulo: solo la usa `people`.
import { honoraryBlockedAmong } from "@/modules/people/domain/membership";
import { membership } from "@/modules/people/schema";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { seedMembership, seedMembershipTerm, seedPerson, seedTerm } from "../factories";
import { type CountedQuery, countQueries } from "../helpers/queries";
import { truncateAll } from "./db";

// DT-343 inciso (d), ADR-127 regla 3: quién no puede pasar a honorario lo responden el comando, la
// ficha y la vista previa del roster con la misma regla (ADR-061 regla 2; ADR-120 regla 4; ADR-123
// reglas 5 y 7). Con semestre vigente la prueba guardada al salir a licencia se leía dos veces, una
// dentro de `blockedBenefits` y otra por cuenta de quien pregunta; ahora responde `blockedBenefits`
// sola, y sin semestre, cuando a ella no se le pregunta, la sigue mirando quien pregunta. Para una
// licencia anterior a la migración de la condición guardada cada lectura es reconstruirla desde la
// salida registrada: acá se fija qué responde cada camino, con y sin semestre vigente, y cuántas
// veces la reconstruye. Antes eran 17 consultas y dos reconstrucciones en el paso rechazado, 25 y
// tres en el que procede, 17 y dos en la ficha y 21 y cuatro en la vista previa de dos personas.
// El paso que procede la pedía además para dejarla escrita (`conditionToKeep`): el comando la lee
// una vez y con esa misma decide y escribe, haya o no semestre vigente.

const db = () => getDb();

interface Departure {
  /** Salió en prueba. */
  probation: boolean;
  /** Con la condición guardada en la membresía; sin ella es una licencia anterior a la migración. */
  stored: boolean;
}

/**
 * Entró en 2026-1. No pasa por `seedMember`, que siembra siempre el semestre vigente: acá cada prueba
 * dice si lo hay.
 */
async function memberSince2026(email: string): Promise<string> {
  const personId = await seedPerson(email);
  await seedMembership(personId, await seedTerm("2026-1"));
  return personId;
}

/**
 * Sale a licencia en 2026-1, el semestre en que entró, y en el vigente no tiene fila. Sin `stored`
 * queda como las licencias anteriores a la migración: la membresía no trae la condición y la casa la
 * reconstruye desde el término de la salida. El reloj se le pasa al comando.
 */
async function onLeave(email: string, { probation, stored }: Departure): Promise<string> {
  const previous = await seedTerm("2026-1");
  const personId = await memberSince2026(email);
  await seedMembershipTerm(personId, previous, probation);
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    changeMembershipStatus(
      ctx,
      personId,
      { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
      new Date("2026-06-01T15:00:00Z"),
    ),
  );
  if (!stored) {
    await db()
      .update(membership)
      .set({ leaveCondition: null })
      .where(eq(membership.personId, personId));
  }
  return personId;
}

const toHonorary = (personId: string) =>
  runCommand(SYSTEM_ACTOR, (ctx) =>
    changeMembershipStatus(ctx, personId, { to: "HONORARY", reason: "Pasa a honoraria" }),
  );

async function stateOf(personId: string) {
  const [row] = await db()
    .select({ status: membership.status, leaveCondition: membership.leaveCondition })
    .from(membership)
    .where(eq(membership.personId, personId));
  return row;
}

/** Cuántas consultas salieron y cuántas de ellas leen la salida a licencia para reconstruir la condición. */
function measure(queries: CountedQuery[]) {
  return {
    queries: queries.length,
    rebuilds: queries.filter((query) => /from "membership_event"/.test(query.text)).length,
  };
}

/** Que el día no tenga semestre no se supone: se comprueba. */
async function expectNoCurrentTerm(): Promise<void> {
  expect((await getCurrentTerm()) ?? null).toBeNull();
}

/**
 * La condición con la que sale `onLeave` sin prueba, entera: es lo que el paso a honorario deja
 * escrito en la membresía, lo traiga guardado o lo reconstruya (ADR-118 regla 8).
 */
const LEFT_WITHOUT_PROBATION = [
  {
    committeeId: null,
    probation: false,
    reportAsVeteran: false,
    resumedNew: true,
    resumedTransfer: false,
  },
];

const DEPARTURES = [
  { leave: "con la condición guardada en la membresía", stored: true },
  { leave: "anterior a la migración, que se reconstruye desde la salida", stored: false },
];

describe("la prueba con la que alguien salió a licencia y el paso a honorario", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  describe.each(DEPARTURES)("una licencia $leave", ({ stored }) => {
    it("con semestre vigente y en prueba al salir: el comando responde T-2331, la ficha la da por bloqueada y la vista previa del roster la marca", async () => {
      await seedTerm();
      const onProbation = await onLeave("en.prueba@eafit.edu.co", { probation: true, stored });
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, stored });

      expect([...(await honoraryBlockedAmong([onProbation, clean]))]).toEqual([onProbation]);
      expect((await honoraryFacts(onProbation)).benefitsBlocked).toBe(true);
      await expect(toHonorary(onProbation)).rejects.toThrow(
        new DomainError(t("T-2331"), "personId"),
      );
      expect((await stateOf(onProbation))?.status).toBe("ON_LEAVE");
    });

    it("con semestre vigente y sin prueba al salir: pasa a honoraria y conserva la condición con la que salió", async () => {
      await seedTerm();
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, stored });

      expect((await honoraryFacts(clean)).benefitsBlocked).toBe(false);
      await toHonorary(clean);

      expect(await stateOf(clean)).toEqual({
        status: "HONORARY",
        leaveCondition: [
          expect.objectContaining({ committeeId: null, probation: false, resumedNew: true }),
        ],
      });
    });

    // Sin semestre vigente a `blockedBenefits` no se le pregunta, y la prueba guardada se mira aparte
    // (ADR-120 regla 4). Que haya días así depende de los huecos entre términos: decisión abierta 27.
    it("sin semestre vigente y en prueba al salir: responden lo mismo los tres (decisión abierta 27)", async () => {
      const onProbation = await onLeave("en.prueba@eafit.edu.co", { probation: true, stored });
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, stored });
      await expectNoCurrentTerm();

      expect([...(await honoraryBlockedAmong([onProbation, clean]))]).toEqual([onProbation]);
      expect((await honoraryFacts(onProbation)).benefitsBlocked).toBe(true);
      expect((await honoraryFacts(clean)).benefitsBlocked).toBe(false);
      await expect(toHonorary(onProbation)).rejects.toThrow(
        new DomainError(t("T-2331"), "personId"),
      );
      await toHonorary(clean);
      expect((await stateOf(clean))?.status).toBe("HONORARY");
    });
  });

  describe("una suspensión vigente", () => {
    async function suspended(email: string): Promise<string> {
      const previous = await seedTerm("2026-1");
      const admin = { personId: await memberSince2026("admin.gh@eafit.edu.co"), ip: null };
      const personId = await memberSince2026(email);
      await recordSanctionAs(
        admin,
        personId,
        {
          termId: previous,
          kind: "SUSPENSION",
          cause: "Uso indebido de la oficina, con descargos",
          occurredOn: todayKey(),
          suspendedUntil: todayKey(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)),
        },
        { by: "ADMIN" },
      );
      return personId;
    }

    it("con semestre vigente impide el paso a honorario", async () => {
      await seedTerm();
      const personId = await suspended("suspendida@eafit.edu.co");

      expect((await honoraryFacts(personId)).benefitsBlocked).toBe(true);
      await expect(toHonorary(personId)).rejects.toThrow(new DomainError(t("T-2331"), "personId"));
    });

    // Conducta de hoy, sin elegir (DT-343 inciso c): sin semestre vigente no se le pregunta a
    // `blockedBenefits`, que es quien mira la suspensión, aunque ADR-061 regla 2 no la ata a un
    // término. Corregirlo cambia lo que se ve en el aval, en el paso a honorario con su fila del
    // roster y en la ficha, y espera las decisiones abiertas 27 (si hay días sin semestre) y 72.
    it("sin semestre vigente no lo impide, ni la ficha la da por bloqueada (decisiones abiertas 27 y 72)", async () => {
      const personId = await suspended("suspendida@eafit.edu.co");
      await expectNoCurrentTerm();

      expect((await honoraryFacts(personId)).benefitsBlocked).toBe(false);
      expect([...(await honoraryBlockedAmong([personId]))]).toEqual([]);
      await toHonorary(personId);

      expect((await stateOf(personId))?.status).toBe("HONORARY");
    });
  });

  // Lo que cuesta, contado: cada reconstrucción es la lectura de la salida a licencia y, detrás, el
  // término de esa fecha, las filas de ese término y los traslados.
  describe("lo que le manda a PostgreSQL una licencia anterior a la migración, con semestre vigente", () => {
    const earlier = { stored: false };

    it("el paso a honorario que se rechaza reconstruye la condición una sola vez", async () => {
      await seedTerm();
      const onProbation = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...earlier });

      const { result, queries } = await countQueries(() =>
        toHonorary(onProbation).then(
          () => "ok",
          (error: Error) => error.message,
        ),
      );

      expect(result).toBe(t("T-2331"));
      expect(measure(queries)).toEqual({ queries: 13, rebuilds: 1 });
    });

    // Eran 21 y dos: la segunda era de `conditionToKeep`, que la volvía a leer para dejarla escrita.
    it("el que procede la reconstruye una sola vez: con la que decide es la que deja escrita", async () => {
      await seedTerm();
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, ...earlier });

      const { queries } = await countQueries(() => toHonorary(clean));

      expect(measure(queries)).toEqual({ queries: 17, rebuilds: 1 });
      expect(await stateOf(clean)).toEqual({
        status: "HONORARY",
        leaveCondition: LEFT_WITHOUT_PROBATION,
      });
    });

    it("la ficha la reconstruye una sola vez", async () => {
      await seedTerm();
      const onProbation = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...earlier });

      const { result, queries } = await countQueries(() => honoraryFacts(onProbation));

      expect(result.benefitsBlocked).toBe(true);
      expect(measure(queries)).toEqual({ queries: 12, rebuilds: 1 });
    });

    it("la vista previa del roster la reconstruye una vez por persona", async () => {
      await seedTerm();
      const onProbation = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...earlier });
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, ...earlier });

      const { result, queries } = await countQueries(() =>
        honoraryBlockedAmong([onProbation, clean]),
      );

      expect([...result]).toEqual([onProbation]);
      expect(measure(queries)).toEqual({ queries: 13, rebuilds: 2 });
    });

    it("con la condición guardada en la membresía el paso a honorario no reconstruye nada", async () => {
      await seedTerm();
      const clean = await onLeave("sin.prueba@eafit.edu.co", { probation: false, stored: true });

      const { queries } = await countQueries(() => toHonorary(clean));

      expect(measure(queries)).toEqual({ queries: 13, rebuilds: 0 });
    });
  });

  // Un día sin semestre decide quien pregunta y no `blockedBenefits` (ADR-120 regla 4), así que la
  // cuenta es otra; la repetición era la misma del día con semestre, 18 consultas y dos
  // reconstrucciones, y se va igual. Que haya días así es la decisión abierta 27.
  describe("lo que le manda a PostgreSQL una licencia anterior a la migración, sin semestre vigente (decisión abierta 27)", () => {
    it("el paso a honorario que procede la reconstruye una sola vez y deja escrita la de su salida", async () => {
      const clean = await onLeave("sin.prueba@eafit.edu.co", {
        probation: false,
        stored: false,
      });
      await expectNoCurrentTerm();

      const { queries } = await countQueries(() => toHonorary(clean));

      expect(measure(queries)).toEqual({ queries: 14, rebuilds: 1 });
      expect(await stateOf(clean)).toEqual({
        status: "HONORARY",
        leaveCondition: LEFT_WITHOUT_PROBATION,
      });
    });
  });
});
