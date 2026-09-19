import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getEnv } from "@/env";
import {
  findPeopleByFilter,
  getPeopleByIds,
  getSegment,
  listAllSegments,
  listLiveConsentHolders,
  listMailingRefs,
} from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { logger } from "@/shared/log";
import { campaign, campaignRecipient, emailTemplate } from "../schema";
import { ensurePreferencesFor, listPreferencesFor } from "./preferences";
import { sendCampaignEmail } from "./send";
import {
  getTemplate,
  listTemplateOptions,
  loadCommitteeIndex,
  renderEmail,
  valuesFor,
} from "./templates";
import { campaignEligibility, type SkipReason } from "./templates-pure";

// Campañas (ADR-038 regla 8): una plantilla a un segmento. Al arrancar se congela la audiencia en
// `campaign_recipient` con la elegibilidad de cada persona; el programado `campaigns` manda un lote
// por minuto; cancelar deja lo pendiente omitido.

export type CampaignRow = typeof campaign.$inferSelect;
export type CampaignStatus = CampaignRow["status"];
export type RecipientRow = typeof campaignRecipient.$inferSelect;

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"] as const;
export const RECIPIENT_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"] as const;
export const SKIP_REASONS = ["NO_EMAIL", "OPTED_OUT", "NO_CONSENT", "CANCELLED"] as const;

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  templateId: z.string().trim().min(1),
  segmentId: z.string().trim().min(1),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export interface CampaignListRow extends CampaignRow {
  templateName: string;
  segmentName: string;
}

export async function listCampaigns(params: {
  q: string;
  status?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<{ rows: CampaignListRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    conditions.push(ilike(campaign.name, `%${params.q}%`));
  }
  if (params.status && (CAMPAIGN_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(campaign.status, params.status as CampaignStatus));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(campaign)
      .where(where)
      .orderBy(desc(campaign.createdAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(campaign).where(where),
  ]);
  return { rows: await withNames(rows), total: total?.n ?? 0 };
}

async function withNames(rows: CampaignRow[]): Promise<CampaignListRow[]> {
  if (rows.length === 0) {
    return [];
  }
  const [templates, segments] = await Promise.all([listTemplateOptions(), listAllSegments()]);
  const templateNames = new Map(templates.map((item) => [item.id, item.name]));
  const segmentNames = new Map(segments.map((item) => [item.id, item.name]));
  return rows.map((row) => ({
    ...row,
    templateName: templateNames.get(row.templateId) ?? "",
    segmentName: segmentNames.get(row.segmentId) ?? "",
  }));
}

export async function getCampaign(id: string): Promise<CampaignListRow | null> {
  const [row] = await getDb().select().from(campaign).where(eq(campaign.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const [named] = await withNames([row]);
  return named ?? null;
}

export async function listCampaignOptions(): Promise<Array<{ id: string; name: string }>> {
  return getDb()
    .select({ id: campaign.id, name: campaign.name })
    .from(campaign)
    .orderBy(desc(campaign.createdAt));
}

/** Programadas o en curso, para el tablero del admin. */
export async function listActiveCampaigns(limit = 6): Promise<CampaignListRow[]> {
  const rows = await getDb()
    .select()
    .from(campaign)
    .where(inArray(campaign.status, ["SCHEDULED", "SENDING"]))
    .orderBy(asc(campaign.scheduledAt))
    .limit(limit);
  return withNames(rows);
}

async function assertReferences(ctx: CommandContext, input: CampaignInput): Promise<void> {
  const [template] = await ctx.tx
    .select({ id: emailTemplate.id })
    .from(emailTemplate)
    .where(eq(emailTemplate.id, input.templateId));
  if (!template) {
    throw new DomainError(t("T-032"), "templateId");
  }
  if (!(await getSegment(input.segmentId))) {
    throw new DomainError(t("T-032"), "segmentId");
  }
}

export async function createCampaign(
  ctx: CommandContext,
  input: CampaignInput,
): Promise<{ id: string }> {
  await assertReferences(ctx, input);
  const [row] = await ctx.tx
    .insert(campaign)
    .values({ ...input, createdById: ctx.actor.personId })
    .returning({ id: campaign.id });
  if (!row) {
    throw new Error("No se pudo crear la campaña");
  }
  await ctx.audit({
    action: "campaign.created",
    entityType: "campaign",
    entityId: row.id,
    after: input,
  });
  return row;
}

async function lockCampaign(ctx: CommandContext, id: string): Promise<CampaignRow> {
  const [row] = await ctx.tx.select().from(campaign).where(eq(campaign.id, id)).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

export async function updateCampaign(
  ctx: CommandContext,
  id: string,
  input: CampaignInput,
): Promise<void> {
  const before = await lockCampaign(ctx, id);
  if (before.status !== "DRAFT") {
    throw new DomainError(t("T-1137"));
  }
  await assertReferences(ctx, input);
  await ctx.tx.update(campaign).set(input).where(eq(campaign.id, id));
  await ctx.audit({
    action: "campaign.updated",
    entityType: "campaign",
    entityId: id,
    before: { name: before.name, templateId: before.templateId, segmentId: before.segmentId },
    after: input,
  });
}

/** Programa el envío (ADMIN con step-up en la acción de la página): una fecha pasada equivale a ahora. */
export async function scheduleCampaign(
  ctx: CommandContext,
  id: string,
  at: Date,
  now = new Date(),
): Promise<void> {
  const before = await lockCampaign(ctx, id);
  if (before.status !== "DRAFT" && before.status !== "SCHEDULED") {
    throw new DomainError(t("T-1137"));
  }
  const scheduledAt = at.getTime() < now.getTime() ? now : at;
  await ctx.tx
    .update(campaign)
    .set({ status: "SCHEDULED", scheduledAt })
    .where(eq(campaign.id, id));
  await ctx.audit({
    action: "campaign.scheduled",
    entityType: "campaign",
    entityId: id,
    before: { status: before.status, scheduledAt: before.scheduledAt?.toISOString() ?? null },
    after: { status: "SCHEDULED", scheduledAt: scheduledAt.toISOString() },
  });
  if (scheduledAt.getTime() <= now.getTime()) {
    await ctx.emit({
      type: "campaign.start",
      payload: { campaignId: id, actorId: ctx.actor.personId },
      dedupeKey: `campaign-start:${id}`,
    });
  }
}

/** Cancela: programada vuelve atrás; en curso deja lo pendiente omitido. */
export async function cancelCampaign(
  ctx: CommandContext,
  id: string,
  now = new Date(),
): Promise<void> {
  const before = await lockCampaign(ctx, id);
  if (before.status !== "SCHEDULED" && before.status !== "SENDING") {
    throw new DomainError(t("T-1137"));
  }
  const skipped = await ctx.tx
    .update(campaignRecipient)
    .set({ status: "SKIPPED", skipReason: "CANCELLED" })
    .where(and(eq(campaignRecipient.campaignId, id), eq(campaignRecipient.status, "PENDING")))
    .returning({ id: campaignRecipient.id });
  await ctx.tx
    .update(campaign)
    .set({
      status: "CANCELLED",
      finishedAt: now,
      skippedCount: sql`${campaign.skippedCount} + ${skipped.length}`,
    })
    .where(eq(campaign.id, id));
  await ctx.audit({
    action: "campaign.cancelled",
    entityType: "campaign",
    entityId: id,
    before: { status: before.status },
    after: { status: "CANCELLED", skipped: skipped.length },
  });
}

export function createCampaignAs(actor: Actor, input: CampaignInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createCampaign(ctx, input));
}

export function updateCampaignAs(actor: Actor, id: string, input: CampaignInput): Promise<void> {
  return runCommand(actor, (ctx) => updateCampaign(ctx, id, input));
}

export function scheduleCampaignAs(actor: Actor, id: string, at: Date): Promise<void> {
  return runCommand(actor, (ctx) => scheduleCampaign(ctx, id, at));
}

export function cancelCampaignAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => cancelCampaign(ctx, id));
}

// Audiencia: quién recibiría hoy y por qué no (vista previa) y el fan-out que la congela al arrancar.

export interface AudienceEstimate {
  segment: number;
  eligible: number;
  noEmail: number;
  optedOut: number;
  noConsent: number;
}

interface ResolvedRecipient {
  personId: string;
  eligibility: ReturnType<typeof campaignEligibility>;
}

async function resolveAudience(segmentId: string): Promise<ResolvedRecipient[]> {
  const segment = await getSegment(segmentId);
  if (!segment) {
    return [];
  }
  const ids = await findPeopleByFilter(segment.filter);
  const [refs, prefs, consents] = await Promise.all([
    listMailingRefs(ids),
    listPreferencesFor(ids),
    listLiveConsentHolders(ids, "COMMUNICATIONS"),
  ]);
  return ids
    .map((personId) => {
      const ref = refs.get(personId);
      if (!ref || ref.anonymized) {
        return null;
      }
      return {
        personId,
        eligibility: campaignEligibility({
          email: ref.email,
          personalEmail: ref.personalEmail,
          membershipStatus: ref.membershipStatus,
          emailCampaigns: prefs.get(personId)?.emailCampaigns ?? true,
          hasCommunicationsConsent: consents.has(personId),
        }),
      };
    })
    .filter((item): item is ResolvedRecipient => item !== null);
}

export async function estimateAudience(segmentId: string): Promise<AudienceEstimate> {
  const resolved = await resolveAudience(segmentId);
  const estimate: AudienceEstimate = {
    segment: resolved.length,
    eligible: 0,
    noEmail: 0,
    optedOut: 0,
    noConsent: 0,
  };
  for (const item of resolved) {
    if (item.eligibility.ok) {
      estimate.eligible += 1;
    } else if (item.eligibility.reason === "NO_EMAIL") {
      estimate.noEmail += 1;
    } else if (item.eligibility.reason === "OPTED_OUT") {
      estimate.optedOut += 1;
    } else {
      estimate.noConsent += 1;
    }
  }
  return estimate;
}

/** Congela la audiencia de una campaña programada y la pasa a SENDING. Idempotente por campaña. */
export async function startCampaign(id: string, now = new Date()): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`campaign:${id}`}))`);
    const [row] = await tx.select().from(campaign).where(eq(campaign.id, id)).for("update");
    if (!row || row.status !== "SCHEDULED") {
      return false;
    }
    const resolved = await resolveAudience(row.segmentId);
    if (resolved.length > 0) {
      await tx
        .insert(campaignRecipient)
        .values(
          resolved.map((item) => ({
            campaignId: id,
            personId: item.personId,
            status: item.eligibility.ok ? ("PENDING" as const) : ("SKIPPED" as const),
            skipReason: item.eligibility.ok ? null : (item.eligibility.reason as SkipReason),
          })),
        )
        .onConflictDoNothing();
    }
    const skipped = resolved.filter((item) => !item.eligibility.ok).length;
    await tx
      .update(campaign)
      .set({
        status: "SENDING",
        startedAt: now,
        totalCount: resolved.length,
        skippedCount: skipped,
        ...(resolved.length === skipped ? { finishedAt: now, status: "SENT" as const } : {}),
      })
      .where(eq(campaign.id, id));
    return true;
  });
}

/** Arranca las programadas vencidas. */
export async function startDueCampaigns(now = new Date()): Promise<number> {
  const due = await getDb()
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.status, "SCHEDULED"), lte(campaign.scheduledAt, now)));
  let started = 0;
  for (const row of due) {
    if (await startCampaign(row.id, now)) {
      started += 1;
    }
  }
  return started;
}

interface BatchItem {
  recipientId: string;
  campaignId: string;
  personId: string;
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Manda hasta `limit` correos pendientes entre las campañas en curso, las más antiguas primero. Los
 * destinatarios quedan bloqueados (`FOR UPDATE SKIP LOCKED`) mientras se envían, así dos procesos no
 * repiten un correo; el registro en `message` va por su propia conexión.
 */
export async function processCampaignBatch(limit: number, now = new Date()): Promise<number> {
  return getDb().transaction(async (tx) => {
    const batch: BatchItem[] = await tx
      .select({
        recipientId: campaignRecipient.id,
        campaignId: campaignRecipient.campaignId,
        personId: campaignRecipient.personId,
      })
      .from(campaignRecipient)
      .innerJoin(campaign, eq(campaign.id, campaignRecipient.campaignId))
      .where(and(eq(campaignRecipient.status, "PENDING"), eq(campaign.status, "SENDING")))
      .orderBy(asc(campaign.startedAt), asc(campaignRecipient.createdAt))
      .limit(limit)
      .for("update", { of: campaignRecipient, skipLocked: true });
    if (batch.length === 0) {
      return 0;
    }
    const personIds = [...new Set(batch.map((item) => item.personId))];
    const campaignIds = [...new Set(batch.map((item) => item.campaignId))];
    const [refs, tokens, committees, term, campaigns] = await Promise.all([
      listMailingRefs(personIds),
      ensurePreferencesFor(personIds),
      loadCommitteeIndex(personIds),
      getCurrentTerm(),
      getDb().select().from(campaign).where(inArray(campaign.id, campaignIds)),
    ]);
    const templates = new Map<string, Awaited<ReturnType<typeof getTemplate>>>();
    for (const row of campaigns) {
      templates.set(row.id, await getTemplate(row.templateId));
    }
    const base = getEnv().APP_URL.replace(/\/$/, "");
    let sent = 0;
    for (const item of batch) {
      const ref = refs.get(item.personId);
      const template = templates.get(item.campaignId);
      if (!ref || !template) {
        await markRecipient(tx, item.recipientId, "FAILED", null, now);
        continue;
      }
      const eligibility = campaignEligibility({
        email: ref.email,
        personalEmail: ref.personalEmail,
        membershipStatus: ref.membershipStatus,
        emailCampaigns: true,
        hasCommunicationsConsent: true,
      });
      const address = eligibility.ok ? eligibility.address : ref.email;
      const token = tokens.get(item.personId);
      const unsubscribeUrl = token ? `${base}/baja/${token}` : null;
      const rendered = renderEmail(
        template,
        valuesFor(ref, committees.byPerson.get(item.personId) ?? [], term?.code ?? ""),
        unsubscribeUrl,
      );
      const receipt = await sendCampaignEmail(
        {
          personId: item.personId,
          campaignId: item.campaignId,
          to: address,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          ...(unsubscribeUrl
            ? {
                headers: {
                  "List-Unsubscribe": `<${base}/api/baja/${token}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
              }
            : {}),
        },
        now,
      );
      await markRecipient(
        tx,
        item.recipientId,
        receipt.status === "SENT" ? "SENT" : "FAILED",
        receipt.messageId,
        now,
      );
      if (receipt.status === "SENT") {
        sent += 1;
      }
    }
    await refreshCounters(tx, campaignIds, now);
    return sent;
  });
}

async function markRecipient(
  tx: Tx,
  recipientId: string,
  status: "SENT" | "FAILED",
  messageId: string | null,
  now: Date,
): Promise<void> {
  await tx
    .update(campaignRecipient)
    .set({ status, messageId, sentAt: status === "SENT" ? now : null })
    .where(eq(campaignRecipient.id, recipientId));
}

/** Recalcula los contadores desde los destinatarios y cierra la campaña cuando no queda nada pendiente. */
async function refreshCounters(tx: Tx, campaignIds: string[], now: Date): Promise<void> {
  for (const id of campaignIds) {
    const rows = await tx
      .select({ status: campaignRecipient.status, n: count() })
      .from(campaignRecipient)
      .where(eq(campaignRecipient.campaignId, id))
      .groupBy(campaignRecipient.status);
    const by = (status: RecipientRow["status"]) =>
      rows.find((row) => row.status === status)?.n ?? 0;
    const pending = by("PENDING");
    await tx
      .update(campaign)
      .set({
        sentCount: by("SENT"),
        failedCount: by("FAILED"),
        skippedCount: by("SKIPPED"),
        ...(pending === 0 ? { status: "SENT" as const, finishedAt: now } : {}),
      })
      .where(and(eq(campaign.id, id), eq(campaign.status, "SENDING")));
  }
}

/** Un tick del programado `campaigns`: arranca las vencidas y manda un lote. */
export async function runCampaignTick(
  now = new Date(),
): Promise<{ started: number; sent: number }> {
  const started = await startDueCampaigns(now);
  const limit = await requireConfig("campaigns.perMinute");
  const sent = await processCampaignBatch(limit, now);
  if (started > 0 || sent > 0) {
    logger.info({ started, sent }, "campañas: tick");
  }
  return { started, sent };
}

// Destinatarios para el detalle.

export interface RecipientView extends RecipientRow {
  personName: string;
  email: string;
}

export async function listRecipients(
  campaignId: string,
  limit = 200,
): Promise<{ rows: RecipientView[]; total: number }> {
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(campaignRecipient)
      .where(eq(campaignRecipient.campaignId, campaignId))
      .orderBy(asc(campaignRecipient.createdAt))
      .limit(limit),
    db
      .select({ n: count() })
      .from(campaignRecipient)
      .where(eq(campaignRecipient.campaignId, campaignId)),
  ]);
  const people = await getPeopleByIds(rows.map((row) => row.personId));
  return {
    rows: rows.map((row) => ({
      ...row,
      personName: people.get(row.personId)?.fullName.trim() ?? "",
      email: people.get(row.personId)?.email ?? "",
    })),
    total: total?.n ?? 0,
  };
}

/** Sin destinatarios pendientes ni nada por enviar: para el aviso del detalle. */
export async function hasPendingRecipients(campaignId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(campaignRecipient)
    .where(
      and(
        eq(campaignRecipient.campaignId, campaignId),
        eq(campaignRecipient.status, "PENDING"),
        isNull(campaignRecipient.sentAt),
      ),
    );
  return (row?.n ?? 0) > 0;
}
