import { setTimeout as sleep } from "node:timers/promises";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { type CreateEmailOptions, type CreateEmailResponse, Resend } from "resend";
import { logger } from "@/shared/log";

// Transportes de correo (ADR-023). Sin reglas de negocio: quién elige el transporte es el módulo comms.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Cabeceras extra (ADR-038 regla 8): `List-Unsubscribe` y `List-Unsubscribe-Post` en las campañas. */
  headers?: Record<string, string>;
}

export type MailProvider = "console" | "resend" | "ses";

export interface MailTransport {
  readonly name: MailProvider;
  send(message: MailMessage): Promise<{ id: string | null }>;
}

/** Resend agotó su cuota o los reintentos de ráfaga; comms decide si existe desbordamiento. */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
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
  private readonly sendEmail: (message: CreateEmailOptions) => Promise<CreateEmailResponse>;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    private readonly from: string,
    dependencies: {
      send?: (message: CreateEmailOptions) => Promise<CreateEmailResponse>;
      wait?: (milliseconds: number) => Promise<void>;
    } = {},
  ) {
    const client = new Resend(apiKey);
    this.sendEmail = dependencies.send ?? ((message) => client.emails.send(message));
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
    // ADR-039: cuatro llamadas y 30 s de espera total como máximo; no repetir entregas ambiguas.
    let waited = 0;
    for (let attempt = 0; ; attempt++) {
      const { data, error, headers } = await this.sendEmail(payload);
      if (!error) {
        return { id: data?.id ?? null };
      }
      if (error.name === "rate_limit_exceeded" && attempt < 3) {
        const retryAfter = new Headers(headers ?? {}).get("retry-after");
        const seconds = retryAfter === null ? NaN : Number(retryAfter);
        const requestedDelay = Number.isFinite(seconds)
          ? seconds * 1000
          : retryAfter === null
            ? 0
            : Date.parse(retryAfter) - Date.now();
        const delay = Math.max(
          1000 * 2 ** attempt,
          Number.isFinite(requestedDelay) ? requestedDelay : 0,
        );
        // Nunca anticipar Retry-After: si no cabe en el presupuesto, informar cuota agotada.
        if (waited + delay > 30_000) {
          throw new QuotaExceededError(`${error.name}: ${error.message}`);
        }
        await this.wait(delay);
        waited += delay;
        continue;
      }
      if (
        error.name === "rate_limit_exceeded" ||
        error.name === "daily_quota_exceeded" ||
        error.name === "monthly_quota_exceeded"
      ) {
        throw new QuotaExceededError(`${error.name}: ${error.message}`);
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
    this.client = new SESv2Client({ region });
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
