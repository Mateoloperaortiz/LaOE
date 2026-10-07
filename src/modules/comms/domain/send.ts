import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import {
  createMailTransports,
  type MailMessage,
  type MailTransport,
  type MailTransports,
  QuotaExceededError,
} from "@/shared/adapters/mail";
import { startOfTodayIn } from "@/shared/lib/dates";
import { logger } from "@/shared/log";
import { message } from "../schema";
import {
  findRecordedMessage,
  listAlreadyNotified,
  type RecordedMessage,
  recordMessage,
} from "./messages";
import { chooseRoute, withoutAddresses } from "./pure";

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

async function sentTodayVia(provider: string, now: Date): Promise<number> {
  const since = startOfTodayIn(getEnv().APP_TIMEZONE, now);
  const [row] = await getDb()
    .select({ n: count() })
    .from(message)
    .where(
      and(
        eq(message.provider, provider),
        eq(message.status, "SENT"),
        gte(message.createdAt, since),
      ),
    );
  return row?.n ?? 0;
}

async function attempt(transport: MailTransport, email: TransactionalEmail): Promise<SendReceipt> {
  const { id } = await transport.send(email);
  return { status: "SENT", provider: transport.name, providerId: id, error: null };
}

export interface TransactionalOptions {
  /** Con clave, un segundo intento para la misma persona no vuelve a mandar (handlers reintentados). */
  dedupeKey?: string;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  now = new Date(),
  options: TransactionalOptions = {},
): Promise<SendReceipt> {
  if (options.dedupeKey) {
    const already = await listAlreadyNotified([email.personId], options.dedupeKey);
    if (already.has(email.personId)) {
      return { status: "SENT", provider: "skipped", providerId: null, error: null };
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
// clave por campaña y persona, y quien ya la tiene no recibe otro (ADR-115 regla 2).

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

/**
 * Envía el correo de una campaña a una persona y lo registra. Si ya hay un registro de esa campaña
 * para esa persona no envía nada y responde con él, sea de un envío o de un rechazo. No corre dentro
 * de una transacción: mientras el proveedor responde no hay conexión ocupada.
 */
export async function sendCampaignEmail(
  email: CampaignEmail,
  now = new Date(),
): Promise<CampaignReceipt> {
  const dedupeKey = campaignDedupeKey(email.campaignId);
  const before = await findRecordedMessage(email.personId, dedupeKey);
  if (before) {
    return receiptOf(before);
  }
  const { primary, overflow } = getTransports();
  const transport = overflow ?? primary;
  let receipt: SendReceipt;
  try {
    receipt = await attempt(transport, email);
  } catch (error) {
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
