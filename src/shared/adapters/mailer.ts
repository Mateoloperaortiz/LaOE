import { getEnv } from "@/env";
import { logger } from "@/shared/log";

// Adaptador de correo (ADR-023): consola en desarrollo y staging; Resend con desbordamiento a SES en producción (T5).

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailReceipt {
  provider: "console" | "resend" | "ses";
  id: string | null;
}

export interface Mailer {
  send(message: MailMessage): Promise<MailReceipt>;
}

export class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<MailReceipt> {
    // El código de un OTP se imprime aquí a propósito: es la forma de entrar en local (05-acceso.md).
    logger.info(
      { correo: { to: message.to, subject: message.subject, text: message.text } },
      "correo (consola)",
    );
    return { provider: "console", id: null };
  }
}

let mailer: Mailer | undefined;

export function getMailer(): Mailer {
  if (mailer) {
    return mailer;
  }
  const env = getEnv();
  if (env.MAILER === "resend") {
    throw new Error("El transporte resend llega en el tramo T5; usá MAILER=console");
  }
  mailer = new ConsoleMailer();
  return mailer;
}

/** Solo para pruebas: reemplaza el transporte. */
export function setMailerForTests(replacement: Mailer | undefined): void {
  mailer = replacement;
}
