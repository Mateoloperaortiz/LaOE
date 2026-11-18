import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { boardApprovalStatus } from "@/db/enums";
import { type Actor, enqueueEvent, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { contractUploadExpires } from "@/domain-events/finance";
import {
  type BoardDecision,
  currentSeatAuthority,
  getPeopleByIds,
  listCommitteesByIds,
  notifyApproval,
  readBoardDecision,
  seatDeciders,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import {
  deleteObject,
  getObject,
  headObject,
  presignRead,
  presignUpload,
  putObject,
} from "@/shared/adapters/storage";
import { t, tLabels, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { CONTRACT_FILE_SLOTS, type ContractFileSlot, financeContract } from "../schema";

export const CONTRACT_FILE_MAX_BYTES = 20 * 1024 * 1024;
const binary = "application/octet-stream";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const file = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^/\\\p{Cc}]+$/u),
  digest,
});
const idSchema = z.cuid2().length(24);
const upload = file.extend({ key: z.string().max(400) });
const storedFiles = z.object({ contract: file, legal: file, coordinator: file });
export const contractUploadSchema = z.object({
  id: idSchema,
  slot: z.enum(CONTRACT_FILE_SLOTS),
  digest,
  byteSize: z.number().int().positive().max(CONTRACT_FILE_MAX_BYTES),
});
export const contractRequestSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(2).max(200),
  supplier: z.string().trim().min(1).max(200),
  amount: z.coerce.number().positive().max(9_999_999_999.99).multipleOf(0.01),
  files: z.object({ contract: upload, legal: upload, coordinator: upload }),
});
type Scope = { committeeId: string };
const sourcePrefix = (
  owner: string,
  scope: Scope,
  id: string,
  slot: ContractFileSlot,
  hash: string,
) => `contracts/incoming/${scope.committeeId}/${owner}/${id}/${slot}/${hash}`;
const filedKey = (id: string, slot: ContractFileSlot, hash: string) =>
  `contracts/files/${id}/${slot}/${hash}`;

export async function prepareContractUpload(
  owner: string,
  scope: Scope,
  raw: z.input<typeof contractUploadSchema>,
) {
  const { id, slot, digest: hash, byteSize } = contractUploadSchema.parse(raw);
  const key = `${sourcePrefix(owner, scope, id, slot, hash)}/${createId()}`;
  const signed = await presignUpload({
    key,
    contentType: binary,
    minBytes: byteSize,
    maxBytes: byteSize,
  });
  await enqueueEvent(
    getDb(),
    eventOf(contractUploadExpires, { key }),
    new Date(Date.now() + 86_400_000),
  );
  return signed;
}

export async function requestContractAs(
  actor: Actor,
  raw: z.input<typeof contractRequestSchema>,
  scope: Scope,
  now = new Date(),
) {
  const owner = actor.personId;
  if (!owner || !scope?.committeeId) throw new DomainError(t("T-032"));
  const input = contractRequestSchema.parse(raw);
  const files = storedFiles.parse(input.files);
  for (const slot of CONTRACT_FILE_SLOTS) {
    const attachment = input.files[slot];
    const prefix = `${sourcePrefix(owner, scope, input.id, slot, attachment.digest)}/`;
    if (
      !attachment.key.startsWith(prefix) ||
      !idSchema.safeParse(attachment.key.slice(prefix.length)).success
    )
      throw new DomainError(t("T-5174"));
  }
  const result = await runCommand(actor, async (ctx) => {
    await ctx.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`contract:${input.id}`}, 0))`,
    );
    const [existing] = await ctx.tx
      .select()
      .from(financeContract)
      .where(eq(financeContract.id, input.id));
    if (existing) {
      if (
        existing.committeeId !== scope.committeeId ||
        existing.requestedById !== owner ||
        existing.title !== input.title ||
        existing.supplier !== input.supplier ||
        existing.amount !== input.amount ||
        !isDeepStrictEqual(existing.files, files)
      )
        throw new DomainError(t("T-5169"));
      return { id: existing.id };
    }
    const archived: string[] = [];
    try {
      for (const slot of CONTRACT_FILE_SLOTS) {
        const source = input.files[slot].key;
        const info = await headObject(source);
        if (
          !info?.byteSize ||
          info.byteSize > CONTRACT_FILE_MAX_BYTES ||
          info.contentType !== binary
        )
          throw new DomainError(t("T-5174"));
        const bytes = await getObject(source);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== input.files[slot].digest || bytes.byteLength !== info.byteSize)
          throw new DomainError(t("T-5174"));
        // La dirección expedida al navegador solo escribe en incoming. La copia archivada queda fuera de su alcance.
        const stored = filedKey(input.id, slot, hash);
        archived.push(stored);
        await putObject(stored, bytes, binary);
      }
      const values = { ...input, ...scope, files, requestedById: owner, requestedAt: now };
      await ctx.tx.insert(financeContract).values(values);
      await ctx.audit({
        action: "contract.requested",
        entityType: "finance_contract",
        entityId: input.id,
        after: values,
      });
      const term = await getCurrentTerm(now, ctx.tx);
      if (term) {
        const recipients = new Set([
          ...(await seatDeciders("VP_FINANCE", term.id, ctx.tx)),
          ...(await seatDeciders("PRESIDENT", term.id, ctx.tx)),
        ]);
        await notifyApproval(ctx, [...recipients], {
          title: tList("T-5175")[0],
          body: input.title,
          url: `/admin/avales?contrato=${input.id}`,
          dedupeKey: `contrato-pedido:${input.id}`,
        });
      }
      return { id: input.id };
    } catch (error) {
      await Promise.allSettled(archived.map(deleteObject));
      throw error;
    }
  });
  await Promise.allSettled(CONTRACT_FILE_SLOTS.map((slot) => deleteObject(input.files[slot].key)));
  return result;
}

export async function listContracts(filter: { committeeId: string } | { pendingOnly: boolean }) {
  const rows = await getDb()
    .select()
    .from(financeContract)
    .where(
      "committeeId" in filter
        ? eq(financeContract.committeeId, filter.committeeId)
        : filter.pendingOnly
          ? eq(financeContract.status, "PENDING")
          : undefined,
    )
    .orderBy(desc(financeContract.requestedAt), desc(financeContract.id));
  const [committees, people] = await Promise.all([
    listCommitteesByIds([...new Set(rows.map((r) => r.committeeId))]),
    getPeopleByIds([
      ...new Set(
        rows.flatMap((r) =>
          [r.decidedById, r.requestedById].filter((id): id is string => id !== null),
        ),
      ),
    ]),
  ]);
  const names = new Map(committees.map((c) => [c.id, c.name]));
  return rows.map((row) => ({
    ...row,
    committeeName: names.get(row.committeeId) ?? "",
    requestedByName: people.get(row.requestedById ?? "")?.fullName,
    decidedByName: people.get(row.decidedById ?? "")?.fullName,
  }));
}

export function decideContractAs(actor: Actor, id: string, raw: BoardDecision, now = new Date()) {
  return runCommand(actor, async (ctx) => {
    const input = readBoardDecision(raw);
    const personId = actor.personId;
    if (!personId) throw new DomainError(t("T-5176"));
    let seat: "PRESIDENT" | "VP_FINANCE";
    if (await currentSeatAuthority(personId, "PRESIDENT", ctx.tx, now)) seat = "PRESIDENT";
    else if ((await currentSeatAuthority(personId, "VP_FINANCE", ctx.tx, now)) === "HOLDER")
      seat = "VP_FINANCE";
    else throw new DomainError(t("T-5176"));
    const [row] = await ctx.tx
      .select()
      .from(financeContract)
      .where(eq(financeContract.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    if (row.status !== "PENDING") throw new DomainError(t("T-2296"));
    const decision = {
      status: input.decision,
      decidedAt: now,
      decidedById: personId,
      decidedSeat: seat,
      decisionNote: input.note,
    };
    await ctx.tx.update(financeContract).set(decision).where(eq(financeContract.id, id));
    await ctx.audit({
      action: "contract.decided",
      entityType: "finance_contract",
      entityId: id,
      after: decision,
    });
    if (row.requestedById) {
      const [committee] = await listCommitteesByIds([row.committeeId]);
      await notifyApproval(ctx, [row.requestedById], {
        title: tList("T-5175")[1],
        body: [row.title, contractStatusLabel(input.decision), input.note]
          .filter(Boolean)
          .join(" · "),
        url: committee ? `/admin/comites/${committee.slug}?area=finanzas` : "/admin",
        dedupeKey: `contrato-decidido:${id}`,
      });
    }
  });
}

export function contractStatusLabel(status: typeof financeContract.$inferSelect.status) {
  return tLabels("T-5173", boardApprovalStatus.enumValues)[status];
}

export async function contractFileUrl(
  id: string,
  slot: ContractFileSlot,
  access: { all: boolean; committees: string[] },
) {
  const [row] = await getDb()
    .select({ files: financeContract.files })
    .from(financeContract)
    .where(
      and(
        eq(financeContract.id, id),
        access.all ? undefined : inArray(financeContract.committeeId, access.committees),
      ),
    );
  if (!row) return null;
  const attachment = row.files[slot];
  return presignRead(filedKey(id, slot, attachment.digest), 300, attachment.name);
}
