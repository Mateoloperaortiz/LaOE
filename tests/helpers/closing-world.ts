import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { adjustRequirementAs } from "@/modules/participation";
import { recordSanctionAs, revokeSanctionAs } from "@/modules/people";
import { grantManualCreditAs, listClosingRows, recomputeSnapshots } from "@/modules/permanence";
import { closeTermPoints } from "@/modules/terms";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedManualCredit,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "../factories";

// El mundo del cierre de permanencia que comparten las pruebas del motivo de una decisión (DT-392) y las
// de la causal de la baja (DT-398): un término vencido, un comité con su tabla y una asamblea celebrada,
// y los comandos de verdad con que GH cambia los hechos de una persona después de confirmar.

/** ADMIN desde la Persona 360: declara su alcance, sin restricción de tipo ni de comité. */
const asAdmin = { by: "ADMIN" } as const;

/** Cómo llega la persona a su comité: cumple, queda en la banda de prueba o queda fuera de ella. */
type Level = "MEETS" | "BAND" | "BELOW";

/** Lo que suma cada nivel en las dos reglas del comité (60 y 40 puntos). */
const CREDITS: Record<Level, readonly [number, number]> = {
  MEETS: [60, 40],
  BAND: [55, 0],
  BELOW: [10, 0],
};

export interface Profile {
  level: Level;
  /** Fue a la única asamblea ordinaria celebrada; quien no fue la tiene perdida. */
  attends?: boolean;
  /** Llega al cierre con una falta grave más un llamado de atención vivos (Regl. art. 69). */
  sanctioned?: boolean;
  /** Ingresó en el término del cierre: tiene la inducción pendiente y lo obligatorio sin cumplir. */
  isNew?: boolean;
}

/**
 * Un término ya vencido (2024-2) con el comité A3, su tabla de 100 puntos en dos reglas de crédito manual
 * y una asamblea ordinaria celebrada. Con las dos reglas completas cumple un veterano y cumple un nuevo,
 * que tiene el umbral más alto.
 */
export async function closingWorld() {
  const termId = await seedTerm("2024-2");
  const previous = await seedTerm("2024-1");
  const a3 = await seedCommittee("a3", "A3");
  const gh = await seedPerson("gh.motivo-guardado@eafit.edu.co");
  await seedMembership(gh, previous);
  const actor = { personId: gh, ip: null };
  const rules = [
    await seedRule(termId, "eventos", {
      committeeId: a3,
      weight: 60,
      computation: "MANUAL",
      params: {},
    }),
    await seedRule(termId, "proyectos", {
      committeeId: a3,
      weight: 40,
      computation: "MANUAL",
      params: {},
    }),
  ] as const;
  const assembly = await seedOccasion(termId, {
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
    status: "CLOSED",
    startsAt: new Date("2024-09-10T22:00:00Z"),
    checkInOpensAt: new Date("2024-09-10T21:00:00Z"),
    checkInClosesAt: new Date("2024-09-10T23:00:00Z"),
  });

  const majorSanctions = new Map<string, string>();

  /** Una falta grave más un llamado de atención: la advertencia de expulsión. Devuelve la falta grave. */
  async function sanction(personId: string): Promise<string> {
    const recorded: string[] = [];
    for (const [kind, occurredOn] of [
      ["MAJOR", "2024-10-01"],
      ["WARNING", "2024-10-20"],
    ] as const) {
      const { id } = await recordSanctionAs(
        actor,
        personId,
        { termId, kind, cause: "Sanción sembrada para el cierre de permanencia", occurredOn },
        asAdmin,
      );
      recorded.push(id);
    }
    return recorded[0] as string;
  }

  async function member(email: string, profile: Profile): Promise<string> {
    const personId = await seedPerson(email);
    await seedMembership(personId, profile.isNew ? termId : previous);
    await seedCommitteeMembership(personId, a3, termId, "MIEMBRO", {
      joinedAt: new Date("2024-07-20T12:00:00Z"),
    });
    for (const [index, value] of CREDITS[profile.level].entries()) {
      if (value > 0) {
        await seedManualCredit(termId, rules[index] as string, personId, value, {
          reason: "seed",
          grantedById: gh,
        });
      }
    }
    if (profile.attends ?? true) {
      await seedCheckIn(assembly.id, personId);
    }
    if (profile.sanctioned) {
      majorSanctions.set(personId, await sanction(personId));
    }
    return personId;
  }

  /** GH le revoca la falta grave: sin ella no hay advertencia de expulsión. */
  async function revokeMajor(personId: string): Promise<void> {
    const sanctionId = majorSanctions.get(personId);
    if (!sanctionId) {
      throw new Error("la persona no llegó con una falta grave");
    }
    await revokeSanctionAs(
      actor,
      personId,
      sanctionId,
      "Descargos aceptados después de confirmar",
      asAdmin,
    );
  }

  /** GH le ajusta el requisito: ya no se le exige ninguna asamblea, y la que faltó deja de estar perdida. */
  async function adjustRequirement(personId: string): Promise<void> {
    await adjustRequirementAs(actor, {
      termId,
      personId,
      requiredOrdinary: 0,
      requiresBoardElection: false,
      requiresRunoff: false,
      reason: "Ajuste del requisito después de confirmar",
    });
  }

  /** GH deja a la persona en otro nivel de su comité, con el comando de los créditos manuales. */
  async function setLevel(personId: string, level: Level): Promise<void> {
    for (const [index, value] of CREDITS[level].entries()) {
      await grantManualCreditAs(actor, {
        ruleId: rules[index] as string,
        personId,
        value,
        reason: "Crédito corregido después de confirmar",
      });
    }
  }

  /** Los puntos del término quedan cerrados, que es lo que el cierre pide para confirmar decisiones. */
  async function closePoints(): Promise<void> {
    await recomputeSnapshots(termId);
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
  }

  /** La fila del cierre de una persona: lo que hoy se le propone y lo que quedó confirmado. */
  async function closingRow(personId: string) {
    const { rows } = await listClosingRows(termId);
    const row = rows.find((item) => item.personId === personId);
    if (!row) {
      throw new Error("el cierre no trae a la persona");
    }
    return row;
  }

  /** El motivo con que el cierre propone hoy: el de su comité y el de la persona. */
  async function proposedReasons(personId: string) {
    const row = await closingRow(personId);
    return { committee: row.committees[0]?.reason, person: row.personReason };
  }

  /** El motivo de la propuesta que quedó guardado con la decisión de su comité y con la de la persona. */
  async function savedReasons(personId: string) {
    const row = await closingRow(personId);
    return {
      committee: row.committees[0]?.decision?.proposalReason,
      person: row.personDecision?.proposalReason,
    };
  }

  return {
    termId,
    a3,
    actor,
    member,
    sanction,
    revokeMajor,
    adjustRequirement,
    setLevel,
    closePoints,
    closingRow,
    proposedReasons,
    savedReasons,
  };
}

export type ClosingWorld = Awaited<ReturnType<typeof closingWorld>>;
