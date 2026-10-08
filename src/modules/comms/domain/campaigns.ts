import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand, type Tx } from "@/db/tx";
import { campaignStart } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
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
import { campaignRoom } from "./pure";
import {
  type CampaignDeferral,
  type CampaignQuota,
  type CampaignReceipt,
  campaignQuota,
  campaignQuotaCut,
  markCampaignQuotaExhausted,
  recordedCampaignEmail,
  sendCampaignEmail,
  sentTodayVia,
} from "./send";
import {
  getTemplate,
  listTemplateOptions,
  loadCommitteeIndex,
  renderEmail,
  valuesFor,
} from "./templates";
import {
  campaignEligibility,
  type SendSkipReason,
  type SkipReason,
  sendEligibility,
} from "./templates-pure";

// Campañas (ADR-038 regla 8): una plantilla a un segmento. Al arrancar se congela la audiencia en
// `campaign_recipient` con la elegibilidad de cada persona; el programado `campaigns` manda un lote
// por minuto; cancelar deja lo pendiente omitido. El lote reclama, envía sin transacción abierta y
// marca a cada destinatario en la suya, y todo lo que escribe sobre una campaña toma primero su fila.
// Cuando sale por el proveedor de lo transaccional no reclama más de lo que cabe hoy en el cupo, y lo
// que no cabe sigue pendiente hasta el otro día. Antes de cada correo vuelve a mirar a la persona y omite
// a quien se anonimizó o ya no puede recibir (ADR-115).

export type CampaignRow = typeof campaign.$inferSelect;
export type CampaignStatus = CampaignRow["status"];
export type RecipientRow = typeof campaignRecipient.$inferSelect;

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"] as const;
export const RECIPIENT_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"] as const;
export const SKIP_REASONS = [
  "NO_EMAIL",
  "OPTED_OUT",
  "NO_CONSENT",
  "CANCELLED",
  "ANONYMIZED",
] as const;

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

/**
 * La fila de la campaña con `FOR UPDATE`: el candado que toman primero, y en ese orden, los comandos
 * del admin, la cancelación y el lote (ADR-115 regla 3).
 */
async function lockCampaignRow(tx: Tx, id: string): Promise<CampaignRow | undefined> {
  const [row] = await tx.select().from(campaign).where(eq(campaign.id, id)).for("update");
  return row;
}

async function lockCampaign(ctx: CommandContext, id: string): Promise<CampaignRow> {
  const row = await lockCampaignRow(ctx.tx, id);
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
    await ctx.emit(
      eventOf(
        campaignStart,
        { campaignId: id, actorId: ctx.actor.personId },
        { dedupeKey: `campaign-start:${id}` },
      ),
    );
  }
}

/**
 * Cancela: programada vuelve atrás; en curso deja omitido todo lo pendiente, lo tenga reclamado un lote
 * o no. No espera a ningún lote, que no retiene candados mientras envía; el correo que iba en vuelo lo
 * anota el lote cuando el proveedor responde (ADR-115 regla 4).
 */
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

/**
 * Cuánto dura el reclamo de un lote sobre sus destinatarios (ADR-115 regla 1). Es más de lo que el
 * poller espera a un handler (`JOBS_HANDLER_TIMEOUT_MS`, 10 minutos por omisión), y lo que dejó
 * reclamado un lote que se cayó vuelve a salir cuando vence. El reclamo no detiene a un lote que sigue
 * vivo, porque el poller solo deja de esperarlo: si pasa de este plazo, otro lote reclama lo que le
 * faltaba, `holdsClaim` impide que el viejo lo mande y el correo que tenía en vuelo puede repetirse.
 */
const CLAIM_LEASE_MS = 15 * 60_000;

/** El instante que separa los reclamos vigentes de los vencidos: vigente es el posterior. */
const claimCutoff = (now: Date): Date => new Date(now.getTime() - CLAIM_LEASE_MS);
/** Reclamado por un lote que todavía está en su plazo. */
const claimIsLive = (now: Date): SQL => gt(campaignRecipient.claimedAt, claimCutoff(now));
/** Reclamado por un lote al que ya se le venció el plazo: otro lo puede retomar. */
const claimHasLapsed = (now: Date): SQL => lte(campaignRecipient.claimedAt, claimCutoff(now));

/** El candado bajo el que se cuenta el cupo del día y se reclama contra él (ADR-115 regla 5). */
const QUOTA_LOCK = "campaigns:quota";

/** Lo que un lote puede reclamar hoy contra el cupo (ADR-115 regla 5). */
interface QuotaRoom {
  /** Reclamos vencidos que puede retomar: ya tenían su reserva y no gastan cupo aparte. */
  retake: number;
  /** Destinatarios sin reclamo que puede tomar: lo que queda después de todas las reservas. */
  fresh: number;
}

/**
 * Cuántos correos de campaña caben todavía hoy en el cupo (ADR-115 regla 5). Toma el candado del cupo,
 * que dura lo que la transacción del reclamo: así se cuenta y se reclama de a un lote, y lo que este
 * reclame ya lo cuenta el siguiente. Gastado es lo que el proveedor aceptó hoy, transaccional o de
 * campaña, más lo que algún lote tiene reclamado y sin resultado. Un reclamo vencido sigue reservado
 * hasta que otro lote lo retoma, porque el lote que lo dejó puede seguir vivo y mandarlo.
 */
async function quotaRoom(tx: Tx, quota: CampaignQuota, now: Date): Promise<QuotaRoom> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${QUOTA_LOCK}))`);
  const sent = await sentTodayVia(quota.provider, now, tx);
  const claimed = async (which: SQL): Promise<number> => {
    const [row] = await tx
      .select({ n: count() })
      .from(campaignRecipient)
      .where(
        and(
          eq(campaignRecipient.status, "PENDING"),
          which,
          inArray(
            campaignRecipient.campaignId,
            tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.status, "SENDING")),
          ),
        ),
      );
    return row?.n ?? 0;
  };
  const retake = campaignRoom(quota.ceiling, sent, await claimed(claimIsLive(now)));
  return { retake, fresh: Math.max(0, retake - (await claimed(claimHasLapsed(now)))) };
}

/**
 * Reclama hasta `limit` destinatarios de una campaña en curso, en una transacción corta. El reclamo es
 * la hora del lote, que también lo identifica. Primero retoma lo que otro lote dejó reclamado y ya
 * venció, y después toma a quienes nadie reclamó. Con cupo, el reclamo es también la reserva: lo
 * vencido ya la tenía, y lo nuevo no pasa de lo que cabe hoy descontando todas las reservas.
 *
 * Con `limit` en cero no reclama ni cuenta el cupo: solo visita la campaña. Y si no reclamó a nadie,
 * con la fila de la campaña todavía tomada, cierra la que ya no tiene ningún pendiente (ADR-116
 * regla 16).
 */
async function claimRecipients(
  campaignId: string,
  limit: number,
  now: Date,
  quota: CampaignQuota | null,
): Promise<BatchItem[]> {
  return getDb().transaction(async (tx) => {
    const row = await lockCampaignRow(tx, campaignId);
    if (row?.status !== "SENDING") {
      return [];
    }
    if (limit <= 0) {
      await closeIfDrained(tx, row, now);
      return [];
    }
    const room = quota ? await quotaRoom(tx, quota, now) : { retake: limit, fresh: limit };
    const claim = async (which: SQL, max: number): Promise<BatchItem[]> => {
      if (max <= 0) {
        return [];
      }
      const picked = tx
        .select({ id: campaignRecipient.id })
        .from(campaignRecipient)
        .where(
          and(
            eq(campaignRecipient.campaignId, campaignId),
            eq(campaignRecipient.status, "PENDING"),
            which,
          ),
        )
        .orderBy(asc(campaignRecipient.createdAt))
        .limit(max);
      return tx
        .update(campaignRecipient)
        .set({ claimedAt: now })
        .where(inArray(campaignRecipient.id, picked))
        .returning({
          recipientId: campaignRecipient.id,
          campaignId: campaignRecipient.campaignId,
          personId: campaignRecipient.personId,
        });
    };
    const retaken = await claim(claimHasLapsed(now), Math.min(limit, room.retake));
    const fresh = await claim(
      isNull(campaignRecipient.claimedAt),
      Math.min(limit - retaken.length, room.fresh),
    );
    if (retaken.length + fresh.length === 0) {
      await closeIfDrained(tx, row, now);
    }
    return [...retaken, ...fresh];
  });
}

/**
 * Una campaña en curso sin ningún destinatario pendiente ya terminó, la haya dejado así quien la haya
 * dejado (ADR-116 regla 16): se recuenta y se cierra. Mientras le quede un pendiente no se toca, lo
 * tenga reclamado otro lote o no quepa hoy en el cupo. Pide la fila de la campaña ya tomada.
 */
async function closeIfDrained(tx: Tx, row: CampaignRow, now: Date): Promise<void> {
  const [pending] = await tx
    .select({ id: campaignRecipient.id })
    .from(campaignRecipient)
    .where(and(eq(campaignRecipient.campaignId, row.id), eq(campaignRecipient.status, "PENDING")))
    .limit(1);
  if (!pending) {
    await refreshCounters(tx, row, now);
  }
}

/**
 * Antes de cada envío, sin candado: el destinatario sigue pendiente, su reclamo sigue siendo el de este
 * lote y su campaña sigue en curso. Si la cancelaron o el reclamo venció y lo tomó otro, no se envía.
 */
async function holdsClaim(item: BatchItem, claimedAt: Date): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: campaignRecipient.id })
    .from(campaignRecipient)
    .innerJoin(campaign, eq(campaign.id, campaignRecipient.campaignId))
    .where(
      and(
        eq(campaignRecipient.id, item.recipientId),
        eq(campaignRecipient.status, "PENDING"),
        eq(campaignRecipient.claimedAt, claimedAt),
        eq(campaign.status, "SENDING"),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Cómo queda un destinatario: lo que respondió el envío, por qué se omite, o `null` si no se pudo intentar. */
type Settlement = CampaignReceipt | { skip: SendSkipReason } | null;

/**
 * Deja el resultado de un destinatario en su propia transacción, con la fila de la campaña tomada
 * primero: bajo ese candado se escribe su estado y se recuentan los contadores. `outcome` es lo que
 * respondió el envío; el motivo por el que la persona ya no recibe (ADR-115 regla 7); o `null`, que no
 * se llegó a intentar porque faltan sus datos o su plantilla.
 */
async function settleRecipient(item: BatchItem, outcome: Settlement, now: Date): Promise<void> {
  await getDb().transaction(async (tx) => {
    const row = await lockCampaignRow(tx, item.campaignId);
    if (!row) {
      return;
    }
    if (outcome && "skip" in outcome) {
      // Solo si sigue pendiente: una omisión del lote no pisa una cancelación.
      await tx
        .update(campaignRecipient)
        .set({ status: "SKIPPED", skipReason: outcome.skip })
        .where(
          and(eq(campaignRecipient.id, item.recipientId), eq(campaignRecipient.status, "PENDING")),
        );
    } else if (outcome) {
      const receipt = outcome;
      // Lo que respondió el proveedor manda, también sobre una cancelación que llegó con el correo en
      // vuelo y ya había dejado omitido a su destinatario.
      await tx
        .update(campaignRecipient)
        .set({
          status: receipt.status,
          skipReason: null,
          messageId: receipt.messageId,
          sentAt: receipt.sentAt,
        })
        .where(eq(campaignRecipient.id, item.recipientId));
    } else {
      await tx
        .update(campaignRecipient)
        .set({ status: "FAILED" })
        .where(
          and(eq(campaignRecipient.id, item.recipientId), eq(campaignRecipient.status, "PENDING")),
        );
    }
    await refreshCounters(tx, row, now);
  });
}

/**
 * El proveedor rechazó un correo por cuota (ADR-115 regla 6): deja escrito el corte, que dura según la
 * causa del rechazo (ADR-116 regla 19), y suelta lo que el lote tenía reclamado y sin enviar,
 * empezando por ese correo. Siguen pendientes y libres para el primer lote que salga cuando el corte
 * termine. Cada campaña en su transacción y con su fila tomada primero.
 */
async function cutBatch(
  rest: BatchItem[],
  claimedAt: Date,
  deferral: CampaignDeferral,
): Promise<void> {
  await markCampaignQuotaExhausted(deferral, claimedAt);
  const byCampaign = new Map<string, string[]>();
  for (const item of rest) {
    byCampaign.set(item.campaignId, [...(byCampaign.get(item.campaignId) ?? []), item.recipientId]);
  }
  for (const [campaignId, recipientIds] of byCampaign) {
    await getDb().transaction(async (tx) => {
      await lockCampaignRow(tx, campaignId);
      await tx
        .update(campaignRecipient)
        .set({ claimedAt: null })
        .where(
          and(
            inArray(campaignRecipient.id, recipientIds),
            eq(campaignRecipient.status, "PENDING"),
            eq(campaignRecipient.claimedAt, claimedAt),
          ),
        );
    });
  }
}

/**
 * Manda hasta `limit` correos pendientes entre las campañas en curso, las más antiguas primero
 * (ADR-115). Reclama a sus destinatarios en una transacción corta por campaña, envía sin ninguna
 * transacción abierta y deja el resultado de cada uno en la suya: un lote que se cae no deshace lo que
 * ya marcó, y mientras un correo viaja no retiene una conexión del pool ni un candado que otro espere.
 * Con cupo diario no reclama más de lo que cabe hoy, y si el proveedor rechaza por cuota se corta: lo
 * que falta sigue pendiente y ningún lote sale mientras dure el corte, que depende de la causa del
 * rechazo (ADR-116 regla 19).
 *
 * Visita todas las campañas en curso, también cuando el lote ya está lleno o hay un corte vigente: a
 * esas no les reclama a nadie, pero la que se quedó sin pendientes se cierra en este tick (ADR-116
 * regla 16).
 */
export async function processCampaignBatch(limit: number, now = new Date()): Promise<number> {
  const [quota, cut] = await Promise.all([campaignQuota(), campaignQuotaCut(now)]);
  const room = cut ? 0 : limit;
  const sending = await getDb()
    .select({ id: campaign.id })
    .from(campaign)
    .where(eq(campaign.status, "SENDING"))
    .orderBy(asc(campaign.startedAt), asc(campaign.id));
  const batch: BatchItem[] = [];
  for (const row of sending) {
    batch.push(...(await claimRecipients(row.id, room - batch.length, now, quota)));
  }
  if (batch.length === 0) {
    return 0;
  }
  const personIds = [...new Set(batch.map((item) => item.personId))];
  const campaignIds = [...new Set(batch.map((item) => item.campaignId))];
  const [committees, term, campaigns] = await Promise.all([
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
  for (const [position, item] of batch.entries()) {
    if (!(await holdsClaim(item, now))) {
      continue;
    }
    // La persona como está ahora y no como estaba al reclamar: un lote puede durar minutos.
    const [refs, consents] = await Promise.all([
      listMailingRefs([item.personId]),
      listLiveConsentHolders([item.personId], "COMMUNICATIONS"),
    ]);
    const ref = refs.get(item.personId);
    const template = templates.get(item.campaignId);
    if (!ref || !template) {
      await settleRecipient(item, null, now);
      continue;
    }
    const eligibility = sendEligibility({
      anonymized: ref.anonymized,
      email: ref.email,
      personalEmail: ref.personalEmail,
      membershipStatus: ref.membershipStatus,
      hasCommunicationsConsent: consents.has(item.personId),
    });
    if (!eligibility.ok) {
      // Si su correo ya había salido y quedó registrado, manda ese registro (regla 2).
      const recorded = await recordedCampaignEmail(item.personId, item.campaignId);
      await settleRecipient(item, recorded ?? { skip: eligibility.reason }, now);
      continue;
    }
    const address = eligibility.address;
    // El enlace de baja se pide recién acá: a quien se omite no se le vuelve a crear la fila de
    // preferencias que comms le borró al salir o al anonimizarse (ADR-030, ADR-038 regla 5).
    const token = (await ensurePreferencesFor([item.personId])).get(item.personId);
    const unsubscribeUrl = token ? `${base}/baja/${token}` : null;
    const rendered = renderEmail(
      template,
      valuesFor(ref, committees.byPerson.get(item.personId) ?? [], term?.code ?? ""),
      unsubscribeUrl,
    );
    // Si el envío no se puede registrar, el lote se detiene acá: seguir sería mandar a ciegas.
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
    if (receipt.status === "DEFERRED") {
      const rest = batch.slice(position);
      logger.warn(
        {
          provider: receipt.provider,
          error: receipt.error,
          reason: receipt.reason,
          released: rest.length,
        },
        "campañas: el proveedor rechazó por cuota, lo pendiente espera a que termine el corte",
      );
      await cutBatch(rest, now, receipt);
      break;
    }
    await settleRecipient(item, receipt, now);
    if (receipt.status === "SENT" && !receipt.recovered) {
      sent += 1;
    }
  }
  return sent;
}

/**
 * Recalcula los contadores de una campaña desde sus destinatarios y, si está en curso y no queda nadie
 * pendiente, la cierra. A la cancelada también la recuenta, sin tocarle el estado: el correo que iba
 * en vuelo al cancelar cuenta como lo que fue. Pide la fila de la campaña ya tomada: así dos lotes no
 * recuentan a la vez.
 */
async function refreshCounters(tx: Tx, row: CampaignRow, now: Date): Promise<void> {
  const rows = await tx
    .select({ status: campaignRecipient.status, n: count() })
    .from(campaignRecipient)
    .where(eq(campaignRecipient.campaignId, row.id))
    .groupBy(campaignRecipient.status);
  const by = (status: RecipientRow["status"]) =>
    rows.find((item) => item.status === status)?.n ?? 0;
  const closes = row.status === "SENDING" && by("PENDING") === 0;
  await tx
    .update(campaign)
    .set({
      sentCount: by("SENT"),
      failedCount: by("FAILED"),
      skippedCount: by("SKIPPED"),
      ...(closes ? { status: "SENT" as const, finishedAt: now } : {}),
    })
    .where(eq(campaign.id, row.id));
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
