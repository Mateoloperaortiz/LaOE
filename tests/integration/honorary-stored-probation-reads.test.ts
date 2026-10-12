import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { recordSanctionAs } from "@/modules/people";
import { honoraryFacts } from "@/modules/people/domain/honorary";
import { changeMembershipStatus, honoraryBlockedAmong } from "@/modules/people/domain/membership";
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
// dentro de `blockedBenefits` y otra por cuenta de quien pregunta. Para una licencia anterior a la
// migración de la condición guardada cada lectura es reconstruirla desde la salida registrada: acá se
// fija qué responde cada camino, con y sin semestre vigente, y cuántas veces la reconstruye.

const db = () => getDb();

interface Salida {
  /** Salió en prueba. */
  probation: boolean;
  /** Con la condición guardada en la membresía; sin ella es una licencia anterior a la migración. */
  guardada: boolean;
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
 * Sale a licencia en 2026-1, el semestre en que entró, y en el vigente no tiene fila. Sin `guardada`
 * queda como las licencias anteriores a la migración: la membresía no trae la condición y la casa la
 * reconstruye desde el término de la salida. El reloj se le pasa al comando.
 */
async function onLeave(email: string, { probation, guardada }: Salida): Promise<string> {
  const previo = await seedTerm("2026-1");
  const personId = await memberSince2026(email);
  await seedMembershipTerm(personId, previo, probation);
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    changeMembershipStatus(
      ctx,
      personId,
      { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
      new Date("2026-06-01T15:00:00Z"),
    ),
  );
  if (!guardada) {
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

async function comoQuedo(personId: string) {
  const [row] = await db()
    .select({ status: membership.status, leaveCondition: membership.leaveCondition })
    .from(membership)
    .where(eq(membership.personId, personId));
  return row;
}

/** Cuántas consultas salieron y cuántas de ellas leen la salida a licencia para reconstruir la condición. */
function medida(queries: CountedQuery[]) {
  return {
    consultas: queries.length,
    reconstrucciones: queries.filter((query) => /from "membership_event"/.test(query.text)).length,
  };
}

/** Que el día no tenga semestre no se supone: se comprueba. */
async function sinSemestreVigente(): Promise<void> {
  expect((await getCurrentTerm()) ?? null).toBeNull();
}

const SALIDAS = [
  { licencia: "con la condición guardada en la membresía", guardada: true },
  { licencia: "anterior a la migración, que se reconstruye desde la salida", guardada: false },
];

describe("la prueba con la que alguien salió a licencia y el paso a honorario", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  describe.each(SALIDAS)("una licencia $licencia", ({ guardada }) => {
    it("con semestre vigente y en prueba al salir: el comando responde T-2331, la ficha la da por bloqueada y la vista previa del roster la marca", async () => {
      await seedTerm();
      const enPrueba = await onLeave("en.prueba@eafit.edu.co", { probation: true, guardada });
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, guardada });

      expect([...(await honoraryBlockedAmong([enPrueba, limpia]))]).toEqual([enPrueba]);
      expect((await honoraryFacts(enPrueba)).benefitsBlocked).toBe(true);
      await expect(toHonorary(enPrueba)).rejects.toThrow(new DomainError(t("T-2331"), "personId"));
      expect((await comoQuedo(enPrueba))?.status).toBe("ON_LEAVE");
    });

    it("con semestre vigente y sin prueba al salir: pasa a honoraria y conserva la condición con la que salió", async () => {
      await seedTerm();
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, guardada });

      expect((await honoraryFacts(limpia)).benefitsBlocked).toBe(false);
      await toHonorary(limpia);

      expect(await comoQuedo(limpia)).toEqual({
        status: "HONORARY",
        leaveCondition: [
          expect.objectContaining({ committeeId: null, probation: false, resumedNew: true }),
        ],
      });
    });

    // Sin semestre vigente a `blockedBenefits` no se le pregunta, y la prueba guardada se mira aparte
    // (ADR-120 regla 4). Que haya días así depende de los huecos entre términos: decisión abierta 27.
    it("sin semestre vigente y en prueba al salir: responden lo mismo los tres (decisión abierta 27)", async () => {
      const enPrueba = await onLeave("en.prueba@eafit.edu.co", { probation: true, guardada });
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, guardada });
      await sinSemestreVigente();

      expect([...(await honoraryBlockedAmong([enPrueba, limpia]))]).toEqual([enPrueba]);
      expect((await honoraryFacts(enPrueba)).benefitsBlocked).toBe(true);
      expect((await honoraryFacts(limpia)).benefitsBlocked).toBe(false);
      await expect(toHonorary(enPrueba)).rejects.toThrow(new DomainError(t("T-2331"), "personId"));
      await toHonorary(limpia);
      expect((await comoQuedo(limpia))?.status).toBe("HONORARY");
    });
  });

  describe("una suspensión vigente", () => {
    async function suspendida(email: string): Promise<string> {
      const previo = await seedTerm("2026-1");
      const admin = { personId: await memberSince2026("admin.gh@eafit.edu.co"), ip: null };
      const personId = await memberSince2026(email);
      await recordSanctionAs(
        admin,
        personId,
        {
          termId: previo,
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
      const personId = await suspendida("suspendida@eafit.edu.co");

      expect((await honoraryFacts(personId)).benefitsBlocked).toBe(true);
      await expect(toHonorary(personId)).rejects.toThrow(new DomainError(t("T-2331"), "personId"));
    });

    // Conducta de hoy, sin elegir (DT-343 inciso c): sin semestre vigente no se le pregunta a
    // `blockedBenefits`, que es quien mira la suspensión, aunque ADR-061 regla 2 no la ata a un
    // término. Corregirlo cambia lo que se ve en el aval, en el paso a honorario con su fila del
    // roster y en la ficha, y espera las decisiones abiertas 27 (si hay días sin semestre) y 72.
    it("sin semestre vigente no lo impide, ni la ficha la da por bloqueada (decisiones abiertas 27 y 72)", async () => {
      const personId = await suspendida("suspendida@eafit.edu.co");
      await sinSemestreVigente();

      expect((await honoraryFacts(personId)).benefitsBlocked).toBe(false);
      expect([...(await honoraryBlockedAmong([personId]))]).toEqual([]);
      await toHonorary(personId);

      expect((await comoQuedo(personId))?.status).toBe("HONORARY");
    });
  });

  // Lo que cuesta, contado: cada reconstrucción es la lectura de la salida a licencia y, detrás, el
  // término de esa fecha, las filas de ese término y los traslados.
  describe("lo que le manda a PostgreSQL una licencia anterior a la migración, con semestre vigente", () => {
    const anterior = { guardada: false };

    it("el paso a honorario que se rechaza reconstruye la condición dos veces", async () => {
      await seedTerm();
      const enPrueba = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...anterior });

      const { result, queries } = await countQueries(() =>
        toHonorary(enPrueba).then(
          () => "ok",
          (error: Error) => error.message,
        ),
      );

      expect(result).toBe(t("T-2331"));
      expect(medida(queries)).toEqual({ consultas: 17, reconstrucciones: 2 });
    });

    it("el que procede la reconstruye tres veces: dos para decidir y una para conservarla", async () => {
      await seedTerm();
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, ...anterior });

      const { queries } = await countQueries(() => toHonorary(limpia));

      expect(medida(queries)).toEqual({ consultas: 25, reconstrucciones: 3 });
    });

    it("la ficha la reconstruye dos veces", async () => {
      await seedTerm();
      const enPrueba = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...anterior });

      const { result, queries } = await countQueries(() => honoraryFacts(enPrueba));

      expect(result.benefitsBlocked).toBe(true);
      expect(medida(queries)).toEqual({ consultas: 17, reconstrucciones: 2 });
    });

    it("la vista previa del roster la reconstruye dos veces por persona", async () => {
      await seedTerm();
      const enPrueba = await onLeave("en.prueba@eafit.edu.co", { probation: true, ...anterior });
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, ...anterior });

      const { result, queries } = await countQueries(() =>
        honoraryBlockedAmong([enPrueba, limpia]),
      );

      expect([...result]).toEqual([enPrueba]);
      expect(medida(queries)).toEqual({ consultas: 21, reconstrucciones: 4 });
    });

    it("con la condición guardada en la membresía el paso a honorario no reconstruye nada", async () => {
      await seedTerm();
      const limpia = await onLeave("sin.prueba@eafit.edu.co", { probation: false, guardada: true });

      const { queries } = await countQueries(() => toHonorary(limpia));

      expect(medida(queries)).toEqual({ consultas: 13, reconstrucciones: 0 });
    });
  });
});
