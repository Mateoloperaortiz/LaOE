import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { recordSanctionAs } from "@/modules/people";
import {
  confirmAllProposedAs,
  confirmDecisionsAs,
  grantManualCreditAs,
  listClosingRows,
  recomputeSnapshots,
} from "@/modules/permanence";
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
import { truncateAll } from "./db";

// El motivo automático con que el cierre de permanencia propuso una decisión se guarda con la decisión
// (ADR-128 regla 1; DT-392). Va por el camino de verdad, contra Postgres: el cierre propone sobre los
// snapshots, GH confirma con los comandos del módulo, y lo que quedó guardado se lee por las filas del
// cierre, que traen la decisión confirmada de cada comité y la de la persona.

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

interface Profile {
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
async function world() {
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
      await sanction(personId);
    }
    return personId;
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
    setLevel,
    closePoints,
    closingRow,
    proposedReasons,
    savedReasons,
  };
}

describe("el motivo con que el cierre propuso se guarda con la decisión confirmada", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("confirmar en bloque guarda, con la decisión de cada comité y con la de la persona, el motivo de su propuesta", async () => {
    const { termId, actor, member, closePoints, proposedReasons, savedReasons } = await world();
    const people = {
      meets: await member("cumple.guardado@eafit.edu.co", { level: "MEETS" }),
      onProbation: await member("prueba.guardado@eafit.edu.co", { level: "BAND" }),
      below: await member("no-alcanza.guardado@eafit.edu.co", { level: "BELOW" }),
      absent: await member("falto.guardado@eafit.edu.co", { level: "MEETS", attends: false }),
      warned: await member("sancionado.guardado@eafit.edu.co", {
        level: "MEETS",
        sanctioned: true,
      }),
    };
    await closePoints();
    // Los seis motivos de T-801, cada uno donde el cierre lo propone: 0 a 2 por comité y 0, 3, 4 y 5 por persona.
    const proposed = {
      meets: { committee: 0, person: 0 },
      onProbation: { committee: 1, person: 0 },
      below: { committee: 2, person: 3 },
      absent: { committee: 0, person: 4 },
      warned: { committee: 0, person: 5 },
    };
    for (const [who, personId] of Object.entries(people)) {
      expect(await proposedReasons(personId), who).toEqual(proposed[who as keyof typeof proposed]);
      // Sin confirmar no hay decisión, y por eso tampoco motivo guardado.
      expect(await savedReasons(personId), who).toEqual({
        committee: undefined,
        person: undefined,
      });
    }

    expect(await confirmAllProposedAs(actor, termId)).toBe(5);

    for (const [who, personId] of Object.entries(people)) {
      expect(await savedReasons(personId), who).toEqual(proposed[who as keyof typeof proposed]);
    }
  });

  it("cuando GH cambia la propuesta se guarda el motivo de lo que el cierre propuso, no uno de lo que GH decidió", async () => {
    const { termId, a3, actor, member, closePoints, closingRow, savedReasons } = await world();
    const below = await member("cambiada.guardado@eafit.edu.co", { level: "BELOW" });
    const absent = await member("perdonada.guardado@eafit.edu.co", {
      level: "MEETS",
      attends: false,
    });
    await closePoints();
    const written = "Se queda en prueba: entregó su plan de mejora";
    await confirmDecisionsAs(actor, termId, {
      personId: below,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "PROBATION" }],
      reason: written,
    });
    await confirmDecisionsAs(actor, termId, {
      personId: absent,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "La asamblea se cruzó con un parcial",
    });

    // Se propuso sacarlo del comité por quedar fuera de la banda y de la OE por quedarse sin comité.
    expect(await closingRow(below)).toMatchObject({
      overridden: true,
      committees: [{ decision: { proposed: "EXIT_COMMITTEE", decision: "PROBATION" } }],
      personDecision: { proposed: "EXIT_OE", decision: "CONTINUES", reason: written },
    });
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });
    // Se propuso sacarlo de la OE por la asamblea perdida, y eso es lo que queda guardado.
    expect(await savedReasons(absent)).toEqual({ committee: 0, person: 4 });
  });

  it("volver a confirmar después de que cambian los hechos guarda el motivo de la propuesta de ese momento, y sin volver a confirmar se conserva el de antes", async () => {
    const { termId, a3, actor, member, setLevel, closePoints, proposedReasons, savedReasons } =
      await world();
    const below = await member("reconfirmada.guardado@eafit.edu.co", { level: "BELOW" });
    await closePoints();
    await confirmAllProposedAs(actor, termId);
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });

    // GH le reconoce después los créditos que le faltaban: hoy el cierre le propondría continuar.
    await setLevel(below, "MEETS");
    await recomputeSnapshots(termId);
    expect(await proposedReasons(below)).toEqual({ committee: 0, person: 0 });
    // Confirmar en bloque no toca a quien ya tiene decisión: rige la confirmada, con su motivo.
    expect(await confirmAllProposedAs(actor, termId)).toBe(0);
    expect(await savedReasons(below)).toEqual({ committee: 2, person: 3 });

    await confirmDecisionsAs(actor, termId, {
      personId: below,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "",
    });
    expect(await savedReasons(below)).toEqual({ committee: 0, person: 0 });
  });
});
