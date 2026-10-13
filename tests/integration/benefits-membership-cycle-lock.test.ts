import { and, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { grantRecognitionAs } from "@/modules/crm";
import { recognition } from "@/modules/crm/schema";
import { requestEventApprovalAs } from "@/modules/finance";
import { eventApproval } from "@/modules/finance/schema";
import {
  anonymizePersonAs,
  changeMembershipStatus,
  changeMembershipStatusAs,
  endMembershipAs,
  lockMembershipCycle,
  recordSanctionAs,
  requestDeletionAs,
  setProbationAs,
} from "@/modules/people";
import { membership, membershipTerm, person } from "@/modules/people/schema";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import {
  seedCommittee,
  seedMember,
  seedMembership,
  seedMembershipTerm,
  seedPerson,
  seedTerm,
} from "../factories";
import {
  firstThenSecond,
  heldThenSettled,
  holdCommand,
  holdTransaction,
  outcome,
  waitingForLock,
  waitingOn,
  whileHeld,
} from "../helpers/locks";
import { truncateAll } from "./db";

// DT-343 inciso (b), ADR-127 regla 4: el reconocimiento y el aval toman el consultivo del ciclo de
// membresía de la persona (`wallet-member:<persona>`) antes de leer si tiene los beneficios
// bloqueados. Esa lectura son tres sentencias: sin el candado, lo que cambia la condición de la
// persona confirmaba entre ellas, o sin que el beneficio lo esperara, y el beneficio se concedía a
// alguien en prueba o suspendido. Cada prueba cae al quitar el candado de `assertBenefitsAvailable`.

const db = () => getDb();

interface Scenario {
  termId: string;
  admin: { personId: string; ip: null };
  personId: string;
  committeeId: string;
}

/** Alguien activo, sin prueba ni sanción, en el semestre vigente. */
async function activeMember(): Promise<Scenario> {
  const termId = await seedTerm();
  const admin = { personId: await seedMember("admin.gh@eafit.edu.co"), ip: null };
  const personId = await seedMember("activa@eafit.edu.co", { entryTermCode: "2026-1" });
  const committeeId = await seedCommittee("sintetico");
  return { termId, admin, personId, committeeId };
}

/**
 * Alguien que salió a licencia en 2026-1 en prueba: en el semestre vigente no tiene fila y la prueba
 * vive solo en la condición guardada (ADR-120 regla 4). El reloj se le pasa al comando.
 */
async function onLeaveOnProbation(): Promise<Scenario> {
  const f = await activeMember();
  await seedMembershipTerm(f.personId, await seedTerm("2026-1"), true);
  await runCommand(SYSTEM_ACTOR, (ctx) =>
    changeMembershipStatus(
      ctx,
      f.personId,
      { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
      new Date("2026-06-01T15:00:00Z"),
    ),
  );
  return f;
}

async function stateOf(f: Scenario) {
  const [row] = await db()
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, f.personId));
  const [termRow] = await db()
    .select({ probation: membershipTerm.probation })
    .from(membershipTerm)
    .where(
      and(
        eq(membershipTerm.personId, f.personId),
        eq(membershipTerm.termId, f.termId),
        isNull(membershipTerm.committeeId),
      ),
    );
  return { status: row?.status, onProbation: termRow?.probation ?? false };
}

const BENEFITS = [
  {
    benefit: "un reconocimiento",
    request: (f: Scenario): Promise<unknown> =>
      grantRecognitionAs(f.admin, {
        personId: f.personId,
        termId: f.termId,
        kind: "OE_AWARD",
        award: "BEST_NEW_MEMBER",
        title: "",
      }),
    written: async (f: Scenario): Promise<number> =>
      (
        await db()
          .select({ id: recognition.id })
          .from(recognition)
          .where(eq(recognition.personId, f.personId))
      ).length,
  },
  {
    benefit: "un aval",
    request: (f: Scenario): Promise<unknown> =>
      requestEventApprovalAs(
        { personId: f.personId, ip: null },
        { committeeId: f.committeeId, title: "Evento sintético", eventOn: "2099-11-20" },
      ),
    written: async (f: Scenario): Promise<number> =>
      (
        await db()
          .select({ id: eventApproval.id })
          .from(eventApproval)
          .where(eq(eventApproval.requestedById, f.personId))
      ).length,
  },
];

const suspension = (f: Scenario, termId = f.termId): Promise<unknown> =>
  recordSanctionAs(
    f.admin,
    f.personId,
    {
      termId,
      kind: "SUSPENSION",
      cause: "Uso indebido de la oficina, con descargos",
      occurredOn: todayKey(),
      suspendedUntil: todayKey(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)),
    },
    { by: "ADMIN" },
  );

/** Lo que le quita los beneficios a alguien activo, por su puerta: cada una toma el consultivo. */
const BLOCKS = [
  {
    block: "le fijan el periodo de prueba",
    run: (f: Scenario): Promise<unknown> =>
      setProbationAs(f.admin, f.personId, f.termId, {
        probation: true,
        reason: "Bajo desempeño el semestre pasado",
      }),
  },
  { block: "le registran una suspensión", run: (f: Scenario) => suspension(f) },
];

/** Lo que llega con el beneficio a media lectura; todo toma el consultivo antes que ninguna fila. */
const BEHIND = [
  {
    arrives: "el regreso de su licencia",
    prepare: async (_f: Scenario): Promise<void> => undefined,
    run: (f: Scenario): Promise<unknown> =>
      changeMembershipStatusAs(f.admin, f.personId, { to: "ACTIVE", reason: "Vuelve" }),
    leaves: { status: "ACTIVE", onProbation: true },
  },
  {
    arrives: "su anonimización",
    prepare: async (f: Scenario): Promise<void> => {
      await requestDeletionAs({ personId: f.personId, ip: null });
    },
    run: (f: Scenario): Promise<unknown> => anonymizePersonAs(f.admin, f.personId),
    leaves: { status: "INACTIVE", onProbation: false },
  },
  {
    arrives: "su baja",
    prepare: async (_f: Scenario): Promise<void> => undefined,
    run: (f: Scenario): Promise<unknown> =>
      endMembershipAs(f.admin, f.personId, {
        endReason: "RESIGNATION",
        memorialConsent: false,
        contactConsent: false,
      }),
    leaves: { status: "INACTIVE", onProbation: false },
  },
];

/** Retiene la fila de la persona: quien le escribe algo que la referencia se detiene ahí. */
const holdPersonRow = (personId: string) =>
  holdTransaction((tx) =>
    tx.select({ id: person.id }).from(person).where(eq(person.id, personId)).for("update"),
  );

/**
 * Detiene al beneficio a media lectura sin tocar `src`: de las tres lecturas de `blockedBenefits`, la
 * segunda es la de las sanciones, y con la tabla tomada en exclusiva se queda esperándola con la
 * primera, la de las filas del término, ya respondida. Nada de lo que acá llega detrás lee esa tabla.
 */
const betweenFirstAndSecondRead = () =>
  holdTransaction((tx) => tx.execute(sql`lock table sanction in access exclusive mode`));

/** Lanza sin esperar: si la prueba cae antes de recoger el resultado, el rechazo no queda suelto. */
function launch<T>(running: Promise<T>): Promise<T> {
  void running.catch(() => undefined);
  return running;
}

describe("un beneficio pedido mientras cambia la condición de la persona", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  describe.each(BENEFITS)("$benefit", ({ request, written }) => {
    it("con el regreso de una licencia en prueba escrito y sin confirmar, hace cola y responde T-2331 con la prueba ya en el semestre", async () => {
      const f = await onLeaveOnProbation();
      const comeback = await holdCommand(f.admin, (ctx) =>
        changeMembershipStatus(ctx, f.personId, { to: "ACTIVE", reason: "Vuelve" }),
      );

      const { during, after } = await heldThenSettled(comeback, () => request(f));

      expect({ during, after: outcome(after) }).toEqual({
        during: "hizo cola",
        after: t("T-2331"),
      });
      expect(await written(f)).toBe(0);
      expect(await stateOf(f)).toEqual({ status: "ACTIVE", onProbation: true });
    });

    it.each(BLOCKS)("mientras $block, espera a que confirme y responde T-2331", async ({ run }) => {
      const f = await activeMember();

      const results = await firstThenSecond(
        await holdPersonRow(f.personId),
        () => run(f),
        () => request(f),
      );

      // Sin el candado el beneficio leía lo confirmado, sin prueba ni sanción, y se concedía.
      expect(results.map(outcome)).toEqual(["ok", t("T-2331")]);
      expect(await written(f)).toBe(0);
    });

    // La carrera de la fila: la primera lectura no ve la prueba en el semestre, porque sigue guardada,
    // y la tercera ya ve a la persona activa. Y el orden de candados (ADR-123 regla 6): el beneficio
    // toma el consultivo sin nada en la mano, así que lo que llega detrás hace cola y nadie se cruza.
    it.each(
      BEHIND,
    )("a media lectura, $arrives hace cola detrás: el beneficio responde T-2331 y nadie se interbloquea", async ({
      prepare,
      run,
      leaves,
    }) => {
      const f = await onLeaveOnProbation();
      await prepare(f);
      const held = await betweenFirstAndSecondRead();
      let queued = false;
      let results: PromiseSettledResult<unknown>[];
      try {
        const requesting = launch(request(f));
        await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), {
          timeout: 5_000,
        });
        const behind = launch(run(f));
        let finished = false;
        void behind.then(
          () => {
            finished = true;
          },
          () => {
            finished = true;
          },
        );
        // Sin el candado, lo que llega detrás confirma acá mismo y el beneficio sigue leyendo después.
        await vi.waitFor(
          async () => expect(finished || (await waitingForLock()) === 2).toBe(true),
          {
            timeout: 5_000,
          },
        );
        queued = !finished;
        held.release();
        results = await Promise.allSettled([requesting, behind]);
      } finally {
        held.release();
        await held.done;
      }

      expect({ queued, results: results.map(outcome) }).toEqual({
        queued: true,
        results: [t("T-2331"), "ok"],
      });
      expect(await written(f)).toBe(0);
      expect(await stateOf(f)).toEqual(leaves);
    });
  });

  // Conducta de hoy, sin elegir (DT-343 inciso c): sin semestre vigente el aval no pregunta por los
  // beneficios, así que tampoco toma el consultivo, y una suspensión, que va por fechas y no por
  // término (ADR-061 regla 2), no lo impide. Que haya días así es la decisión abierta 27, y qué mide
  // el aval sin término roza la 72.
  it("sin semestre vigente el aval de alguien suspendido se crea, sin esperar el consultivo (decisiones abiertas 27 y 72)", async () => {
    const previous = await seedTerm("2026-1");
    const withoutCurrentTerm = async (email: string) => {
      const personId = await seedPerson(email);
      await seedMembership(personId, previous);
      return personId;
    };
    const f: Scenario = {
      termId: previous,
      admin: { personId: await withoutCurrentTerm("admin.gh@eafit.edu.co"), ip: null },
      personId: await withoutCurrentTerm("suspendida@eafit.edu.co"),
      committeeId: await seedCommittee("sintetico"),
    };
    await suspension(f, previous);
    expect((await getCurrentTerm()) ?? null).toBeNull();
    const endorsement = BENEFITS[1];
    if (!endorsement) throw new Error("falta el aval");

    const during = await whileHeld(
      await holdTransaction((tx) => lockMembershipCycle(tx, f.personId)),
      () => endorsement.request(f),
    );

    expect(during).toBe("ok");
    expect(await endorsement.written(f)).toBe(1);
  });
});
