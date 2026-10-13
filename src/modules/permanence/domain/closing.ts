import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand, type Tx } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { permanenceClosed, permanenceDecided } from "@/domain-events/permanence";
import {
  endMembershipAs,
  getPeopleByIds,
  leaveCommitteeAs,
  listCommitteesByIds,
  setProbationAs,
} from "@/modules/people";
import { closeTermPermanence, ensureNextTerm, getTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { permanenceDecision } from "../schema";
import {
  type CommitteeDecision,
  type DecisionKind,
  type FinalState,
  type PersonPermanence,
  type Proposal,
  type ProposalReason,
  proposalReason,
  proposeDecisions,
} from "./permanence-pure";
import {
  freezeSnapshots,
  getSnapshot,
  listSnapshots,
  lockTermSnapshots,
  recomputeSnapshots,
  snapshotToResult,
} from "./snapshots";

// Cierre de permanencia (ADR-027, ADR-028, ADR-036 regla 9): las propuestas se derivan del snapshot
// y solo se guardan las decisiones confirmadas; GH confirma por persona o en bloque; "aplicar"
// congela, estampa el término, asegura el siguiente y encola el job que ejecuta cada decisión con
// comandos de `people`, reanudable por `appliedAt`.

export type DecisionRow = typeof permanenceDecision.$inferSelect;

export interface ClosingCommitteeRow {
  committeeId: string;
  committeeName: string;
  total: number;
  threshold: number;
  finalState: FinalState;
  proposed: CommitteeDecision;
  reason: ProposalReason;
  decision: DecisionRow | null;
}

export interface ClosingPersonRow {
  personId: string;
  name: string;
  isNew: boolean;
  probation: boolean;
  mandatoryMet: boolean;
  pendingEvaluations: number;
  committees: ClosingCommitteeRow[];
  personProposed: "CONTINUES" | "EXIT_OE";
  personReason: ProposalReason;
  personDecision: DecisionRow | null;
  /** Quién confirmó la fila de la persona (T-817). */
  decidedByName: string;
  /** Todas las filas (comités y persona) están confirmadas. */
  decided: boolean;
  /** GH confirmó algo distinto de lo propuesto (con motivo). */
  overridden: boolean;
  /** La propuesta actual difiere de la que se confirmó: rige la confirmada (T-806). */
  drifted: boolean;
  /** Lo que rige hoy para la persona: la confirmada o, si no hay, la propuesta. */
  effective: "CONTINUES" | "EXIT_OE";
}

export interface ClosingSummary {
  people: number;
  continues: number;
  probation: number;
  exitCommittee: number;
  exitOe: number;
  undecided: number;
  pendingEvaluations: number;
  applied: number;
  toApply: number;
}

export interface ClosingView {
  rows: ClosingPersonRow[];
  summary: ClosingSummary;
}

export const CLOSING_FILTERS = ["ALL", "UNDECIDED", "CHANGED", "EXITS"] as const;
export type ClosingFilter = (typeof CLOSING_FILTERS)[number];

/** Evaluaciones pendientes en los criterios de grupo de una persona: al cerrar cuentan como no logradas. */
function pendingOf(result: PersonPermanence): number {
  let pending = 0;
  for (const criterion of [...result.general, ...result.results.flatMap((r) => r.criteria)]) {
    if (criterion.detail.type === "GROUP_EVALUATED") {
      pending += criterion.detail.pendingCount;
    } else if (
      criterion.detail.type === "COMPOSITE" &&
      criterion.detail.group?.evaluation === "PENDING"
    ) {
      pending += 1;
    }
  }
  return pending;
}

export async function listDecisions(
  termId: string,
  exec: Executor = getDb(),
): Promise<DecisionRow[]> {
  return exec
    .select()
    .from(permanenceDecision)
    .where(eq(permanenceDecision.termId, termId))
    .orderBy(asc(permanenceDecision.decidedAt));
}

export interface PersonDecisionView {
  committeeId: string | null;
  committeeName: string;
  proposed: DecisionKind;
  /** El motivo automático de lo que se propuso, en el orden de T-801 (ADR-128 regla 1). */
  proposalReason: ProposalReason;
  decision: DecisionKind;
  /** El motivo que GH escribió; vacío si confirmó la propuesta tal cual. */
  reason: string;
  decidedByName: string;
  decidedAt: Date;
  appliedAt: Date | null;
}

/**
 * Las decisiones confirmadas de una persona en un término, para la Persona 360 (T-831). `result` es
 * el resultado que la pantalla muestra, vivo o congelado: de la decisión se guarda qué se propuso y no
 * por qué, y el motivo automático de cada una se resuelve acá, sobre ese resultado (ADR-128 regla 1).
 */
export async function listPersonDecisions(
  personId: string,
  termId: string,
  result: PersonPermanence,
): Promise<PersonDecisionView[]> {
  const rows = await getDb()
    .select()
    .from(permanenceDecision)
    .where(and(eq(permanenceDecision.termId, termId), eq(permanenceDecision.personId, personId)))
    .orderBy(asc(permanenceDecision.committeeId));
  if (rows.length === 0) {
    return [];
  }
  const [committees, people] = [
    await listCommitteesByIds(rows.flatMap((row) => (row.committeeId ? [row.committeeId] : []))),
    await getPeopleByIds(rows.flatMap((row) => (row.decidedById ? [row.decidedById] : []))),
  ];
  const names = new Map(committees.map((item) => [item.id, item.name]));
  return rows.map((row) => ({
    committeeId: row.committeeId,
    committeeName: row.committeeId ? (names.get(row.committeeId) ?? "") : "",
    proposed: row.proposed,
    proposalReason: proposalReason(result, row.proposed),
    decision: row.decision,
    reason: row.reason ?? "",
    decidedByName: row.decidedById ? (people.get(row.decidedById)?.fullName ?? "") : "",
    decidedAt: row.decidedAt,
    appliedAt: row.appliedAt,
  }));
}

export function filterClosingRows(
  rows: ClosingPersonRow[],
  filter: ClosingFilter,
): ClosingPersonRow[] {
  switch (filter) {
    case "UNDECIDED":
      return rows.filter((row) => !row.decided);
    case "CHANGED":
      return rows.filter((row) => row.overridden || row.drifted);
    case "EXITS":
      return rows.filter(
        (row) =>
          row.effective === "EXIT_OE" ||
          row.committees.some((c) => (c.decision?.decision ?? c.proposed) === "EXIT_COMMITTEE"),
      );
    default:
      return rows;
  }
}

/**
 * Las filas del cierre: snapshot (vivo o congelado), propuesta derivada y decisión confirmada si existe.
 * Los snapshots y las decisiones se leen por `exec`: el cierre pasa su transacción (ADR-121 regla 2).
 * Los nombres de personas y comités, que no deciden nada, van siempre por el pool.
 */
export async function listClosingRows(
  termId: string,
  exec: Executor = getDb(),
): Promise<ClosingView> {
  const snapshots = await listSnapshots(termId, exec);
  const decisions = await listDecisions(termId, exec);
  const evaluated = snapshots.filter((item) => item.status === "ACTIVE" && item.results.length > 0);
  const people = await getPeopleByIds([
    ...new Set([
      ...evaluated.map((item) => item.personId),
      ...decisions.flatMap((item) => (item.decidedById ? [item.decidedById] : [])),
    ]),
  ]);
  const committees = new Map(
    (
      await listCommitteesByIds([
        ...new Set(evaluated.flatMap((item) => item.results.map((r) => r.committeeId))),
      ])
    ).map((item) => [item.id, item.name]),
  );
  const decisionFor = (personId: string, committeeId: string | null) =>
    decisions.find((d) => d.personId === personId && d.committeeId === committeeId) ?? null;
  const rows: ClosingPersonRow[] = evaluated.map((snapshot) => {
    const result = snapshotToResult(snapshot);
    const proposal: Proposal = proposeDecisions(result);
    const committeeRows: ClosingCommitteeRow[] = result.results.map((item) => {
      const proposed = proposal.committees.find((c) => c.committeeId === item.committeeId);
      return {
        committeeId: item.committeeId,
        committeeName: committees.get(item.committeeId) ?? "",
        total: item.total,
        threshold: item.threshold,
        finalState: item.finalState,
        proposed: proposed?.proposed ?? "CONTINUES",
        reason: proposed?.reason ?? 0,
        decision: decisionFor(snapshot.personId, item.committeeId),
      };
    });
    const personDecision = decisionFor(snapshot.personId, null);
    const decided = personDecision !== null && committeeRows.every((row) => row.decision !== null);
    const drifted =
      (personDecision !== null && personDecision.proposed !== proposal.person.proposed) ||
      committeeRows.some((row) => row.decision !== null && row.decision.proposed !== row.proposed);
    const overridden =
      (personDecision !== null && personDecision.decision !== personDecision.proposed) ||
      committeeRows.some(
        (row) => row.decision !== null && row.decision.decision !== row.decision.proposed,
      );
    const effective =
      personDecision?.decision === "EXIT_OE" || personDecision?.decision === "CONTINUES"
        ? personDecision.decision
        : proposal.person.proposed;
    return {
      personId: snapshot.personId,
      name: people.get(snapshot.personId)?.fullName ?? "",
      isNew: snapshot.isNew,
      probation: snapshot.probation,
      mandatoryMet: result.mandatory.met,
      pendingEvaluations: pendingOf(result),
      committees: committeeRows,
      personProposed: proposal.person.proposed,
      personReason: proposal.person.reason,
      personDecision,
      decidedByName: personDecision?.decidedById
        ? (people.get(personDecision.decidedById)?.fullName ?? "")
        : "",
      decided,
      overridden,
      drifted,
      effective,
    };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, "es"));
  const committeeDecisions = rows.flatMap((row) =>
    row.committees.map((c) => c.decision?.decision ?? c.proposed),
  );
  return {
    rows,
    summary: {
      people: rows.length,
      continues: rows.filter((row) => row.effective === "CONTINUES").length,
      probation: committeeDecisions.filter((d) => d === "PROBATION").length,
      exitCommittee: committeeDecisions.filter((d) => d === "EXIT_COMMITTEE").length,
      exitOe: rows.filter((row) => row.effective === "EXIT_OE").length,
      undecided: rows.filter((row) => !row.decided).length,
      pendingEvaluations: rows.reduce((acc, row) => acc + row.pendingEvaluations, 0),
      applied: decisions.filter((d) => d.appliedAt !== null).length,
      toApply: decisions.length,
    },
  };
}

export const decisionInputSchema = z.object({
  personId: z.string().min(1),
  person: z.enum(["CONTINUES", "EXIT_OE"]),
  committees: z.array(
    z.object({
      committeeId: z.string().min(1),
      decision: z.enum(["CONTINUES", "PROBATION", "EXIT_COMMITTEE"]),
    }),
  ),
  reason: z.string().trim().max(1000).default(""),
});
export type DecisionInput = z.infer<typeof decisionInputSchema>;

/** Confirmar y aplicar exigen los puntos cerrados (decisión de Mateo del 2026-09-04) y un término abierto. */
async function requireClosable(termId: string) {
  const term = await getTerm(termId);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  if (!term.pointsClosedAt) {
    throw new DomainError(t("T-799", { término: term.code }));
  }
  if (term.permanenceClosedAt) {
    throw new DomainError(
      t("T-808", { término: term.code, fecha: term.permanenceClosedAt.toISOString() }),
    );
  }
  return term;
}

async function upsertDecision(
  ctx: CommandContext,
  values: Omit<typeof permanenceDecision.$inferInsert, "id" | "createdAt">,
): Promise<void> {
  const [existing] = await ctx.tx
    .select({ id: permanenceDecision.id })
    .from(permanenceDecision)
    .where(
      and(
        eq(permanenceDecision.termId, values.termId),
        eq(permanenceDecision.personId, values.personId),
        values.committeeId
          ? eq(permanenceDecision.committeeId, values.committeeId)
          : isNull(permanenceDecision.committeeId),
      ),
    );
  if (existing) {
    await ctx.tx
      .update(permanenceDecision)
      .set(values)
      .where(eq(permanenceDecision.id, existing.id));
    return;
  }
  await ctx.tx.insert(permanenceDecision).values(values);
}

/** Confirma las decisiones de una persona: la propuesta tal cual, o un cambio con motivo (T-805). */
export async function confirmDecisions(
  ctx: CommandContext,
  termId: string,
  row: ClosingPersonRow,
  input: DecisionInput,
  now = new Date(),
): Promise<void> {
  const chosenFor = (committee: ClosingCommitteeRow) =>
    input.committees.find((c) => c.committeeId === committee.committeeId)?.decision ??
    committee.proposed;
  const changed =
    input.person !== row.personProposed ||
    row.committees.some((committee) => chosenFor(committee) !== committee.proposed);
  if (changed && input.reason === "") {
    throw new DomainError(t("T-805"), "reason");
  }
  const base = {
    termId,
    personId: row.personId,
    reason: input.reason || null,
    decidedById: ctx.actor.personId,
    decidedAt: now,
    appliedAt: null,
  };
  for (const committee of row.committees) {
    await upsertDecision(ctx, {
      ...base,
      committeeId: committee.committeeId,
      proposed: committee.proposed,
      decision: chosenFor(committee),
    });
  }
  await upsertDecision(ctx, {
    ...base,
    committeeId: null,
    proposed: row.personProposed,
    decision: input.person,
  });
  await ctx.audit({
    action: "permanence-decision.confirmed",
    entityType: "permanence_decision",
    entityId: `${termId}:${row.personId}`,
    after: {
      person: input.person,
      committees: row.committees.map((c) => ({
        committeeId: c.committeeId,
        decision: chosenFor(c),
      })),
      reason: input.reason,
      changed,
    },
  });
}

export async function confirmDecisionsAs(
  actor: Actor,
  termId: string,
  input: DecisionInput,
): Promise<void> {
  await requireClosable(termId);
  const { rows } = await listClosingRows(termId);
  const row = rows.find((item) => item.personId === input.personId);
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await runCommand(actor, (ctx) => confirmDecisions(ctx, termId, row, input));
}

/** Confirma tal cual las propuestas de quienes aún no tienen decisión; devuelve cuántas personas. */
export async function confirmAllProposedAs(actor: Actor, termId: string): Promise<number> {
  await requireClosable(termId);
  const { rows } = await listClosingRows(termId);
  const pending = rows.filter((row) => !row.decided);
  if (pending.length === 0) {
    return 0;
  }
  await runCommand(actor, async (ctx) => {
    const now = new Date();
    for (const row of pending) {
      await confirmDecisions(
        ctx,
        termId,
        row,
        {
          personId: row.personId,
          person: row.personProposed,
          committees: row.committees.map((c) => ({
            committeeId: c.committeeId,
            decision: c.proposed,
          })),
          reason: "",
        },
        now,
      );
    }
  });
  return pending.length;
}

/**
 * Lo que el cierre exige de las filas a cerrar: que haya a quién cerrar y que nadie esté sin decidir.
 * Lee por la transacción del cierre, que ya tiene el candado del término.
 */
async function requireAllDecided(tx: Tx, term: { id: string; code: string }): Promise<void> {
  const { rows, summary } = await listClosingRows(term.id, tx);
  if (rows.length === 0) {
    throw new DomainError(t("T-814", { término: term.code }));
  }
  if (summary.undecided > 0) {
    throw new DomainError(t("T-807", { n: summary.undecided }));
  }
}

/**
 * Aplicar el cierre (ADMIN, step-up en la acción): recalcula afuera, y en una transacción toma el
 * candado de los recálculos del término, comprueba bajo ese candado que nadie quedó sin decidir
 * (ADR-121 regla 2), lo estampa, congela los snapshots con su estado final (ADR-116 regla 6), asegura
 * el término siguiente y encola el job de decisiones.
 */
export async function closeTermPermanenceAs(
  actor: Actor,
  termId: string,
): Promise<{ nextTermId: string }> {
  const term = await requireClosable(termId);
  await recomputeSnapshots(termId);
  return runCommand(actor, async (ctx) => {
    // El mismo candado de los recálculos, antes de tocar nada (ADR-116 regla 6): uno en vuelo termina
    // primero y uno que llega espera y encuentra los snapshots congelados. Sin él, el recálculo escribe
    // en el orden de las personas, el cierre toma las filas en el de `id` y PostgreSQL corta a uno.
    await lockTermSnapshots(ctx.tx, termId);
    // Recién con el candado se leen las filas a cerrar: validarlas antes dejaba entrar un recálculo
    // con hechos distintos entre la validación y el candado, y el término cerraba con alguien sin
    // decisión. Acá nadie más escribe un snapshot del término, y se leen por esta misma transacción.
    await requireAllDecided(ctx.tx, term);
    const nextTermId = (await ensureNextTerm(ctx, term)).id;
    await closeTermPermanence(ctx, termId);
    await freezeSnapshots(ctx, termId);
    await ctx.emit(
      eventOf(
        permanenceClosed,
        { termId, nextTermId, actorId: ctx.actor.personId },
        { dedupeKey: `permanence-apply:${termId}` },
      ),
    );
    return { nextTermId };
  });
}

/**
 * Ejecuta las decisiones confirmadas que falten (`appliedAt` nulo) con el actor que confirmó:
 * reanudable e idempotente (cada comando de `people` tolera repetirse). Devuelve cuántas aplicó.
 */
export async function applyDecisions(termId: string, nextTermId: string): Promise<number> {
  const byPerson = new Map<string, DecisionRow[]>();
  for (const decision of await listDecisions(termId)) {
    byPerson.set(decision.personId, [...(byPerson.get(decision.personId) ?? []), decision]);
  }
  const probationReason = tList("T-801")[1] ?? "";
  let applied = 0;
  for (const [personId, rows] of byPerson) {
    const pending = rows.filter((row) => row.appliedAt === null);
    if (pending.length === 0) {
      continue;
    }
    const personRow = rows.find((row) => row.committeeId === null) ?? null;
    // Lo corre un trabajo, a nombre de quien confirmó la decisión: no hay request ni IP.
    const actor: Actor = {
      personId: personRow?.decidedById ?? rows[0]?.decidedById ?? null,
      ip: null,
    };
    const reason = personRow?.reason ?? "";
    if (personRow?.decision === "EXIT_OE") {
      // Faltar a una obligatoria expulsa (ADR-060 regla 3); quedarse sin comité es permanencia.
      const snapshot = await getSnapshot(personId, termId);
      const expelled =
        snapshot !== null && (snapshot.mandatory.lost.length > 0 || snapshot.expulsionWarning);
      await endMembershipAs(actor, personId, {
        endReason: expelled ? "EXPULSION" : "PERMANENCE",
        note: reason || undefined,
        memorialConsent: false,
        contactConsent: false,
        lastTermId: termId,
      });
    } else {
      for (const row of rows) {
        if (!row.committeeId) {
          continue;
        }
        if (row.decision === "EXIT_COMMITTEE") {
          await leaveCommitteeAs(actor, personId, row.committeeId, termId, row.reason ?? "");
        }
        // La prueba se fija solo en el comité donde quedó en la banda (ADR-060 regla 2).
        if (row.decision === "PROBATION") {
          await setProbationAs(actor, personId, nextTermId, {
            probation: true,
            reason: row.reason ?? (reason || probationReason),
            committeeId: row.committeeId,
          });
        }
      }
    }
    await runCommand(actor, async (ctx) => {
      const now = new Date();
      for (const row of pending) {
        await ctx.tx
          .update(permanenceDecision)
          .set({ appliedAt: now })
          .where(eq(permanenceDecision.id, row.id));
        await ctx.emit(
          eventOf(permanenceDecided, {
            actorId: actor.personId,
            personId,
            termId,
            committeeId: row.committeeId,
            decision: row.decision,
            reason: row.reason ?? "",
          }),
        );
      }
      await ctx.audit({
        action: "permanence-decision.applied",
        entityType: "permanence_decision",
        entityId: `${termId}:${personId}`,
        after: {
          decisions: pending.map((row) => ({
            committeeId: row.committeeId,
            decision: row.decision,
          })),
        },
      });
    });
    applied += pending.length;
  }
  return applied;
}
