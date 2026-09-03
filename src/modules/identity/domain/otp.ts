import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import { getEnv } from "@/env";
import { sendTransactionalEmail } from "@/modules/comms";
import { findEligibleMemberByEmail } from "@/modules/people";
import { t } from "@/shared/copy";
import { renderHtml, renderPlain } from "@/shared/copy/render";
import { logger } from "@/shared/log";
import { otpChallenge } from "../schema";
import {
  codeMatches,
  generateCode,
  hashCode,
  normalizeEmail,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_EMAIL,
  OTP_MAX_PER_IP,
  OTP_TTL_MS,
  OTP_WINDOW_MS,
} from "./pure";
import { createSession, markStepUp } from "./session";

// Identidad por correo del roster con OTP (ADR-010, 05-acceso.md). La respuesta a "pedir código"
// es siempre la misma: nunca se enumera el roster.

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

/** Crea y envía un código si el correo está en el roster y no se superó el límite. Nunca revela nada. */
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

  const member = await findEligibleMemberByEmail(email);
  if (!member) {
    logger.info({ email }, "otp: correo fuera del roster");
    return;
  }

  const code = generateCode(env.OTP_FIXED_CODE);
  await getDb()
    .insert(otpChallenge)
    .values({
      email,
      purpose,
      codeHash: hashCode(env.SESSION_SECRET, email, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
      ip: input.ip,
    });

  const nombre = member.preferredName ?? member.firstName;
  const cuerpo = t("T-054", { nombre, código: code });
  const pie = t("T-208").replace("{enlace de baja si aplica}", "").trim();
  // Inline, no por outbox: la persona está esperando el código (ADR-012).
  await sendTransactionalEmail({
    personId: member.personId,
    to: email,
    subject: t("T-053", { código: code }),
    text: `${renderPlain(cuerpo)}\n\n${pie}`,
    html: `<p>${renderHtml(cuerpo)}</p><p style="color:#666;font-size:12px">${renderHtml(pie)}</p>`,
  });
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

/** Comprueba el código contra el reto vivo más reciente, contando el intento. Corre dentro de una transacción. */
async function checkChallenge(
  tx: Tx,
  email: string,
  code: string,
  purpose: OtpPurpose,
  now: Date,
): Promise<CheckResult> {
  const env = getEnv();
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
  if (challenge.attempts >= challenge.maxAttempts) {
    return { ok: false, reason: "LOCKED", attemptsLeft: 0 };
  }
  if (!codeMatches(challenge.codeHash, env.SESSION_SECRET, email, code)) {
    const attempts = challenge.attempts + 1;
    await tx
      .update(otpChallenge)
      .set({ attempts: sql`${otpChallenge.attempts} + 1` })
      .where(eq(otpChallenge.id, challenge.id));
    const attemptsLeft = Math.max(0, challenge.maxAttempts - attempts);
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
