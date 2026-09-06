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
import { recordMessage } from "./messages";
import { chooseRoute } from "./pure";

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

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  now = new Date(),
): Promise<SendReceipt> {
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
      logger.warn({ err: error }, "correo: cuota de Resend agotada, sale por SES");
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
      sentAt: receipt.status === "SENT" ? now : null,
    });
  if (receipt.status === "FAILED") {
    logger.error(
      { to: email.to, provider: receipt.provider, error: receipt.error },
      "correo no enviado",
    );
  }
  return receipt;
}

function failed(provider: string, error: unknown): SendReceipt {
  return {
    status: "FAILED",
    provider,
    providerId: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

// Campañas (ADR-023, ADR-038 regla 8): siempre por el transporte de desbordamiento (SES) cuando existe;
// si no, por el primario (consola en local). Cada envío queda en `message` con su campaña.

export interface CampaignEmail extends MailMessage {
  personId: string;
  campaignId: string;
}

export async function sendCampaignEmail(
  email: CampaignEmail,
  now = new Date(),
): Promise<SendReceipt & { messageId: string | null }> {
  const { primary, overflow } = getTransports();
  const transport = overflow ?? primary;
  let receipt: SendReceipt;
  try {
    receipt = await attempt(transport, email);
  } catch (error) {
    receipt = failed(transport.name, error);
  }
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
    sentAt: receipt.status === "SENT" ? now : null,
  });
  if (receipt.status === "FAILED") {
    logger.error(
      { to: email.to, provider: receipt.provider, error: receipt.error },
      "correo de campaña no enviado",
    );
  }
  return { ...receipt, messageId };
}
