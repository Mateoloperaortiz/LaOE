import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { candidacyApproval, committee, committeeRole, membership, person } from "../schema";
import { assertBenefitsAvailable } from "./benefits";
import {
  type BoardDecision,
  boardApprovalLabel,
  notifyApproval,
  readBoardDecision,
  requireApprovalAuthority,
} from "./board-approval";
import { seatDeciders } from "./board-seats";
import { isNewForLeadership } from "./inhabilities";
import { lockMembershipCycle } from "./wallet-member";

async function candidacies(
  filter: { personId: string } | { pendingTermId: string },
  exec: Executor = getDb(),
) {
  return exec
    .select({
      ...getTableColumns(candidacyApproval),
      personName: sql<string>`coalesce(${person.fullName}, '')`,
      committeeName: committee.name,
      roleLabel: committeeRole.label,
    })
    .from(candidacyApproval)
    .innerJoin(person, eq(person.id, candidacyApproval.personId))
    .innerJoin(committee, eq(committee.id, candidacyApproval.committeeId))
    .innerJoin(committeeRole, eq(committeeRole.code, candidacyApproval.roleCode))
    .where(
      "personId" in filter
        ? eq(candidacyApproval.personId, filter.personId)
        : and(
            eq(candidacyApproval.status, "PENDING"),
            eq(candidacyApproval.termId, filter.pendingTermId),
          ),
    )
    .orderBy(desc(candidacyApproval.requestedAt));
}

export async function pendingCandidacies(now = new Date()) {
  const term = await getCurrentTerm(now);
  return term ? candidacies({ pendingTermId: term.id }) : [];
}

export async function myCandidacies(personId: string, now = new Date()) {
  const term = await getCurrentTerm(now);
  const db = getDb();
  const [member] = await db
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  const canRequest =
    term && member?.status === "ACTIVE" && (await isNewForLeadership(db, personId, term.id));
  const [history, roles] = await Promise.all([
    candidacies({ personId }),
    canRequest
      ? db
          .select({ code: committeeRole.code, label: committeeRole.label })
          .from(committeeRole)
          .where(and(eq(committeeRole.isLeadership, true), eq(committeeRole.retired, false)))
          .orderBy(asc(committeeRole.sortOrder))
      : [],
  ]);
  return { term, roles, history };
}

export function requestCandidacyAs(
  actor: Actor,
  input: { termId: string; committeeId: string; roleCode: string },
  now = new Date(),
) {
  return runCommand(actor, async (ctx) => {
    const personId = ctx.actor.personId;
    const term = await getCurrentTerm(now, ctx.tx);
    if (!personId || !term || term.id !== input.termId) throw new DomainError(t("T-5155"));
    await assertBenefitsAvailable(ctx.tx, personId, term.id, now);
    const [member] = await ctx.tx
      .select()
      .from(membership)
      .where(eq(membership.personId, personId));
    if (member?.status !== "ACTIVE" || !(await isNewForLeadership(ctx.tx, personId, term.id)))
      throw new DomainError(t("T-5155"));
    const [target] = await ctx.tx
      .select({ name: committee.name })
      .from(committee)
      .where(and(eq(committee.id, input.committeeId), ne(committee.status, "INACTIVE")));
    const [role] = await ctx.tx
      .select({ code: committeeRole.code })
      .from(committeeRole)
      .where(
        and(
          eq(committeeRole.code, input.roleCode),
          eq(committeeRole.isLeadership, true),
          eq(committeeRole.retired, false),
        ),
      );
    if (!target || !role) throw new DomainError(t("T-5155"));
    const [previous] = await ctx.tx
      .select({ id: candidacyApproval.id })
      .from(candidacyApproval)
      .where(
        and(
          eq(candidacyApproval.personId, personId),
          eq(candidacyApproval.termId, term.id),
          eq(candidacyApproval.committeeId, input.committeeId),
          eq(candidacyApproval.roleCode, input.roleCode),
          inArray(candidacyApproval.status, ["PENDING", "APPROVED"]),
        ),
      );
    if (previous) return previous;
    const [created] = await ctx.tx
      .insert(candidacyApproval)
      .values({ personId, ...input, requestedAt: now })
      .returning({ id: candidacyApproval.id });
    if (!created) throw new Error("No se pudo crear la postulación");
    await ctx.audit({
      action: "candidacy.requested",
      entityType: "candidacy_approval",
      entityId: created.id,
      after: { personId, ...input },
    });
    const [title, body] = tList("T-5156");
    await notifyApproval(ctx, await seatDeciders("VP_GH", term.id, ctx.tx), {
      title,
      body: body.replace("{comité}", target.name),
      url: `/admin/avales?postulacion=${created.id}`,
      dedupeKey: `postulacion-pedida:${created.id}`,
    });
    return created;
  });
}

export function decideCandidacyAs(actor: Actor, id: string, raw: BoardDecision, now = new Date()) {
  return runCommand(actor, async (ctx) => {
    const input = readBoardDecision(raw);
    const authority = await requireApprovalAuthority(ctx, "VP_GH", now);
    const term = await getCurrentTerm(now, ctx.tx);
    if (!term) throw new DomainError(t("T-032"));
    const [subject] = await ctx.tx
      .select({ personId: candidacyApproval.personId })
      .from(candidacyApproval)
      .where(eq(candidacyApproval.id, id));
    if (!subject) throw new DomainError(t("T-032"));
    await lockMembershipCycle(ctx.tx, subject.personId);
    const [row] = await ctx.tx
      .select({
        ...getTableColumns(candidacyApproval),
        roleLabel: committeeRole.label,
        committeeName: committee.name,
      })
      .from(candidacyApproval)
      .innerJoin(committee, eq(committee.id, candidacyApproval.committeeId))
      .innerJoin(committeeRole, eq(committeeRole.code, candidacyApproval.roleCode))
      .where(and(eq(candidacyApproval.id, id), eq(candidacyApproval.termId, term.id)))
      .for("update", { of: candidacyApproval });
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") throw new DomainError(t("T-2296"));
    if (input.decision === "APPROVED") {
      await assertBenefitsAvailable(ctx.tx, row.personId, term.id, now);
      const [member] = await ctx.tx
        .select({ status: membership.status })
        .from(membership)
        .where(eq(membership.personId, row.personId));
      if (member?.status !== "ACTIVE") throw new DomainError(t("T-5155"));
    }
    await ctx.tx
      .update(candidacyApproval)
      .set({
        status: input.decision,
        decisionNote: input.note,
        decidedAs: authority,
        decidedById: actor.personId,
        decidedAt: now,
      })
      .where(eq(candidacyApproval.id, id));
    await ctx.audit({
      action: "candidacy.decided",
      entityType: "candidacy_approval",
      entityId: id,
      before: { status: row.status },
      after: { status: input.decision, as: authority, note: input.note },
    });
    const [, , title, body] = tList("T-5156");
    await notifyApproval(ctx, [row.personId], {
      title,
      body: body
        .replace("{cargo}", row.roleLabel)
        .replace("{comité}", row.committeeName)
        .replace("{estado}", boardApprovalLabel(input.decision).toLowerCase()),
      url: "/app/comites#postulaciones",
      dedupeKey: `postulacion-decidida:${id}`,
    });
  });
}
