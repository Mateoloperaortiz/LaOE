import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Resend } from "resend";
import { logger } from "@/shared/log";

// Transportes de correo (ADR-023). Sin reglas de negocio: quién elige el transporte es el módulo comms.

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailProvider = "console" | "resend" | "ses";

export interface MailTransport {
  readonly name: MailProvider;
  send(message: MailMessage): Promise<{ id: string | null }>;
}

/** Resend agotó la cuota diaria o de tasa: el mensaje debe salir por otro transporte. */
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
      { correo: { to: message.to, subject: message.subject, text: message.text } },
      "correo (consola)",
    );
    return { id: null };
  }
}

export class ResendTransport implements MailTransport {
  readonly name = "resend" as const;
  private readonly client: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<{ id: string | null }> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    if (error) {
      const quota = /quota|rate_limit|limit/i.test(`${error.name} ${error.message}`);
      if (quota) {
        throw new QuotaExceededError(`${error.name}: ${error.message}`);
      }
      throw new Error(`Resend: ${error.name}: ${error.message}`);
    }
    return { id: data?.id ?? null };
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
