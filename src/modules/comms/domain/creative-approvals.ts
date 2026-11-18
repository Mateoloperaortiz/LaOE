import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, enqueueEvent, runCommand } from "@/db/tx";
import { creativeUploadExpires } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { createAnnouncement, isCreativeOnBoard, publishAnnouncement } from "@/modules/content";
import {
  type BoardDecision,
  boardApprovalLabel,
  getPeopleByIds,
  listCommitteesByIds,
  notifyApproval,
  readBoardDecision,
  requireApprovalAuthority,
  seatDeciders,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import {
  archiveReviewFile,
  ownsReviewUpload,
  reviewId,
  reviewUpload,
  signReviewUpload,
  submittedReviewFile,
} from "@/shared/adapters/review-file";
import { deleteObject, presignRead } from "@/shared/adapters/storage";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { creativeApproval } from "../schema";

export const creativeRequestSchema = z.object({
  id: reviewId,
  title: z.string().trim().min(2).max(140),
  channel: z.string().trim().min(2).max(120).nullable(),
  caption: z.string().trim().max(20_000).default(""),
  file: submittedReviewFile,
});

const uploadPrefix = (committeeId: string, owner: string, id: string, digest: string) =>
  `creatives/incoming/${committeeId}/${owner}/${id}/${digest}`;
const archiveKey = (id: string, digest: string) => `creatives/files/${id}/${digest}`;

export async function prepareCreativeUpload(
  owner: string,
  committeeId: string,
  raw: z.input<typeof reviewUpload>,
) {
  const { id, digest, byteSize } = reviewUpload.parse(raw);
  const signed = await signReviewUpload(uploadPrefix(committeeId, owner, id, digest), byteSize);
  await enqueueEvent(
    getDb(),
    eventOf(creativeUploadExpires, { key: signed.key }),
    new Date(Date.now() + 86_400_000),
  );
  return signed;
}

export async function requestCreativeAs(
  actor: Actor,
  committeeId: string,
  raw: z.input<typeof creativeRequestSchema>,
  now = new Date(),
) {
  const owner = actor.personId;
  if (!owner || !committeeId) throw new DomainError(t("T-032"));
  const { id, title, caption, channel, file } = creativeRequestSchema.parse(raw);
  if (!ownsReviewUpload(uploadPrefix(committeeId, owner, id, file.digest), file.key))
    throw new DomainError(t("T-5180"));
  const result = await runCommand(actor, async (ctx) => {
    // Dos reintentos de la misma solicitud comparten la copia archivada y la notificación.
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`creative:${id}`}, 0))`,
    );
    const [existing] = await ctx.tx
      .select()
      .from(creativeApproval)
      .where(eq(creativeApproval.id, id));
    if (existing) {
      if (
        existing.committeeId !== committeeId ||
        existing.requestedById !== owner ||
        existing.title !== title ||
        existing.channel !== channel ||
        existing.caption !== caption ||
        existing.fileName !== file.name ||
        existing.digest !== file.digest
      )
        throw new DomainError(t("T-5169"));
      return { id };
    }
    const key = archiveKey(id, file.digest);
    const values = {
      id,
      title,
      caption,
      channel,
      committeeId,
      fileName: file.name,
      digest: file.digest,
      requestedById: owner,
      requestedAt: now,
    };
    try {
      await archiveReviewFile(file.key, key, file.digest, t("T-5180"));
      await ctx.tx.insert(creativeApproval).values(values);
      await ctx.audit({
        action: "creative.requested",
        entityType: "creative_approval",
        entityId: id,
        after: values,
      });
      const term = await getCurrentTerm(now, ctx.tx);
      if (term)
        await notifyApproval(ctx, await seatDeciders("VP_COMMUNICATIONS", term.id, ctx.tx), {
          title: tList("T-5179")[0],
          body: title,
          url: `/admin/avales?pieza=${id}`,
          dedupeKey: `pieza-pedida:${id}`,
        });
    } catch (error) {
      await Promise.allSettled([deleteObject(key)]);
      throw error;
    }
    return { id };
  });
  await Promise.allSettled([deleteObject(file.key)]);
  return result;
}

export async function creativeFileUrl(
  id: string,
  access: { all: boolean; committees: string[]; readableCommittees: string[] },
) {
  const [row] = await getDb().select().from(creativeApproval).where(eq(creativeApproval.id, id));
  if (!row) return null;
  const reviewer = access.all || access.committees.includes(row.committeeId);
  if (
    !reviewer &&
    (!access.readableCommittees.includes(row.committeeId) ||
      row.channel !== null ||
      !row.publishedAt ||
      !(await isCreativeOnBoard(row.id, row.committeeId)))
  )
    return null;
  return presignRead(archiveKey(id, row.digest), 300, row.fileName);
}

export function publishCreativeAs(actor: Actor, committeeId: string, id: string, now = new Date()) {
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-032"));
    const [row] = await ctx.tx
      .select()
      .from(creativeApproval)
      .where(and(eq(creativeApproval.id, id), eq(creativeApproval.committeeId, committeeId)))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "APPROVED") throw new DomainError(t("T-5183"));
    if (row.publishedAt) return;
    if (row.channel === null) {
      const post = await createAnnouncement(
        ctx,
        { title: row.title, body: row.caption, audience: "MEMBERS", committeeId, pinned: false },
        id,
      );
      await publishAnnouncement(ctx, post.id, now);
    }
    const publication = { publishedAt: now, publishedById: actor.personId };
    await ctx.tx.update(creativeApproval).set(publication).where(eq(creativeApproval.id, id));
    await ctx.audit({
      action: "creative.published",
      entityType: "creative_approval",
      entityId: id,
      after: { ...publication, channel: row.channel },
    });
  });
}

export async function listCreativeApprovals(
  filter: { committeeId: string } | { pendingOnly: boolean },
) {
  const where =
    "committeeId" in filter
      ? eq(creativeApproval.committeeId, filter.committeeId)
      : filter.pendingOnly
        ? eq(creativeApproval.status, "PENDING")
        : undefined;
  const rows = await getDb()
    .select()
    .from(creativeApproval)
    .where(where)
    .orderBy(desc(creativeApproval.requestedAt), desc(creativeApproval.id));
  const [committees, people] = await Promise.all([
    listCommitteesByIds([...new Set(rows.map((row) => row.committeeId))]),
    getPeopleByIds([
      ...new Set(
        rows
          .flatMap((row) => [row.requestedById, row.decidedById, row.publishedById])
          .filter((id): id is string => id !== null),
      ),
    ]),
  ]);
  const names = new Map(committees.map((c) => [c.id, c.name]));
  return rows.map((row) => ({
    ...row,
    committeeName: names.get(row.committeeId) ?? "",
    requestedByName: people.get(row.requestedById ?? "")?.fullName,
    decidedByName: people.get(row.decidedById ?? "")?.fullName,
    publishedByName: people.get(row.publishedById ?? "")?.fullName,
  }));
}

export function decideCreativeAs(actor: Actor, id: string, raw: BoardDecision, now = new Date()) {
  return runCommand(actor, async (ctx) => {
    const input = readBoardDecision(raw);
    const authority = await requireApprovalAuthority(ctx, "VP_COMMUNICATIONS", now);
    const [row] = await ctx.tx
      .select()
      .from(creativeApproval)
      .where(eq(creativeApproval.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") throw new DomainError(t("T-2296"));
    const decision = {
      status: input.decision,
      decisionNote: input.note,
      decidedAt: now,
      decidedById: actor.personId,
      decidedAs: authority,
    };
    await ctx.tx.update(creativeApproval).set(decision).where(eq(creativeApproval.id, id));
    await ctx.audit({
      action: "creative.decided",
      entityType: "creative_approval",
      entityId: id,
      before: { status: row.status },
      after: decision,
    });
    if (row.requestedById) {
      const [committee] = await listCommitteesByIds([row.committeeId]);
      await notifyApproval(ctx, [row.requestedById], {
        title: tList("T-5179")[1],
        body: [row.title, boardApprovalLabel(decision.status), input.note]
          .filter(Boolean)
          .join(" · "),
        url: committee ? `/admin/comites/${committee.slug}?area=comunicacion` : "/admin",
        dedupeKey: `pieza-decidida:${id}`,
      });
    }
  });
}
