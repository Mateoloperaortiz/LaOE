import { setTimeout as sleep } from "node:timers/promises";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  type CreateEmailOptions,
  type CreateEmailRequestOptions,
  type CreateEmailResponse,
  Resend,
} from "resend";
import { withTimeout } from "@/shared/lib/timeout";
import { logger } from "@/shared/log";

// Transportes de correo (ADR-023). Sin reglas de negocio: quién elige el transporte es el módulo comms.

/** Límite por llamada al proveedor (ADR-079): un envío colgado falla en vez de frenar el outbox. */
export const MAIL_REQUEST_TIMEOUT_MS = 30_000;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Cabeceras extra (ADR-038 regla 8): `List-Unsubscribe` y `List-Unsubscribe-Post` en las campañas. */
  headers?: Record<string, string>;
  /**
   * Clave de idempotencia del proveedor (ADR-116 regla 18), de hasta 256 caracteres. Resend la recibe en
   * el encabezado `Idempotency-Key` y durante 24 horas no entrega dos veces un correo con la misma clave
   * y el mismo contenido. SES no tiene nada parecido: ese transporte y el de consola la ignoran.
   */
  idempotencyKey?: string;
}

export type MailProvider = "console" | "resend" | "ses";

export interface MailTransport {
  readonly name: MailProvider;
  send(message: MailMessage): Promise<{ id: string | null }>;
}

/**
 * Por qué el proveedor no aceptó un correo por cuota (ADR-116 regla 19): una ráfaga que no cedió con
 * los reintentos, el cupo del día o el del mes.
 */
export type QuotaReason = "BURST" | "DAILY" | "MONTHLY";

/**
 * Resend agotó su cuota o los reintentos de ráfaga; comms decide si existe desbordamiento. Lleva su
 * causa y, si fue una ráfaga, lo que el proveedor pidió esperar en su último rechazo. Quien lo arma
 * sin decir la causa obtiene la del cupo del día, que es como se trataba todo rechazo.
 */
export class QuotaExceededError extends Error {
  readonly reason: QuotaReason;
  /** Milisegundos de la cabecera `Retry-After` del rechazo; `null` si no vino o no se entiende. */
  readonly retryAfterMs: number | null;

  constructor(message: string, reason: QuotaReason = "DAILY", retryAfterMs: number | null = null) {
    super(message);
    this.name = "QuotaExceededError";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/** La causa de cada error de cuota de Resend. Un nombre que no está acá no es un error de cuota. */
const RESEND_QUOTA_REASONS: ReadonlyMap<string, QuotaReason> = new Map([
  ["rate_limit_exceeded", "BURST"],
  ["daily_quota_exceeded", "DAILY"],
  ["monthly_quota_exceeded", "MONTHLY"],
]);

/**
 * Lo que pide esperar la cabecera `Retry-After`, que llega en segundos o como fecha HTTP. `null` si no
 * vino o no se entiende; una fecha que ya pasó es cero.
 */
function retryAfterMs(headers: Record<string, string> | null | undefined): number | null {
  const value = new Headers(headers ?? {}).get("retry-after");
  if (value === null) {
    return null;
  }
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : null;
}

export class ConsoleTransport implements MailTransport {
  readonly name = "console" as const;

  async send(message: MailMessage): Promise<{ id: string | null }> {
    // El código de un OTP se imprime aquí a propósito: es la forma de entrar en local (05-acceso.md).
    logger.info(
      {
        correo: {
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.headers ? { headers: message.headers } : {}),
        },
      },
      "correo (consola)",
    );
    return { id: null };
  }
}

export class ResendTransport implements MailTransport {
  readonly name = "resend" as const;
  private readonly sendEmail: (
    message: CreateEmailOptions,
    options?: CreateEmailRequestOptions,
  ) => Promise<CreateEmailResponse>;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    private readonly from: string,
    dependencies: {
      send?: (
        message: CreateEmailOptions,
        options?: CreateEmailRequestOptions,
      ) => Promise<CreateEmailResponse>;
      wait?: (milliseconds: number) => Promise<void>;
    } = {},
  ) {
    const client = new Resend(apiKey);
    this.sendEmail =
      dependencies.send ?? ((message, options) => client.emails.send(message, options));
    this.wait = dependencies.wait ?? sleep;
  }

  async send(message: MailMessage): Promise<{ id: string | null }> {
    const payload: CreateEmailOptions = {
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    };
    // La clave no va en el cuerpo: el SDK la manda en el encabezado `Idempotency-Key`. Es la misma en
    // cada llamada de este envío, también en los reintentos de ráfaga.
    const options: CreateEmailRequestOptions | undefined = message.idempotencyKey
      ? { idempotencyKey: message.idempotencyKey }
      : undefined;
    // ADR-039: cuatro llamadas como máximo; respetar Retry-After sin repetir entregas ambiguas.
    for (let attempt = 0; ; attempt++) {
      const { data, error, headers } = await withTimeout(
        this.sendEmail(payload, options),
        MAIL_REQUEST_TIMEOUT_MS,
        "Resend",
      );
      if (!error) {
        return { id: data?.id ?? null };
      }
      const requested = retryAfterMs(headers);
      if (error.name === "rate_limit_exceeded" && attempt < 3) {
        await this.wait(Math.max(1000 * 2 ** attempt, requested ?? 0));
        continue;
      }
      const reason = RESEND_QUOTA_REASONS.get(error.name);
      if (reason) {
        // La espera solo dice algo de una ráfaga: el cupo del día y el del mes tienen su propio plazo.
        throw new QuotaExceededError(
          `${error.name}: ${error.message}`,
          reason,
          reason === "BURST" ? requested : null,
        );
      }
      throw new Error(`Resend: ${error.name}: ${error.message}`);
    }
  }
}

export class SesTransport implements MailTransport {
  readonly name = "ses" as const;
  private readonly client: SESv2Client;

  constructor(
    region: string,
    private readonly from: string,
  ) {
    this.client = new SESv2Client({
      region,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: MAIL_REQUEST_TIMEOUT_MS },
    });
  }

  async send(message: MailMessage): Promise<{ id: string | null }> {
    const result = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
            },
            ...(message.headers
              ? {
                  Headers: Object.entries(message.headers).map(([Name, Value]) => ({
                    Name,
                    Value,
                  })),
                }
              : {}),
          },
        },
      }),
    );
    return { id: result.MessageId ?? null };
  }
}

export interface MailTransports {
  primary: MailTransport;
  overflow: MailTransport | null;
}

export interface MailConfig {
  mailer: "console" | "resend";
  from: string;
  resendApiKey: string | undefined;
  awsRegion: string | undefined;
}

export function createMailTransports(config: MailConfig): MailTransports {
  if (config.mailer === "console") {
    return { primary: new ConsoleTransport(), overflow: null };
  }
  if (!config.resendApiKey) {
    throw new Error("MAILER=resend exige RESEND_API_KEY");
  }
  return {
    primary: new ResendTransport(config.resendApiKey, config.from),
    overflow: config.awsRegion ? new SesTransport(config.awsRegion, config.from) : null,
  };
}
