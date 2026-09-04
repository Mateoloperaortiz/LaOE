import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { Actor, CommandContext } from "@/db/tx";
import { runCommand } from "@/db/tx";
import { requireConfig } from "@/modules/system";
import { findTermByCode, getTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { leaderScore, manualCredit, permanenceRule, permanenceTable } from "../schema";
import { loadPeopleFacts, loadRules, loadTermFacts } from "./facts";
import { type Rule, type RuleInput, ruleInputSchema, type Scope, toRule } from "./params";
import {
  type CommitteeResult,
  computePerson,
  type Distribution,
  distribution,
  tableSums,
} from "./permanence-pure";
import { referenceCommitteeRules, referenceGeneralRules } from "./templates";

// Reglas por término y tabla (ADR-036 regla 3): GH edita la general y cada líder la de su comité
// mientras GH no la bloquee. Cada mutación encola el recompute del término.

export type PermanenceTableRow = typeof permanenceTable.$inferSelect;

export interface TableRef {
  termId: string;
  scope: Scope;
  committeeId: string | null;
}

export interface TableView extends TableRef {
  rules: Rule[];
  sums: { veterans: number; newcomers: number };
  lockedAt: Date | null;
  lockedById: string | null;
  comment: string | null;
  commentedAt: Date | null;
}

function scopeOf(committeeId: string | null): Scope {
  return committeeId ? "COMMITTEE" : "GENERAL";
}

function tableWhere(ref: TableRef) {
  return and(
    eq(permanenceTable.termId, ref.termId),
    ref.committeeId
      ? eq(permanenceTable.committeeId, ref.committeeId)
      : isNull(permanenceTable.committeeId),
  );
}

function rulesWhere(ref: TableRef) {
  return and(
    eq(permanenceRule.termId, ref.termId),
    ref.committeeId
      ? eq(permanenceRule.committeeId, ref.committeeId)
      : isNull(permanenceRule.committeeId),
  );
}

export async function listTables(termId: string): Promise<PermanenceTableRow[]> {
  return getDb().select().from(permanenceTable).where(eq(permanenceTable.termId, termId));
}

/** Las tablas del término con sus reglas, sumas y bloqueo: la general primero, luego cada comité con reglas o bloqueo. */
export async function listTableViews(termId: string): Promise<TableView[]> {
  const [rules, tables] = [await loadRules(termId), await listTables(termId)];
  const keys = new Map<string, TableView>();
  const ensure = (committeeId: string | null): TableView => {
    const key = committeeId ?? "";
    let view = keys.get(key);
    if (!view) {
      view = {
        termId,
        scope: scopeOf(committeeId),
        committeeId,
        rules: [],
        sums: { veterans: 0, newcomers: 0 },
        lockedAt: null,
        lockedById: null,
        comment: null,
        commentedAt: null,
      };
      keys.set(key, view);
    }
    return view;
  };
  ensure(null);
  for (const rule of rules) {
    ensure(rule.committeeId).rules.push(rule);
  }
  for (const table of tables) {
    const view = ensure(table.committeeId);
    view.lockedAt = table.lockedAt;
    view.lockedById = table.lockedById;
    view.comment = table.comment;
    view.commentedAt = table.commentedAt;
  }
  for (const view of keys.values()) {
    view.rules.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
    view.sums = tableSums(view.rules);
  }
  return [...keys.values()];
}

export async function getTableView(ref: TableRef): Promise<TableView> {
  const views = await listTableViews(ref.termId);
  return (
    views.find((item) => item.committeeId === ref.committeeId) ?? {
      ...ref,
      scope: scopeOf(ref.committeeId),
      rules: [],
      sums: { veterans: 0, newcomers: 0 },
      lockedAt: null,
      lockedById: null,
      comment: null,
      commentedAt: null,
    }
  );
}

export async function getRule(id: string): Promise<Rule | null> {
  const [row] = await getDb()
    .select()
    .from(permanenceRule)
    .where(eq(permanenceRule.id, id))
    .limit(1);
  return row ? toRule(row) : null;
}

/** El líder no edita una tabla bloqueada ni un término con la permanencia cerrada; ADMIN salta el bloqueo. */
export interface RuleContext {
  bypassLock: boolean;
  /** El término ya cerró su permanencia (leído por el wrapper fuera de la transacción). */
  closed: boolean;
}

async function assertEditable(ctx: CommandContext, ref: TableRef, context: RuleContext) {
  if (context.closed) {
    throw new DomainError(t("T-834"));
  }
  if (context.bypassLock) {
    return;
  }
  const [table] = await ctx.tx.select().from(permanenceTable).where(tableWhere(ref)).limit(1);
  if (table?.lockedAt) {
    throw new DomainError(t("T-731", { comité: ref.committeeId ?? "" }));
  }
}

function recompute(ctx: CommandContext, termId: string) {
  return ctx.emit({
    type: "permanence.recompute",
    payload: { termId },
    dedupeKey: `permanence:${termId}:*`,
  });
}

function toValues(ref: TableRef, input: RuleInput) {
  return {
    termId: ref.termId,
    scope: scopeOf(ref.committeeId),
    committeeId: ref.committeeId,
    key: input.key,
    label: input.label,
    description: input.description,
    weight: input.weight,
    appliesTo: input.appliesTo,
    computation: input.computation,
    params: input.params,
    sortOrder: input.sortOrder,
  };
}

export async function createRule(
  ctx: CommandContext,
  ref: TableRef,
  input: RuleInput,
  context: RuleContext,
): Promise<{ id: string }> {
  await assertEditable(ctx, ref, context);
  try {
    const [row] = await ctx.tx
      .insert(permanenceRule)
      .values(toValues(ref, input))
      .returning({ id: permanenceRule.id });
    if (!row) {
      throw new Error("sin regla");
    }
    await ctx.audit({
      action: "permanence-rule.created",
      entityType: "permanence_rule",
      entityId: row.id,
      after: toValues(ref, input),
    });
    await recompute(ctx, ref.termId);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(t("T-729"), "key");
    }
    throw error;
  }
}

export async function updateRule(
  ctx: CommandContext,
  id: string,
  input: RuleInput,
  context: RuleContext,
): Promise<void> {
  const [before] = await ctx.tx.select().from(permanenceRule).where(eq(permanenceRule.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const ref = { termId: before.termId, scope: before.scope, committeeId: before.committeeId };
  await assertEditable(ctx, ref, context);
  try {
    await ctx.tx.update(permanenceRule).set(toValues(ref, input)).where(eq(permanenceRule.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(t("T-729"), "key");
    }
    throw error;
  }
  await ctx.audit({
    action: "permanence-rule.updated",
    entityType: "permanence_rule",
    entityId: id,
    before: { key: before.key, weight: before.weight, params: before.params },
    after: toValues(ref, input),
  });
  await recompute(ctx, ref.termId);
}

export async function deleteRule(ctx: CommandContext, id: string, context: RuleContext) {
  const [before] = await ctx.tx.select().from(permanenceRule).where(eq(permanenceRule.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const ref = { termId: before.termId, scope: before.scope, committeeId: before.committeeId };
  await assertEditable(ctx, ref, context);
  const [[scores], [credits]] = [
    await ctx.tx.select({ n: count() }).from(leaderScore).where(eq(leaderScore.ruleId, id)),
    await ctx.tx.select({ n: count() }).from(manualCredit).where(eq(manualCredit.ruleId, id)),
  ];
  if ((scores?.n ?? 0) > 0 || (credits?.n ?? 0) > 0) {
    throw new DomainError(t("T-732"));
  }
  await ctx.tx.delete(permanenceRule).where(eq(permanenceRule.id, id));
  await ctx.audit({
    action: "permanence-rule.deleted",
    entityType: "permanence_rule",
    entityId: id,
    before: { key: before.key, weight: before.weight },
  });
  await recompute(ctx, ref.termId);
}

async function insertMany(
  ctx: CommandContext,
  ref: TableRef,
  inputs: RuleInput[],
): Promise<number> {
  if (inputs.length === 0) {
    return 0;
  }
  await ctx.tx.insert(permanenceRule).values(inputs.map((input) => toValues(ref, input)));
  await recompute(ctx, ref.termId);
  return inputs.length;
}

async function assertEmpty(ctx: CommandContext, ref: TableRef) {
  const [row] = await ctx.tx.select({ n: count() }).from(permanenceRule).where(rulesWhere(ref));
  if ((row?.n ?? 0) > 0) {
    throw new DomainError(t("T-733"));
  }
}

/** Copia la tabla del mismo ámbito desde otro término sobre una tabla vacía. */
export async function copyRules(
  ctx: CommandContext,
  ref: TableRef,
  fromTermId: string,
  context: RuleContext,
): Promise<number> {
  await assertEditable(ctx, ref, context);
  await assertEmpty(ctx, ref);
  const source = await ctx.tx
    .select()
    .from(permanenceRule)
    .where(rulesWhere({ ...ref, termId: fromTermId }))
    .orderBy(asc(permanenceRule.sortOrder));
  if (source.length === 0) {
    throw new DomainError(t("T-734"));
  }
  const inputs = source.map((row) =>
    ruleInputSchema.parse({
      key: row.key,
      label: row.label,
      description: row.description,
      weight: row.weight,
      appliesTo: row.appliesTo,
      computation: row.computation,
      params: row.params,
      sortOrder: row.sortOrder,
    }),
  );
  const n = await insertMany(ctx, ref, inputs);
  await ctx.audit({
    action: "permanence-rules.copied",
    entityType: "permanence_table",
    entityId: `${ref.termId}:${ref.committeeId ?? "general"}`,
    after: { fromTermId, rules: n },
  });
  return n;
}

/** Carga la tabla de referencia (general de 2026-2 o la de A3) sobre una tabla vacía. */
export async function applyTemplate(
  ctx: CommandContext,
  ref: TableRef,
  context: RuleContext & { assembliesForCredit: number },
): Promise<number> {
  await assertEditable(ctx, ref, context);
  await assertEmpty(ctx, ref);
  const inputs = (
    ref.committeeId ? referenceCommitteeRules() : referenceGeneralRules(context.assembliesForCredit)
  ).map((input) => ruleInputSchema.parse(input));
  const n = await insertMany(ctx, ref, inputs);
  await ctx.audit({
    action: "permanence-rules.template",
    entityType: "permanence_table",
    entityId: `${ref.termId}:${ref.committeeId ?? "general"}`,
    after: { rules: n },
  });
  return n;
}

async function upsertTable(
  ctx: CommandContext,
  ref: TableRef,
  set: Partial<
    Pick<
      PermanenceTableRow,
      "lockedAt" | "lockedById" | "comment" | "commentedById" | "commentedAt"
    >
  >,
) {
  await ctx.tx
    .insert(permanenceTable)
    .values({
      termId: ref.termId,
      scope: scopeOf(ref.committeeId),
      committeeId: ref.committeeId,
      ...set,
    })
    .onConflictDoUpdate({
      target: ref.committeeId
        ? [permanenceTable.termId, permanenceTable.committeeId]
        : [permanenceTable.termId],
      targetWhere: ref.committeeId
        ? sql`${permanenceTable.scope} = 'COMMITTEE'`
        : sql`${permanenceTable.scope} = 'GENERAL'`,
      set,
    });
}

export async function setTableLock(
  ctx: CommandContext,
  ref: TableRef,
  locked: boolean,
): Promise<void> {
  const now = new Date();
  await upsertTable(ctx, ref, {
    lockedAt: locked ? now : null,
    lockedById: locked ? ctx.actor.personId : null,
  });
  await ctx.audit({
    action: locked ? "permanence-table.locked" : "permanence-table.unlocked",
    entityType: "permanence_table",
    entityId: `${ref.termId}:${ref.committeeId ?? "general"}`,
    after: { locked },
  });
}

export async function commentTable(
  ctx: CommandContext,
  ref: TableRef,
  comment: string,
): Promise<void> {
  const trimmed = comment.trim();
  await upsertTable(ctx, ref, {
    comment: trimmed || null,
    commentedById: trimmed ? ctx.actor.personId : null,
    commentedAt: trimmed ? new Date() : null,
  });
  await ctx.audit({
    action: "permanence-table.commented",
    entityType: "permanence_table",
    entityId: `${ref.termId}:${ref.committeeId ?? "general"}`,
    after: { comment: trimmed },
  });
}

/** Bloquea todas las tablas de comité del término (una fila por comité activo). */
export async function lockAllCommitteeTables(
  ctx: CommandContext,
  termId: string,
  committeeIds: string[],
): Promise<number> {
  for (const committeeId of committeeIds) {
    await setTableLock(ctx, { termId, scope: "COMMITTEE", committeeId }, true);
  }
  return committeeIds.length;
}

export interface ImpactPreview extends Distribution {
  committeeId: string | null;
}

/** Vista previa del impacto: calcula en memoria con las reglas guardadas y resume por estado. */
export async function previewImpact(
  termId: string,
  committeeId: string | null,
  now = new Date(),
): Promise<ImpactPreview | null> {
  const facts = await loadTermFacts(termId);
  if (!facts) {
    return null;
  }
  const people = await loadPeopleFacts(facts);
  const rows: CommitteeResult[] = [];
  for (const person of people) {
    const result = computePerson(facts, person, now);
    for (const item of result.results) {
      if (committeeId === null || item.committeeId === committeeId) {
        rows.push(item);
      }
    }
  }
  return { committeeId, ...distribution(rows) };
}

// Wrappers: resuelven lo que no vive en el módulo antes de la transacción (ADR-035 regla 1).

export interface EditorContext {
  bypassLock: boolean;
}

async function contextFor(termId: string, editor: EditorContext): Promise<RuleContext> {
  const term = await getTerm(termId);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  return { bypassLock: editor.bypassLock, closed: term.permanenceClosedAt !== null };
}

async function contextForRule(id: string, editor: EditorContext): Promise<RuleContext> {
  const rule = await getRule(id);
  if (!rule) {
    throw new DomainError(t("T-032"));
  }
  return contextFor(rule.termId, editor);
}

export async function createRuleAs(
  actor: Actor,
  ref: TableRef,
  input: RuleInput,
  editor: EditorContext,
) {
  const context = await contextFor(ref.termId, editor);
  return runCommand(actor, (ctx) => createRule(ctx, ref, input, context));
}

export async function updateRuleAs(
  actor: Actor,
  id: string,
  input: RuleInput,
  editor: EditorContext,
) {
  const context = await contextForRule(id, editor);
  return runCommand(actor, (ctx) => updateRule(ctx, id, input, context));
}

export async function deleteRuleAs(actor: Actor, id: string, editor: EditorContext) {
  const context = await contextForRule(id, editor);
  return runCommand(actor, (ctx) => deleteRule(ctx, id, context));
}

/** Copia desde el término anterior por código (2026-2 ← 2026-1). */
export async function copyFromPreviousTermAs(
  actor: Actor,
  ref: TableRef,
  editor: EditorContext,
): Promise<number> {
  const term = await getTerm(ref.termId);
  if (!term) {
    throw new DomainError(t("T-032"));
  }
  const year = Number(term.code.slice(0, 4));
  const previousCode = term.semester === 2 ? `${year}-1` : `${year - 1}-2`;
  const previous = await findTermByCode(previousCode);
  if (!previous) {
    throw new DomainError(t("T-734"));
  }
  const context = { bypassLock: editor.bypassLock, closed: term.permanenceClosedAt !== null };
  return runCommand(actor, (ctx) => copyRules(ctx, ref, previous.id, context));
}

export async function applyTemplateAs(actor: Actor, ref: TableRef, editor: EditorContext) {
  const context = await contextFor(ref.termId, editor);
  const assembliesForCredit = await requireConfig("permanence.assembliesForCredit");
  return runCommand(actor, (ctx) => applyTemplate(ctx, ref, { ...context, assembliesForCredit }));
}

export function setTableLockAs(actor: Actor, ref: TableRef, locked: boolean) {
  return runCommand(actor, (ctx) => setTableLock(ctx, ref, locked));
}

export function commentTableAs(actor: Actor, ref: TableRef, comment: string) {
  return runCommand(actor, (ctx) => commentTable(ctx, ref, comment));
}

export function lockAllCommitteeTablesAs(actor: Actor, termId: string, committeeIds: string[]) {
  return runCommand(actor, (ctx) => lockAllCommitteeTables(ctx, termId, committeeIds));
}
