import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Executor, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import { getConfig, reviseConfig } from "@/modules/system";
import {
  createMailTransports,
  type MailMessage,
  type MailTransport,
  type MailTransports,
  QuotaExceededError,
} from "@/shared/adapters/mail";
import { dateKeyIn, startOfTodayIn } from "@/shared/lib/dates";
import { logger } from "@/shared/log";
import { message } from "../schema";
import { findRecordedMessage, type RecordedMessage, recordMessage } from "./messages";
import { campaignCeiling, chooseRoute, withoutAddresses } from "./pure";

// Correo transaccional (OTP, puntos, recordatorios): Resend con desbordamiento automático a SES,
// y cada envío queda registrado en `message` con el proveedor por el que salió (ADR-023).

export interface TransactionalEmail extends MailMessage {
  personId: string;
}

export interface SendReceipt {
  status: "SENT" | "FAILED";
  provider: string;
  providerId: string | null;
  error: string | null;
}

let transports: MailTransports | undefined;

function getTransports(): MailTransports {
  if (!transports) {
    const env = getEnv();
    transports = createMailTransports({
      mailer: env.MAILER,
      from: env.EMAIL_FROM,
      resendApiKey: env.RESEND_API_KEY,
      awsRegion: env.AWS_REGION,
    });
  }
  return transports;
}

/** Solo para pruebas: reemplaza los transportes (undefined vuelve a los del entorno). */
export function setMailTransportsForTests(replacement: MailTransports | undefined): void {
  transports = replacement;
}

/**
 * Correos que ese proveedor aceptó hoy, transaccionales y de campaña por igual. «Hoy» es el día civil de
 * la zona de la app, y un correo es del día en que salió: `sentAt`, la hora que le dio quien lo envió.
 */
export async function sentTodayVia(
  provider: string,
  now: Date,
  db: Executor = getDb(),
): Promise<number> {
  const since = startOfTodayIn(getEnv().APP_TIMEZONE, now);
  const [row] = await db
    .select({ n: count() })
    .from(message)
    .where(
      and(eq(message.provider, provider), eq(message.status, "SENT"), gte(message.sentAt, since)),
    );
  return row?.n ?? 0;
}

async function attempt(transport: MailTransport, email: TransactionalEmail): Promise<SendReceipt> {
  const { id } = await transport.send(email);
  return { status: "SENT", provider: transport.name, providerId: id, error: null };
}

export interface TransactionalOptions {
  /**
   * Con clave, un segundo intento para la misma persona no vuelve a mandar (handlers reintentados) y
   * responde con lo que dejó registrado el primero, sea un envío o un rechazo.
   */
  dedupeKey?: string;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  now = new Date(),
  options: TransactionalOptions = {},
): Promise<SendReceipt> {
  if (options.dedupeKey) {
    const recorded = await findRecordedMessage(email.personId, options.dedupeKey);
    if (recorded) {
      return {
        status: recorded.status,
        provider: recorded.provider,
        providerId: recorded.providerId,
        error: recorded.error,
      };
    }
  }
  const { primary, overflow } = getTransports();
  const route = chooseRoute(
    overflow ? await sentTodayVia(primary.name, now) : 0,
    getEnv().RESEND_DAILY_LIMIT,
    overflow !== null,
  );
  let receipt: SendReceipt;
  try {
    receipt = await attempt(route === "overflow" && overflow ? overflow : primary, email);
  } catch (error) {
    if (error instanceof QuotaExceededError && overflow && route === "primary") {
      logger.warn(
        { error: providerErrorText(error) },
        "correo: cuota de Resend agotada, sale por SES",
      );
      try {
        receipt = await attempt(overflow, email);
      } catch (overflowError) {
        receipt = failed(overflow.name, overflowError);
      }
    } else {
      receipt = failed(route === "overflow" && overflow ? overflow.name : primary.name, error);
    }
  }
  await getDb()
    .insert(message)
    .values({
      personId: email.personId,
      channel: "EMAIL",
      subject: email.subject,
      status: receipt.status,
      provider: receipt.provider,
      providerId: receipt.providerId,
      error: receipt.error,
      dedupeKey: options.dedupeKey ?? null,
      sentAt: receipt.status === "SENT" ? now : null,
    })
    .onConflictDoNothing();
  if (receipt.status === "FAILED") {
    // A la persona se la nombra por su id, no por su dirección: este aviso también lo dispara quien
    // pide un código sin sesión con el correo de un miembro (ADR-114, regla 5).
    logger.error(
      { personId: email.personId, provider: receipt.provider, error: receipt.error },
      "correo no enviado",
    );
  }
  return receipt;
}

/**
 * El texto del error de un proveedor, sin las direcciones que nombre (ADR-114 regla 5): es lo único
 * del error que llega al registro y a `message.error`. El error entero no se registra, porque su
 * mensaje y su traza traen ese mismo texto sin filtrar.
 */
function providerErrorText(error: unknown): string {
  return withoutAddresses(error instanceof Error ? error.message : String(error));
}

function failed(provider: string, error: unknown): SendReceipt {
  return { status: "FAILED", provider, providerId: null, error: providerErrorText(error) };
}

// Campañas (ADR-023, ADR-038 regla 8): siempre por el transporte de desbordamiento (SES) cuando existe;
// si no, por el primario (consola en local). Cada envío queda en `message` con su campaña y con una
// clave por campaña y persona, y quien ya la tiene no recibe otro (ADR-115 regla 2). Cuando salen por
// Resend comparten su cupo diario con lo transaccional y le dejan un margen (ADR-115 reglas 5 y 6).

/** El transporte por el que sale una campaña. */
function campaignTransport(): MailTransport {
  const { primary, overflow } = getTransports();
  return overflow ?? primary;
}

/** De los transportes, solo Resend tiene un cupo diario que cuidar acá: `RESEND_DAILY_LIMIT`. */
function hasDailyQuota(transport: MailTransport): boolean {
  return transport.name === "resend";
}

export interface CampaignQuota {
  /** El proveedor por el que salen las campañas, que es el del cupo. */
  provider: string;
  /** Con cuántos correos salidos hoy por ese proveedor una campaña ya no manda otro. */
  ceiling: number;
  /** Ese proveedor ya rechazó hoy un correo por cuota: hasta mañana no se le pide otro. */
  exhausted: boolean;
}

/**
 * El cupo que rige hoy para las campañas (ADR-115 reglas 5 y 6), o `null` si salen por un transporte sin
 * cupo diario. El tope es `RESEND_DAILY_LIMIT` menos el margen de `campaigns.transactionalReserve`.
 */
export async function campaignQuota(now: Date): Promise<CampaignQuota | null> {
  const transport = campaignTransport();
  if (!hasDailyQuota(transport)) {
    return null;
  }
  const env = getEnv();
  const [reserve, exhaustedAt] = await Promise.all([
    getConfig("campaigns.transactionalReserve"),
    getConfig("campaigns.quotaExhaustedAt"),
  ]);
  return {
    provider: transport.name,
    ceiling: campaignCeiling(env.RESEND_DAILY_LIMIT, reserve),
    exhausted:
      exhaustedAt !== null &&
      dateKeyIn(env.APP_TIMEZONE, new Date(exhaustedAt)) === dateKeyIn(env.APP_TIMEZONE, now),
  };
}

/**
 * Deja escrito que el proveedor rechazó un correo de campaña por cuota (ADR-115 regla 6). La hora es la
 * del lote que recibió el rechazo, y el corte nunca retrocede: una hora anterior a la guardada no la
 * pisa, así que un lote de ayer que recibe tarde su rechazo no levanta el corte que otro dejó hoy.
 */
export function markCampaignQuotaExhausted(at: Date): Promise<void> {
  return reviseConfig(SYSTEM_ACTOR, "campaigns.quotaExhaustedAt", (current) =>
    current !== null && Date.parse(current) >= at.getTime() ? undefined : at.toISOString(),
  );
}

export interface CampaignEmail extends MailMessage {
  personId: string;
  campaignId: string;
}

export interface CampaignReceipt extends SendReceipt {
  messageId: string | null;
  sentAt: Date | null;
  /** El resultado sale de un registro que ya existía: el lote no lo cuenta como enviado por él. */
  recovered: boolean;
}

/**
 * El proveedor no aceptó el correo por cuota (ADR-115 regla 6). No es un rechazo de ese correo: no deja
 * registro, porque uno con la clave de la campaña dejaría a la persona sin él, y su destinatario sigue
 * pendiente.
 */
export interface CampaignDeferral {
  status: "DEFERRED";
  provider: string;
  error: string;
}

const campaignDedupeKey = (campaignId: string): string => `campaign:${campaignId}`;

function receiptOf(record: RecordedMessage): CampaignReceipt {
  return {
    status: record.status,
    provider: record.provider,
    providerId: record.providerId,
    error: record.error,
    messageId: record.id,
    sentAt: record.sentAt,
    recovered: true,
  };
}

/** Lo que ya quedó registrado de esa campaña para esa persona, si su correo ya salió o fue rechazado. */
export async function recordedCampaignEmail(
  personId: string,
  campaignId: string,
): Promise<CampaignReceipt | null> {
  const record = await findRecordedMessage(personId, campaignDedupeKey(campaignId));
  return record ? receiptOf(record) : null;
}

/**
 * Envía el correo de una campaña a una persona y lo registra. Si ya hay un registro de esa campaña
 * para esa persona no envía nada y responde con él, sea de un envío o de un rechazo. Si el proveedor lo
 * rechaza por cuota no registra nada y responde que queda para después. No corre dentro de una
 * transacción: mientras el proveedor responde no hay conexión ocupada.
 */
export async function sendCampaignEmail(
  email: CampaignEmail,
  now = new Date(),
): Promise<CampaignReceipt | CampaignDeferral> {
  const dedupeKey = campaignDedupeKey(email.campaignId);
  const before = await recordedCampaignEmail(email.personId, email.campaignId);
  if (before) {
    return before;
  }
  const transport = campaignTransport();
  let receipt: SendReceipt;
  try {
    receipt = await attempt(transport, email);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return { status: "DEFERRED", provider: transport.name, error: providerErrorText(error) };
    }
    receipt = failed(transport.name, error);
  }
  const sentAt = receipt.status === "SENT" ? now : null;
  const messageId = await recordMessage({
    personId: email.personId,
    channel: "EMAIL",
    kind: "CAMPAIGN",
    campaignId: email.campaignId,
    subject: email.subject,
    status: receipt.status,
    provider: receipt.provider,
    providerId: receipt.providerId,
    error: receipt.error,
    dedupeKey,
    sentAt,
  });
  if (receipt.status === "FAILED") {
    logger.error(
      { to: email.to, provider: receipt.provider, error: receipt.error },
      "correo de campaña no enviado",
    );
  }
  if (messageId === null) {
    // Otro lote lo registró mientras este enviaba: el registro es uno solo y de él sale el resultado.
    const winner = await findRecordedMessage(email.personId, dedupeKey);
    if (winner) {
      return receiptOf(winner);
    }
  }
  return { ...receipt, messageId, sentAt, recovered: false };
}
