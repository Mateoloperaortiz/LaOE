import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import { currentSeatAuthority, getPeopleByIds, listMarketingDirectors } from "@/modules/people";
import { hasWorkCommitteeMembership } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { creativeApproval, creativeFeedback } from "../schema";

export async function marketingAttribution(
  committeeId: string,
  assignmentId: string,
  now: Date,
  exec: Executor,
) {
  const term = await getCurrentTerm(now, exec);
  const director =
    term &&
    (await listMarketingDirectors(committeeId, term.id, exec)).find(
      (row) => row.id === assignmentId,
    );
  if (!term || !director) throw new DomainError(t("T-5187"));
  return {
    marketingAssignmentId: director.id,
    marketingDirectorId: director.personId,
    marketingTermId: term.id,
  };
}

// La posición depende de cuándo se publicó. Verificar una pieza histórica puede incorporar una anterior.
function rankedFeed(exec: Executor, termId: string) {
  return exec
    .select({
      id: creativeApproval.id,
      title: creativeApproval.title,
      fileName: creativeApproval.fileName,
      directorId: creativeApproval.marketingDirectorId,
      publishedAt: creativeApproval.publishedAt,
      position:
        sql<number>`row_number() over (partition by ${creativeApproval.marketingAssignmentId} order by ${creativeApproval.publishedAt}, ${creativeApproval.id})`
          .mapWith(Number)
          .as("position"),
    })
    .from(creativeApproval)
    .where(
      and(
        eq(creativeApproval.marketingTermId, termId),
        isNotNull(creativeApproval.marketingAssignmentId),
        isNotNull(creativeApproval.publishedAt),
        eq(creativeApproval.status, "APPROVED"),
      ),
    )
    .as("ranked_feed");
}

async function mentoringRows(personId: string, now: Date, exec: Executor, pieceId?: string) {
  const term = await getCurrentTerm(now, exec);
  if (!term) return { canComment: false, rows: [] };
  const canComment = await hasWorkCommitteeMembership(personId, term.id, "CCM", exec);
  const seesAll =
    canComment || Boolean(await currentSeatAuthority(personId, "VP_COMMUNICATIONS", exec, now));
  const feed = rankedFeed(exec, term.id);
  const rows = await exec
    .select()
    .from(feed)
    .where(
      and(
        lte(feed.position, 3),
        seesAll ? undefined : eq(feed.directorId, personId),
        pieceId ? eq(feed.id, pieceId) : undefined,
      ),
    )
    .orderBy(asc(feed.publishedAt), asc(feed.id));
  return { canComment, rows };
}

export async function canReadMentoredPiece(personId: string, id: string) {
  return (await mentoringRows(personId, new Date(), getDb(), id)).rows.length > 0;
}

export async function creativeMentoringFor(personId: string, now = new Date()) {
  const { canComment, rows } = await mentoringRows(personId, now, getDb());
  const notes = rows.length
    ? await getDb()
        .select()
        .from(creativeFeedback)
        .where(
          inArray(
            creativeFeedback.pieceId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(creativeFeedback.createdAt), asc(creativeFeedback.id))
    : [];
  const people = await getPeopleByIds([
    ...new Set(
      [...rows.map((row) => row.directorId), ...notes.map((row) => row.authorId)].filter(
        (id): id is string => id !== null,
      ),
    ),
  ]);
  return {
    canComment,
    pieces: rows.map((row) => ({
      ...row,
      directorName: people.get(row.directorId ?? "")?.fullName,
      notes: notes
        .filter((note) => note.pieceId === row.id)
        .map((note) => ({ ...note, author: people.get(note.authorId ?? "")?.fullName })),
    })),
  };
}

export function leaveCreativeFeedbackAs(
  actor: Actor,
  raw: { id: string; pieceId: string; body: string },
  now = new Date(),
) {
  const input = z
    .object({ id: z.cuid2(), pieceId: z.cuid2(), body: z.string().trim().min(1).max(2000) })
    .parse(raw);
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-032"));
    const access = await mentoringRows(actor.personId, now, ctx.tx, input.pieceId);
    if (!access.canComment || !access.rows.length) throw new DomainError(t("T-032"));
    const [added] = await ctx.tx
      .insert(creativeFeedback)
      .values({ ...input, authorId: actor.personId, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: creativeFeedback.id });
    if (!added) {
      const [previous] = await ctx.tx
        .select()
        .from(creativeFeedback)
        .where(eq(creativeFeedback.id, input.id));
      if (
        previous?.authorId !== actor.personId ||
        previous.pieceId !== input.pieceId ||
        previous.body !== input.body
      )
        throw new DomainError(t("T-5169"));
      return;
    }
    await ctx.audit({
      action: "creative.feedback-added",
      entityType: "creative_approval",
      entityId: input.pieceId,
      after: { feedbackId: input.id },
    });
  });
}

export function verifyHistoricalFeedAs(
  actor: Actor,
  committeeId: string,
  pieceId: string,
  assignmentId: string,
) {
  return runCommand(actor, async (ctx) => {
    const [piece] = await ctx.tx
      .select()
      .from(creativeApproval)
      .where(and(eq(creativeApproval.committeeId, committeeId), eq(creativeApproval.id, pieceId)))
      .for("update");
    if (!piece?.publishedAt || !piece.channel || piece.status !== "APPROVED")
      throw new DomainError(t("T-032"));
    if (piece.channelVerified && piece.marketingAssignmentId === assignmentId) return;
    if (piece.channelVerified) throw new DomainError(t("T-032"));
    const attribution = await marketingAttribution(
      committeeId,
      assignmentId,
      piece.publishedAt,
      ctx.tx,
    );
    await ctx.tx
      .update(creativeApproval)
      .set({ ...attribution, channelVerified: true })
      .where(eq(creativeApproval.id, pieceId));
    await ctx.audit({
      action: "creative.feed-verified",
      entityType: "creative_approval",
      entityId: pieceId,
      after: attribution,
    });
  });
}
