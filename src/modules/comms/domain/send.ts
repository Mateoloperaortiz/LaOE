import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Executor, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import { getConfig, readConfigNow, reviseConfig } from "@/modules/system";
import {
  createMailTransports,
  type MailMessage,
  type MailTransport,
  type MailTransports,
  QuotaExceededError,
  type QuotaReason,
} from "@/shared/adapters/mail";
import { logger } from "@/shared/log";
import { message } from "../schema";
import { findRecordedMessage, type RecordedMessage, recordMessage } from "./messages";
import {
  campaignCeiling,
  chooseRoute,
  latestQuotaCut,
  providerDayStart,
  type QuotaCut,
  quotaCutFor,
  quotaCutInEffect,
  quotaCutReplaces,
  readQuotaCut,
  storeQuotaCut,
  withoutAddresses,
} from "./pure";
import { unlessAnonymized } from "./unless-anonymized";

// Correo transaccional (OTP, puntos, recordatorios): Resend con desbordamiento automático a SES,
// y cada envío queda registrado en `message` con el proveedor por el que salió (ADR-023).

/** Lo que arma quien llama. La clave del proveedor no es suya: sale de la clave del registro. */
type OutgoingMail = Omit<MailMessage, "idempotencyKey">;

export interface TransactionalEmail extends OutgoingMail {
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
 * Correos que ese proveedor aceptó hoy, transaccionales y de campaña por igual. «Hoy» es el día del
 * proveedor, que no es el de la zona de la app (ADR-121 regla 5), y un correo es del día en que salió:
 * `sentAt`, la hora que le dio quien lo envió. Es la única cuenta: la usan el lote de una campaña, la
 * elección de transporte de lo transaccional y la pantalla del cupo.
 */
export async function sentTodayVia(
  provider: string,
  now: Date,
  db: Executor = getDb(),
): Promise<number> {
  const since = providerDayStart(now);
  const [row] = await db
    .select({ n: count() })
    .from(message)
    .where(
      and(eq(message.provider, provider), eq(message.status, "SENT"), gte(message.sentAt, since)),
    );
  return row?.n ?? 0;
}

async function attempt(transport: MailTransport, mail: MailMessage): Promise<SendReceipt> {
  const { id } = await transport.send(mail);
  return { status: "SENT", provider: transport.name, providerId: id, error: null };
}

/** Lo más largo que Resend admite como clave de idempotencia. */
const PROVIDER_KEY_MAX = 256;

/**
 * La clave de idempotencia con la que un correo llega al proveedor (ADR-116 regla 18): el entorno, la
 * clave con la que queda registrado y la persona, que es lo que hace único a su `message`. Es la misma
 * en cada intento, así que el proveedor que la entiende descarta el reenvío del correo que ya aceptó y
 * cuyo registro no se alcanzó a guardar. El entorno es el host de `APP_URL`: dos entornos que compartan
 * la cuenta del proveedor, o una base restaurada de otro, no comparten claves. Si no cabe en lo que el
 * proveedor admite va su huella, que es igual de estable.
 */
function providerKey(personId: string, dedupeKey: string): string {
  const key = `${new URL(getEnv().APP_URL).host}/${dedupeKey}/${personId}`;
  return key.length <= PROVIDER_KEY_MAX ? key : createHash("sha256").update(key).digest("hex");
}

export interface TransactionalOptions {
  /**
   * Con clave, un segundo intento para la misma persona no vuelve a mandar (handlers reintentados) y
   * responde con lo que dejó registrado el primero, sea un envío o un rechazo. Con ella el correo lleva
   * además su clave de idempotencia al proveedor; sin ella no lleva ninguna.
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
  // La clave del proveedor sale solo de la clave del registro. El tipo no deja que quien llama la pase;
  // si aun así viene en el objeto, no viaja.
  const { idempotencyKey: _slipped, ...outgoing } = email as MailMessage;
  const mail: MailMessage = options.dedupeKey
    ? { ...outgoing, idempotencyKey: providerKey(email.personId, options.dedupeKey) }
    : outgoing;
  const { primary, overflow } = getTransports();
  const route = chooseRoute(
    overflow ? await sentTodayVia(primary.name, now) : 0,
    getEnv().RESEND_DAILY_LIMIT,
    overflow !== null,
  );
  let receipt: SendReceipt;
  try {
    receipt = await attempt(route === "overflow" && overflow ? overflow : primary, mail);
  } catch (error) {
    if (error instanceof QuotaExceededError && overflow && route === "primary") {
      logger.warn(
        { error: providerErrorText(error) },
        "correo: cuota de Resend agotada, sale por SES",
      );
      try {
        receipt = await attempt(overflow, mail);
      } catch (overflowError) {
        receipt = failed(overflow.name, overflowError);
      }
    } else {
      receipt = failed(route === "overflow" && overflow ? overflow.name : primary.name, error);
    }
  }
  // El registro se escribe con la persona retenida y no se escribe si ya fue anonimizada (ADR-120
  // regla 8): la limpieza de `person.anonymized` corre una sola vez, y lo que se registre después
  // queda para siempre a nombre de alguien anonimizado. Va por la transacción del candado, después de
  // que el proveedor respondió: quien envía desde un request, como el código de ingreso, no retiene
  // una conexión mientras el correo viaja ni pide dos para registrar.
  await unlessAnonymized(email.personId, (tx) =>
    recordMessage(
      {
        personId: email.personId,
        channel: "EMAIL",
        kind: "TRANSACTIONAL",
        subject: email.subject,
        status: receipt.status,
        provider: receipt.provider,
        providerId: receipt.providerId,
        error: receipt.error,
        dedupeKey: options.dedupeKey ?? null,
        sentAt: receipt.status === "SENT" ? now : null,
      },
      tx,
    ),
  );
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

/** El nombre del proveedor por el que sale una campaña: el del cupo y el del corte. */
export function campaignProvider(): string {
  return campaignTransport().name;
}

/** El cupo del día del proveedor por el que salen las campañas, o `null` si acá no lleva uno. */
export function campaignDailyLimit(): number | null {
  return hasDailyQuota(campaignTransport()) ? getEnv().RESEND_DAILY_LIMIT : null;
}

export interface CampaignQuota {
  /** El proveedor por el que salen las campañas, que es el del cupo. */
  provider: string;
  /** Con cuántos correos salidos hoy por ese proveedor una campaña ya no manda otro. */
  ceiling: number;
}

/**
 * El cupo que rige hoy para las campañas (ADR-115 regla 5), o `null` si salen por un transporte sin
 * cupo diario. El tope es `RESEND_DAILY_LIMIT` menos el margen de `campaigns.transactionalReserve`.
 */
export async function campaignQuota(): Promise<CampaignQuota | null> {
  const limit = campaignDailyLimit();
  if (limit === null) {
    return null;
  }
  return {
    provider: campaignProvider(),
    ceiling: campaignCeiling(limit, await getConfig("campaigns.transactionalReserve")),
  };
}

/** La clave de `AppConfig` donde queda el corte por cuota, con su causa (ADR-116 regla 19). */
export const QUOTA_CUT_KEY = "campaigns.quotaCut";

/**
 * Donde lo dejaban las versiones anteriores a ADR-116, como una fecha sola. Ya no se escribe: se lee,
 * para que el corte que dejó la versión anterior siga rigiendo después de desplegar. Y como esa versión
 * no lee la clave de hoy, volver a ella no pide tocar la base.
 */
export const LEGACY_QUOTA_CUT_KEY = "campaigns.quotaExhaustedAt";

/**
 * El corte guardado que rige, esté vigente o no. `fresh` lee la base y no la caché: es para quien lo
 * muestra o lo va a reemplazar.
 */
export async function storedQuotaCut(options: { fresh: boolean }): Promise<QuotaCut | null> {
  const timeZone = getEnv().APP_TIMEZONE;
  const [stored, legacy] = options.fresh
    ? await Promise.all([readConfigNow(QUOTA_CUT_KEY), readConfigNow(LEGACY_QUOTA_CUT_KEY)])
    : await Promise.all([getConfig(QUOTA_CUT_KEY), getConfig(LEGACY_QUOTA_CUT_KEY)]);
  return latestQuotaCut(readQuotaCut(stored, timeZone), readQuotaCut(legacy, timeZone));
}

/**
 * El corte que a esa hora detiene los lotes (ADR-116 regla 19), o `null` si no hay. Es del proveedor
 * que rechazó: no depende de que ese proveedor tenga un cupo diario que contar acá.
 */
export async function campaignQuotaCut(now: Date): Promise<QuotaCut | null> {
  return quotaCutInEffect(await storedQuotaCut({ fresh: false }), campaignProvider(), now);
}

/**
 * Deja escrito el corte de un rechazo por cuota (ADR-116 regla 19): el proveedor, la causa, la hora del
 * lote que lo recibió y hasta cuándo dura según esa causa. Se decide bajo el candado de la clave, y un
 * corte no se acorta: solo lo reemplaza uno que termina después, también si el que rige lo dejó una
 * versión anterior en su clave.
 */
export async function markCampaignQuotaExhausted(
  deferral: CampaignDeferral,
  at: Date,
): Promise<void> {
  const timeZone = getEnv().APP_TIMEZONE;
  const cut = quotaCutFor(deferral, at, timeZone);
  // El de antes se lee fuera del candado: esta versión no lo escribe.
  const legacy = readQuotaCut(await readConfigNow(LEGACY_QUOTA_CUT_KEY), timeZone);
  await reviseConfig(SYSTEM_ACTOR, QUOTA_CUT_KEY, (current) =>
    quotaCutReplaces(latestQuotaCut(readQuotaCut(current, timeZone), legacy), cut)
      ? storeQuotaCut(cut)
      : undefined,
  );
}

export interface CampaignEmail extends OutgoingMail {
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
  /** La causa del rechazo, que decide cuánto dura el corte (ADR-116 regla 19). */
  reason: QuotaReason;
  /** Lo que el proveedor pidió esperar, si fue una ráfaga y lo dijo. */
  retryAfterMs: number | null;
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
 * transacción: mientras el proveedor responde no hay conexión ocupada. El correo lleva al proveedor su
 * clave de idempotencia, por campaña y persona (ADR-116 regla 18). El registro se escribe con la
 * persona retenida; si se anonimizó con el correo en vuelo responde sin mensaje (ADR-120 regla 8).
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
    receipt = await attempt(transport, {
      ...email,
      idempotencyKey: providerKey(email.personId, dedupeKey),
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return {
        status: "DEFERRED",
        provider: transport.name,
        error: providerErrorText(error),
        reason: error.reason,
        retryAfterMs: error.retryAfterMs,
      };
    }
    receipt = failed(transport.name, error);
  }
  const sentAt = receipt.status === "SENT" ? now : null;
  // Con la persona retenida, como el transaccional (ADR-120 regla 8): de quien se anonimizó con el
  // correo en vuelo no se escribe nada, y su destinatario queda con lo que respondió el proveedor y sin
  // mensaje. El candado se toma recién ahora, con el proveedor ya de vuelta (ADR-115 regla 1).
  const messageId = await unlessAnonymized(email.personId, (tx) =>
    recordMessage(
      {
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
      },
      tx,
    ),
  );
  if (receipt.status === "FAILED") {
    // Como el transaccional: a la persona se la nombra por su id, no por su dirección (ADR-114, regla 5).
    logger.error(
      { personId: email.personId, provider: receipt.provider, error: receipt.error },
      "correo de campaña no enviado",
    );
  }
  if (messageId === null) {
    // Otro lote lo registró mientras este enviaba: el registro es uno solo y de él sale el resultado.
    // Si no hay ninguno es que la persona se anonimizó: sigue con lo que respondió el proveedor.
    const winner = await findRecordedMessage(email.personId, dedupeKey);
    if (winner) {
      return receiptOf(winner);
    }
  }
  return { ...receipt, messageId, sentAt, recovered: false };
}
