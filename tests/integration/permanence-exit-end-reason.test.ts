import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { endMembershipAs, reactivateMembershipAs } from "@/modules/people";
import { membership } from "@/modules/people/schema";
import {
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  listClosingRows,
} from "@/modules/permanence";
import { permanenceSnapshot } from "@/modules/permanence/schema";
import { t } from "@/shared/copy";
import { type ClosingWorld, closingWorld, type Profile } from "../helpers/closing-world";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// La causal con que queda guardada la baja de quien el cierre de permanencia saca de la OE (DT-398;
// ADR-060 regla 3). Es lo que queda en `membership.endReason`, y de ahí cuelga si la persona puede
// volver: a quien sale con `EXPULSION` no lo reactiva la Persona 360 ni lo devuelve el roster. Va por
// el camino de verdad, contra Postgres: el cierre propone, GH confirma, cambian los hechos, GH aplica el
// cierre y el trabajo del outbox ejecuta las decisiones.
//
// Hay dos fuentes de «por qué sale» y no dicen siempre lo mismo. El motivo de la propuesta se guarda con
// la decisión al confirmar (ADR-128 regla 1) y no cambia después. La causal la decide `applyDecisions`
// sobre el snapshot que el cierre congela al aplicar, que se recalcula con los hechos de ese momento.
// Cuál de las dos manda es la decisión abierta 80: acá queda fijado lo que pasa hoy.

/** Cómo queda la membresía cuando el trabajo del cierre termina: activa, o de baja con su causal. */
type Outcome = "ACTIVE" | "PERMANENCE" | "EXPULSION";

/** Con qué llega cada persona al cierre: la que continúa y cada salida, sola y de a dos causas. */
const ARRIVALS = {
  continues: { level: "MEETS" },
  noCommittee: { level: "BELOW" },
  mandatoryLost: { level: "MEETS", attends: false },
  sanctions: { level: "MEETS", sanctioned: true },
  mandatoryLostAndNoCommittee: { level: "BELOW", attends: false },
  sanctionsAndNoCommittee: { level: "BELOW", sanctioned: true },
  mandatoryLostAndSanctions: { level: "MEETS", attends: false, sanctioned: true },
} as const satisfies Record<string, Profile>;
type Arrival = keyof typeof ARRIVALS;

/** Lo que puede cambiar entre confirmar y aplicar el cierre, cada cosa con su comando. */
const DRIFTS = {
  none: { applies: () => true, apply: async () => {} },
  requirementAdjusted: {
    applies: () => true,
    apply: (w, personId) => w.adjustRequirement(personId),
  },
  majorRevoked: {
    applies: (profile) => profile.sanctioned === true,
    apply: (w, personId) => w.revokeMajor(personId),
  },
  sanctionedLater: {
    applies: (profile) => !profile.sanctioned,
    apply: (w, personId) => w.sanction(personId),
  },
  committeeStopsMeeting: {
    applies: (profile) => profile.level === "MEETS",
    apply: (w, personId) => w.setLevel(personId, "BELOW"),
  },
  committeeStartsMeeting: {
    applies: (profile) => profile.level === "BELOW",
    apply: (w, personId) => w.setLevel(personId, "MEETS"),
  },
} satisfies Record<
  string,
  {
    applies: (profile: Profile) => boolean;
    apply: (w: ClosingWorld, personId: string) => Promise<unknown>;
  }
>;
type Drift = keyof typeof DRIFTS;

/**
 * Lo que queda de un caso: el motivo, en el orden de T-801, de lo que el cierre propone sobre el
 * snapshot que congeló (0 si propone continuar), y cómo queda la membresía.
 */
type Line = readonly [atClose: number, outcome: Outcome];

interface ArrivalLines {
  /** El motivo de la propuesta que quedó guardado con la decisión de la persona al confirmar. */
  saved: number | null;
  drifts: Partial<Record<Drift, Line>>;
}

/**
 * LA TABLA. Cada persona llega al cierre con su causa, GH confirma la propuesta tal cual, los hechos
 * cambian y GH aplica el cierre. La baja queda como expulsión exactamente cuando el snapshot congelado
 * trae una obligatoria perdida (4) o la advertencia de expulsión (5), diga lo que diga el motivo
 * guardado al confirmar; con cualquier otra cosa, quien quedó confirmado para salir sale por
 * permanencia. Quien quedó confirmado para continuar sigue activo aunque hoy el cierre proponga sacarlo.
 */
const EXPECTED: Record<Arrival, ArrivalLines> = {
  continues: {
    saved: 0,
    drifts: {
      none: [0, "ACTIVE"],
      requirementAdjusted: [0, "ACTIVE"],
      sanctionedLater: [5, "ACTIVE"],
      committeeStopsMeeting: [3, "ACTIVE"],
    },
  },
  noCommittee: {
    saved: 3,
    drifts: {
      none: [3, "PERMANENCE"],
      requirementAdjusted: [3, "PERMANENCE"],
      sanctionedLater: [5, "EXPULSION"],
      committeeStartsMeeting: [0, "PERMANENCE"],
    },
  },
  mandatoryLost: {
    saved: 4,
    drifts: {
      none: [4, "EXPULSION"],
      requirementAdjusted: [0, "PERMANENCE"],
      sanctionedLater: [4, "EXPULSION"],
      committeeStopsMeeting: [4, "EXPULSION"],
    },
  },
  sanctions: {
    saved: 5,
    drifts: {
      none: [5, "EXPULSION"],
      requirementAdjusted: [5, "EXPULSION"],
      majorRevoked: [0, "PERMANENCE"],
      committeeStopsMeeting: [5, "EXPULSION"],
    },
  },
  mandatoryLostAndNoCommittee: {
    saved: 4,
    drifts: {
      none: [4, "EXPULSION"],
      requirementAdjusted: [3, "PERMANENCE"],
      sanctionedLater: [4, "EXPULSION"],
      committeeStartsMeeting: [4, "EXPULSION"],
    },
  },
  sanctionsAndNoCommittee: {
    saved: 5,
    drifts: {
      none: [5, "EXPULSION"],
      requirementAdjusted: [5, "EXPULSION"],
      majorRevoked: [3, "PERMANENCE"],
      committeeStartsMeeting: [5, "EXPULSION"],
    },
  },
  mandatoryLostAndSanctions: {
    saved: 4,
    drifts: {
      none: [4, "EXPULSION"],
      requirementAdjusted: [5, "EXPULSION"],
      majorRevoked: [4, "EXPULSION"],
      committeeStopsMeeting: [4, "EXPULSION"],
    },
  },
};

/** Cada caso de la tabla: una llegada y un cambio que le aplica. */
const CASES = (Object.keys(ARRIVALS) as Arrival[]).flatMap((arrival) =>
  (Object.keys(DRIFTS) as Drift[])
    .filter((drift) => DRIFTS[drift].applies(ARRIVALS[arrival]))
    .map((drift) => ({ arrival, drift })),
);

async function membershipOf(personId: string) {
  const [row] = await getDb()
    .select({ status: membership.status, endReason: membership.endReason })
    .from(membership)
    .where(eq(membership.personId, personId));
  if (!row) {
    throw new Error("la persona no tiene membresía");
  }
  return row;
}

async function outcomeOf(personId: string): Promise<Outcome> {
  const { status, endReason } = await membershipOf(personId);
  if (status === "ACTIVE" && endReason === null) {
    return "ACTIVE";
  }
  if (status === "INACTIVE" && (endReason === "PERMANENCE" || endReason === "EXPULSION")) {
    return endReason;
  }
  throw new Error(`la membresía quedó ${status} con la causal ${endReason}`);
}

async function closingRows(termId: string) {
  return new Map((await listClosingRows(termId)).rows.map((row) => [row.personId, row]));
}

/** GH aplica el cierre y el trabajo del outbox ejecuta las decisiones confirmadas. */
async function closeAndApply(w: ClosingWorld): Promise<void> {
  await closeTermPermanenceAs(w.actor, w.termId);
  await drainOutbox();
}

/** Arma la tabla entera por los comandos de verdad, con veteranos o con nuevos de inducción pendiente. */
async function observe(isNew: boolean): Promise<Record<string, ArrivalLines>> {
  const w = await closingWorld();
  const people: string[] = [];
  for (const [index, item] of CASES.entries()) {
    people.push(
      await w.member(`caso${index}.causal@eafit.edu.co`, { ...ARRIVALS[item.arrival], isNew }),
    );
  }
  await w.closePoints();
  expect(await confirmAllProposedAs(w.actor, w.termId)).toBe(CASES.length);
  const confirmed = await closingRows(w.termId);
  for (const [index, item] of CASES.entries()) {
    await DRIFTS[item.drift].apply(w, people[index] as string);
  }
  await closeTermPermanenceAs(w.actor, w.termId);
  // Las filas del cierre leen ya el snapshot congelado: el mismo que lee el trabajo al aplicar.
  const frozen = await closingRows(w.termId);
  await drainOutbox();

  const observed: Record<string, ArrivalLines> = {};
  for (const [index, item] of CASES.entries()) {
    const personId = people[index] as string;
    const [before, after] = [confirmed.get(personId), frozen.get(personId)];
    if (!before?.personDecision || !after) {
      throw new Error("el cierre no trae a la persona o su decisión");
    }
    const saved = before.personDecision.proposalReason;
    const lines = observed[item.arrival] ?? { saved, drifts: {} };
    expect(saved, `${item.arrival} · ${item.drift}`).toBe(lines.saved);
    lines.drifts[item.drift] = [after.personReason, await outcomeOf(personId)];
    observed[item.arrival] = lines;
  }
  return observed;
}

describe("la causal con que queda la baja de quien el cierre de permanencia saca de la OE (DT-398)", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  for (const [who, isNew] of [
    ["un veterano", false],
    ["un nuevo con la inducción pendiente", true],
  ] as const) {
    it(`a ${who} que sale lo deja expulsado una obligatoria perdida o la advertencia de expulsión en el snapshot que el cierre congeló, y por permanencia cualquier otra cosa`, async () => {
      const observed = await observe(isNew);

      expect(observed).toEqual(EXPECTED);
      // Lo que permite que la baja y el motivo salgan de una sola regla: sobre el MISMO snapshot, la
      // condición de la baja y el motivo del dominio dicen lo mismo en cada caso de la tabla.
      for (const [arrival, lines] of Object.entries(observed)) {
        for (const [drift, line] of Object.entries(lines.drifts)) {
          const [atClose, outcome] = line;
          if (arrival === "continues") {
            expect(outcome, `${arrival} · ${drift}`).toBe("ACTIVE");
          } else {
            expect(outcome === "EXPULSION", `${arrival} · ${drift}`).toBe(
              atClose === 4 || atClose === 5,
            );
          }
        }
      }
    });
  }

  it("cuando los hechos cambian entre confirmar y aplicar, la causal es la de los hechos al aplicar y no la del motivo con que se confirmó, y de ella cuelga quién puede volver (decisión abierta 80)", async () => {
    const w = await closingWorld();
    const revoked = await w.member("revocada.causal@eafit.edu.co", ARRIVALS.sanctions);
    const adjusted = await w.member("ajustada.causal@eafit.edu.co", ARRIVALS.mandatoryLost);
    const sanctionedLater = await w.member("sancionada.causal@eafit.edu.co", ARRIVALS.noCommittee);
    await w.closePoints();
    await confirmAllProposedAs(w.actor, w.termId);
    // Se confirmó la salida de cada quien con su motivo: sanciones, asamblea perdida y sin comité.
    expect((await w.savedReasons(revoked)).person).toBe(5);
    expect((await w.savedReasons(adjusted)).person).toBe(4);
    expect((await w.savedReasons(sanctionedLater)).person).toBe(3);

    await w.revokeMajor(revoked);
    await w.adjustRequirement(adjusted);
    await w.sanction(sanctionedLater);
    await closeAndApply(w);

    // El motivo guardado no cambió, y la baja no lo sigue.
    expect((await w.savedReasons(revoked)).person).toBe(5);
    expect((await w.savedReasons(adjusted)).person).toBe(4);
    expect((await w.savedReasons(sanctionedLater)).person).toBe(3);
    expect(await outcomeOf(revoked)).toBe("PERMANENCE");
    expect(await outcomeOf(adjusted)).toBe("PERMANENCE");
    expect(await outcomeOf(sanctionedLater)).toBe("EXPULSION");

    // Quien quedó confirmado por sanciones y salió por permanencia puede volver; quien quedó confirmado
    // por quedarse sin comité y salió expulsado, no (Regl. art. 61.3; ADR-060 regla 3).
    await reactivateMembershipAs(w.actor, revoked, { reason: "Pidió volver" });
    expect(await outcomeOf(revoked)).toBe("ACTIVE");
    await expect(
      reactivateMembershipAs(w.actor, sanctionedLater, { reason: "Pidió volver" }),
    ).rejects.toThrow(t("T-2206"));
  });

  it("lo que cambia después de aplicar el cierre y antes de que corra el trabajo no mueve la causal: decide el snapshot congelado", async () => {
    const w = await closingWorld();
    const revokedLate = await w.member("revocada-tarde.causal@eafit.edu.co", ARRIVALS.sanctions);
    const sanctionedLate = await w.member(
      "sancionada-tarde.causal@eafit.edu.co",
      ARRIVALS.noCommittee,
    );
    await w.closePoints();
    await confirmAllProposedAs(w.actor, w.termId);
    await closeTermPermanenceAs(w.actor, w.termId);

    await w.revokeMajor(revokedLate);
    await w.sanction(sanctionedLate);
    await drainOutbox();

    expect(await outcomeOf(revokedLate)).toBe("EXPULSION");
    expect(await outcomeOf(sanctionedLate)).toBe("PERMANENCE");
  });

  it("cuando GH decide otra cosa que la propuesta, la salida que GH decidió también toma su causal del snapshot congelado (decisión abierta 80)", async () => {
    const w = await closingWorld();
    const leaves = await w.member("se-retira.causal@eafit.edu.co", ARRIVALS.continues);
    const leavesAndIsSanctioned = await w.member(
      "se-retira-sancionada.causal@eafit.edu.co",
      ARRIVALS.continues,
    );
    const pardoned = await w.member("perdonada.causal@eafit.edu.co", ARRIVALS.sanctions);
    await w.closePoints();
    for (const personId of [leaves, leavesAndIsSanctioned]) {
      await confirmDecisionsAs(w.actor, w.termId, {
        personId,
        person: "EXIT_OE",
        committees: [{ committeeId: w.a3, decision: "CONTINUES" }],
        reason: "Se retira por decisión propia",
      });
    }
    await confirmDecisionsAs(w.actor, w.termId, {
      personId: pardoned,
      person: "CONTINUES",
      committees: [{ committeeId: w.a3, decision: "CONTINUES" }],
      reason: "Descargos aceptados por la junta",
    });
    // A las dos que se retiran el cierre les proponía continuar.
    expect((await w.savedReasons(leaves)).person).toBe(0);
    expect((await w.savedReasons(leavesAndIsSanctioned)).person).toBe(0);

    await w.sanction(leavesAndIsSanctioned);
    await closeAndApply(w);

    expect(await outcomeOf(leaves)).toBe("PERMANENCE");
    expect(await outcomeOf(leavesAndIsSanctioned)).toBe("EXPULSION");
    // A quien el cierre proponía sacar por sanciones y GH dejó continuar, nada la saca.
    expect(await outcomeOf(pardoned)).toBe("ACTIVE");
  });

  it("quien ya estaba de baja cuando corre el trabajo conserva la causal de esa baja", async () => {
    const w = await closingWorld();
    const resigned = await w.member("renuncia.causal@eafit.edu.co", ARRIVALS.sanctions);
    // Alguien más a quien cerrar: sin nadie evaluado el cierre no se aplica.
    await w.member("sigue.causal@eafit.edu.co", ARRIVALS.continues);
    await w.closePoints();
    await confirmAllProposedAs(w.actor, w.termId);
    expect((await w.savedReasons(resigned)).person).toBe(5);

    await endMembershipAs(w.actor, resigned, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    await closeAndApply(w);

    expect(await membershipOf(resigned)).toEqual({ status: "INACTIVE", endReason: "RESIGNATION" });
  });

  it("sin el snapshot de quien sale no hay de dónde decir que es una expulsión: la baja queda por permanencia, aunque la salida se haya confirmado con las dos causas (decisión abierta 80)", async () => {
    const w = await closingWorld();
    const both = await w.member(
      "sin-snapshot.causal@eafit.edu.co",
      ARRIVALS.mandatoryLostAndSanctions,
    );
    await w.closePoints();
    await confirmAllProposedAs(w.actor, w.termId);
    expect((await w.savedReasons(both)).person).toBe(4);
    await closeTermPermanenceAs(w.actor, w.termId);

    // Ningún comando deja una decisión confirmada sin su snapshot: la fila se borra a mano, entre
    // aplicar el cierre y que corra el trabajo, que es la única forma de llegar a esa rama.
    await getDb().delete(permanenceSnapshot).where(eq(permanenceSnapshot.personId, both));
    await drainOutbox();

    expect(await membershipOf(both)).toEqual({ status: "INACTIVE", endReason: "PERMANENCE" });
  });
});
