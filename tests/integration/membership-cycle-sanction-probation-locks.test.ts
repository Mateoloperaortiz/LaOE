import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  anonymizePersonAs,
  applyRosterImportAs,
  createRosterPreviewAs,
  endMembershipAs,
  recordSanctionAs,
  requestDeletionAs,
  setProbationAs,
} from "@/modules/people";
import { membership, membershipTerm, person, sanction } from "@/modules/people/schema";
import { todayKey } from "@/shared/lib/dates";
import { seedMember, seedTerm } from "../factories";
import {
  firstThenSecond,
  holdTransaction,
  outcome,
  waitingForLock,
  waitingOn,
} from "../helpers/locks";
import { truncateAll } from "./db";

// ADR-127 regla 2 (DT-339): registrar una sanción y fijar el periodo de prueba toman el consultivo del
// ciclo de membresía (`wallet-member:<persona>`) al empezar, antes de cualquier fila. Sin él, los dos
// confirmaban al instante sobre alguien que una importación del roster ya había validado y tenía
// tomada, y la importación entera caía con T-2331 al llegar a su fila. Cada prueba cae al quitar el
// candado de su comando.

const STAYS = "prueba.sigue@eafit.edu.co";
const HONORARY = "prueba.honoraria@eafit.edu.co";

interface Admin {
  personId: string;
  ip: null;
}

const db = () => getDb();

/** Dos personas activas y un archivo que deja a la primera como está y pasa a la segunda a honoraria. */
async function scenario() {
  const termId = await seedTerm();
  const admin: Admin = { personId: await seedMember("admin.roster@eafit.edu.co"), ip: null };
  const stays = await seedMember(STAYS);
  const honorary = await seedMember(HONORARY);
  const bytes = new TextEncoder().encode(
    `${["CORREO;ESTADO", `${STAYS};Activo`, `${HONORARY};Honorario`].join("\r\n")}\r\n`,
  );
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "estados.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  return { termId, admin, stays, honorary, jobId };
}

async function stateOf(personId: string, termId: string) {
  const [row] = await db()
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  const sanctions = await db()
    .select({ id: sanction.id })
    .from(sanction)
    .where(eq(sanction.personId, personId));
  const [termRow] = await db()
    .select({ probation: membershipTerm.probation })
    .from(membershipTerm)
    .where(
      and(
        eq(membershipTerm.personId, personId),
        eq(membershipTerm.termId, termId),
        isNull(membershipTerm.committeeId),
      ),
    );
  return {
    status: row?.status,
    sanctions: sanctions.length,
    onProbation: termRow?.probation ?? false,
  };
}

/**
 * La importación es una sola transacción: toma los consultivos de las dos personas y se queda
 * esperando la fila de la primera, que la prueba retiene. La segunda sigue tomada hasta que confirme.
 */
const holdPersonRow = (personId: string) =>
  holdTransaction((tx) =>
    tx.select({ id: person.id }).from(person).where(eq(person.id, personId)).for("update"),
  );

/** Lanza sin esperar: si la prueba cae antes de recoger el resultado, el rechazo no queda suelto. */
function launch<T>(running: Promise<T>): Promise<T> {
  void running.catch(() => undefined);
  return running;
}

const COMMANDS = [
  {
    name: "registrar una suspensión",
    run: (admin: Admin, personId: string, termId: string): Promise<unknown> =>
      recordSanctionAs(
        admin,
        personId,
        {
          termId,
          kind: "SUSPENSION",
          cause: "Uso indebido de la oficina, con descargos",
          occurredOn: todayKey(),
          suspendedUntil: todayKey(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)),
        },
        { by: "ADMIN" },
      ),
    leaves: { sanctions: 1, onProbation: false },
  },
  {
    name: "fijar el periodo de prueba",
    run: (admin: Admin, personId: string, termId: string): Promise<unknown> =>
      setProbationAs(admin, personId, termId, {
        probation: true,
        reason: "Bajo desempeño el semestre pasado",
      }),
    leaves: { sanctions: 0, onProbation: true },
  },
];

const DEPARTURES = [
  {
    departure: "una anonimización",
    leave: (admin: Admin, personId: string): Promise<unknown> => anonymizePersonAs(admin, personId),
  },
  {
    departure: "una baja",
    leave: (admin: Admin, personId: string): Promise<unknown> =>
      endMembershipAs(admin, personId, {
        endReason: "RESIGNATION",
        memorialConsent: false,
        contactConsent: false,
      }),
  },
];

describe("sancionar o fijar la prueba a alguien que una importación del roster tiene tomada", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  describe.each(COMMANDS)("$name", ({ run, leaves }) => {
    it("hace cola detrás de la importación detenida en otra fila y confirma después, sin tumbarla", async () => {
      const { termId, admin, stays, honorary, jobId } = await scenario();

      const results = await firstThenSecond(
        await holdPersonRow(stays),
        () => applyRosterImportAs(admin, jobId),
        () => run(admin, honorary, termId),
      );

      // La importación la pasó a honoraria con lo que había validado, y el comando, que esperó,
      // decidió después sobre lo que ella dejó confirmado.
      expect(results.map(outcome)).toEqual(["ok", "ok"]);
      expect(await stateOf(honorary, termId)).toEqual({ status: "HONORARY", ...leaves });
    });

    it.each(
      DEPARTURES,
    )("con $departure de esa persona en la cola detrás, las tres terminan y ninguna se interbloquea", async ({
      leave,
    }) => {
      const { termId, admin, stays, honorary, jobId } = await scenario();
      await requestDeletionAs({ personId: honorary, ip: null });
      const held = await holdPersonRow(stays);
      let results: PromiseSettledResult<unknown>[];
      try {
        const importing = launch(applyRosterImportAs(admin, jobId));
        await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), {
          timeout: 5_000,
        });
        const acting = launch(run(admin, honorary, termId));
        await vi.waitFor(async () => expect(await waitingForLock()).toBe(2), { timeout: 5_000 });
        const leaving = launch(leave(admin, honorary));
        await vi.waitFor(async () => expect(await waitingForLock()).toBe(3), { timeout: 5_000 });
        held.release();
        results = await Promise.allSettled([importing, acting, leaving]);
      } finally {
        held.release();
        await held.done;
      }

      expect(results.map(outcome)).toEqual(["ok", "ok", "ok"]);
      expect((await stateOf(honorary, termId)).status).toBe("INACTIVE");
    });
  });
});
