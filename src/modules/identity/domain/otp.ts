import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import { getEnv } from "@/env";
import { sendTransactionalEmail, wrapEmail } from "@/modules/comms";
import { findEligibleMemberByEmail } from "@/modules/people";
import { t } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
import { logger } from "@/shared/log";
import { otpChallenge } from "../schema";
import {
  codeMatches,
  decoyCodeHash,
  generateCode,
  hashCode,
  normalizeEmail,
  OTP_FAILED_WINDOW_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_EMAIL,
  OTP_MAX_PER_IP,
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  otpAttemptBudget,
} from "./pure";
import { createSession, markStepUp } from "./session";

// Identidad por correo del roster con OTP (ADR-010, 05-acceso.md). La respuesta a "pedir código"
// es siempre la misma y verificarlo responde igual para un correo de afuera: nunca se enumera el
// roster (ADR-113, regla 2). Los códigos equivocados de un correo tienen tope acumulado (regla 3).
// Guardar un reto y probar un código corren bajo un mismo candado por correo, cada uno en su
// transacción: ningún fallo cae entre contar los fallos y escribir.

export type OtpPurpose = "LOGIN" | "STEP_UP";

export interface RequestOtpInput {
  email: string;
  ip: string | null;
  purpose?: OtpPurpose;
  now?: Date;
}

async function countRecent(column: "email" | "ip", value: string, since: Date): Promise<number> {
  const target = column === "email" ? otpChallenge.email : otpChallenge.ip;
  const [row] = await getDb()
    .select({ n: count() })
    .from(otpChallenge)
    .where(and(eq(target, value), gt(otpChallenge.createdAt, since)));
  return row?.n ?? 0;
}

/** Pone en fila, por correo, las solicitudes y los intentos hasta que cierre la transacción. */
async function lockEmail(tx: Tx, email: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`otp:${email}`}, 0))`);
}

/**
 * Intentos que le quedan al correo bajo el tope acumulado (ADR-113, regla 3): suma los códigos
 * equivocados de sus retos del último día. Se llama con el candado del correo tomado. El paso de
 * seguridad queda afuera: lo pide una sesión viva y sus fallos no suman.
 */
async function attemptBudget(
  tx: Tx,
  email: string,
  purpose: OtpPurpose,
  now: Date,
): Promise<number> {
  if (purpose === "STEP_UP") {
    return OTP_MAX_ATTEMPTS;
  }
  const since = new Date(now.getTime() - OTP_FAILED_WINDOW_MS);
  const [row] = await tx
    .select({ n: sql<number>`coalesce(sum(${otpChallenge.attempts}), 0)::int` })
    .from(otpChallenge)
    .where(
      and(
        eq(otpChallenge.email, email),
        eq(otpChallenge.purpose, purpose),
        gt(otpChallenge.createdAt, since),
      ),
    );
  // Sin fila no hay cuenta, y sin cuenta no hay intentos.
  return otpAttemptBudget(row?.n ?? Number.NaN);
}

/**
 * Deja un reto si no se superó ningún límite y envía el código solo si el correo está en el roster:
 * el reto de un correo de afuera es un señuelo. Nunca revela nada.
 */
export async function requestOtp(input: RequestOtpInput): Promise<void> {
  const env = getEnv();
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const purpose = input.purpose ?? "LOGIN";
  const since = new Date(now.getTime() - OTP_WINDOW_MS);

  if ((await countRecent("email", email, since)) >= OTP_MAX_PER_EMAIL) {
    logger.warn({ email }, "otp: límite por correo");
    return;
  }
  if (input.ip && (await countRecent("ip", input.ip, since)) >= OTP_MAX_PER_IP) {
    logger.warn({ ip: input.ip }, "otp: límite por IP");
    return;
  }

  // Reto señuelo (ADR-113, regla 2): el de un correo de afuera gasta los mismos límites y cuenta
  // los mismos intentos que uno real, así que verificar no distingue. Ningún código lo cumple y no
  // se envía nada.
  const member = await findEligibleMemberByEmail(email);
  const code = member ? generateCode(env.OTP_FIXED_CODE) : null;
  const codeHash = code === null ? decoyCodeHash() : hashCode(env.SESSION_SECRET, email, code);

  // Tope acumulado (ADR-113, regla 3): con quince códigos equivocados en un día el correo no
  // recibe más, y el que llega cerca del tope trae solo los intentos que quedan. La cuenta no mira
  // la membresía, así que el señuelo cumple el mismo tope. Contar y guardar van juntos bajo el
  // candado del correo: un código equivocado que llega a la vez espera, y no se cuela en el medio.
  const issued = await getDb().transaction(async (tx) => {
    await lockEmail(tx, email);
    const maxAttempts = await attemptBudget(tx, email, purpose, now);
    if (maxAttempts === 0) {
      return false;
    }
    await tx.insert(otpChallenge).values({
      email,
      purpose,
      codeHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      maxAttempts,
      ip: input.ip,
    });
    return true;
  });
  if (!issued) {
    logger.warn({ email }, "otp: tope acumulado de códigos equivocados");
    return;
  }
  if (!member || code === null) {
    logger.info({ email }, "otp: correo fuera del roster");
    return;
  }

  const nombre = member.preferredName ?? member.firstName;
  const cuerpo = t("T-054", { nombre, código: code });
  // Mismo envoltorio que el resto de los correos, con el pie transaccional T-2092 en vez del pie
  // legal de campañas: el lenguaje de lista de correo empuja la clasificación a masivo (ADR-050).
  const { html, text } = wrapEmail({
    siteName: t("T-001"),
    bodyHtml: `<p>${renderHtml(cuerpo)}</p>`,
    bodyText: renderPlain(cuerpo),
    closing: t("T-002"),
    footer: t("T-2092"),
  });
  // Inline, no por outbox: la persona está esperando el código (ADR-012).
  const receipt = await sendTransactionalEmail({
    personId: member.personId,
    to: email,
    // El asunto nunca lleva el código: se guarda en `message` y se ve en la administración (ADR-050).
    subject: t("T-053"),
    text,
    html,
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  });
  // Sin esta línea no hay forma de saber si a alguien se le intentó enviar algo; el código nunca se registra.
  logger.info(
    {
      personId: member.personId,
      purpose,
      status: receipt.status,
      provider: receipt.provider,
      providerId: receipt.providerId,
    },
    "otp: correo del código",
  );
}

export type VerifyOtpResult =
  | { ok: true; token: string; sessionId: string; expiresAt: Date; personId: string }
  | { ok: false; reason: "EXPIRED" | "INVALID" | "LOCKED"; attemptsLeft: number };

export interface VerifyOtpInput {
  email: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
  remember: boolean;
  now?: Date;
}

type CheckResult =
  | { ok: true; email: string }
  | { ok: false; reason: "EXPIRED" | "INVALID" | "LOCKED"; attemptsLeft: number };

/**
 * Comprueba el código contra el reto vivo más reciente, contando el intento. Corre dentro de una
 * transacción y bajo el candado del correo. El tope acumulado se cumple también acá (ADR-113,
 * regla 3): sin intentos en el reto o en el correo responde `LOCKED` sin comparar el código.
 */
async function checkChallenge(
  tx: Tx,
  email: string,
  code: string,
  purpose: OtpPurpose,
  now: Date,
): Promise<CheckResult> {
  const env = getEnv();
  await lockEmail(tx, email);
  const [challenge] = await tx
    .select()
    .from(otpChallenge)
    .where(
      and(
        eq(otpChallenge.email, email),
        eq(otpChallenge.purpose, purpose),
        isNull(otpChallenge.consumedAt),
        gt(otpChallenge.expiresAt, now),
      ),
    )
    .orderBy(desc(otpChallenge.createdAt))
    .limit(1)
    .for("update");

  if (!challenge) {
    return { ok: false, reason: "EXPIRED", attemptsLeft: 0 };
  }
  // Lo que queda es lo menor entre el reto y el correo: un reto anterior que vuelve a quedar vivo
  // no trae de vuelta intentos que el correo ya gastó.
  const left = Math.min(
    challenge.maxAttempts - challenge.attempts,
    await attemptBudget(tx, email, purpose, now),
  );
  if (!(left >= 1)) {
    return { ok: false, reason: "LOCKED", attemptsLeft: 0 };
  }
  if (!codeMatches(challenge.codeHash, env.SESSION_SECRET, email, code)) {
    await tx
      .update(otpChallenge)
      .set({ attempts: sql`${otpChallenge.attempts} + 1` })
      .where(eq(otpChallenge.id, challenge.id));
    const attemptsLeft = left - 1;
    return { ok: false, reason: attemptsLeft === 0 ? "LOCKED" : "INVALID", attemptsLeft };
  }
  await tx.update(otpChallenge).set({ consumedAt: now }).where(eq(otpChallenge.id, challenge.id));
  return { ok: true, email };
}

/** Verifica el código y abre la sesión en la misma transacción. */
export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  return getDb().transaction(async (tx) => {
    const check = await checkChallenge(tx, email, input.code, "LOGIN", now);
    if (!check.ok) {
      return check;
    }
    const member = await findEligibleMemberByEmail(email);
    if (!member) {
      return { ok: false, reason: "EXPIRED", attemptsLeft: 0 };
    }
    const created = await createSession(tx, {
      personId: member.personId,
      remember: input.remember,
      userAgent: input.userAgent,
      ip: input.ip,
      now,
    });
    logger.info({ personId: member.personId }, "sesión abierta");
    return { ok: true, ...created, personId: member.personId };
  });
}

export interface VerifyStepUpInput {
  email: string;
  code: string;
  sessionId: string;
  now?: Date;
}

/** Step-up: un OTP verificado hace menos de 15 minutos habilita las acciones sensibles del admin. */
export async function verifyStepUp(input: VerifyStepUpInput): Promise<CheckResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  return getDb().transaction(async (tx) => {
    const check = await checkChallenge(tx, email, input.code, "STEP_UP", now);
    if (check.ok) {
      await markStepUp(input.sessionId, now);
    }
    return check;
  });
}
