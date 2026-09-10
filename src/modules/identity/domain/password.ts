import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { findEligibleMemberByEmail } from "@/modules/people";
import { logger } from "@/shared/log";
import { credential, loginAttempt } from "../schema";
import {
  burnPasswordTime,
  LOGIN_MAX_PER_EMAIL,
  LOGIN_MAX_PER_IP,
  normalizeEmail,
  OTP_WINDOW_MS,
  verifyPassword,
} from "./pure";
import { createSession } from "./session";

// Ingreso con la contraseña propia (ADR-051). La respuesta es siempre la misma: correo que no
// existe, persona sin contraseña y contraseña equivocada no se distinguen, ni por texto ni por
// tiempo. Los límites se cuentan en Postgres, igual que los del OTP.

async function countFailures(column: "email" | "ip", value: string, since: Date): Promise<number> {
  const target = column === "email" ? loginAttempt.email : loginAttempt.ip;
  const [row] = await getDb()
    .select({ n: count() })
    .from(loginAttempt)
    .where(
      and(eq(target, value), eq(loginAttempt.succeeded, false), gt(loginAttempt.createdAt, since)),
    );
  return row?.n ?? 0;
}

async function recordAttempt(email: string, ip: string | null, succeeded: boolean): Promise<void> {
  await getDb().insert(loginAttempt).values({ email, ip, succeeded });
}

/** Hash guardado de una persona, o null si todavía no eligió contraseña. */
export async function findPasswordHash(personId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ passwordHash: credential.passwordHash })
    .from(credential)
    .where(eq(credential.personId, personId));
  return row?.passwordHash ?? null;
}

export type SignInResult =
  | { ok: true; token: string; sessionId: string; expiresAt: Date; personId: string }
  | { ok: false; reason: "INVALID" | "LOCKED" };

export interface SignInInput {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
  remember: boolean;
  now?: Date;
}

export async function signInWithPassword(input: SignInInput): Promise<SignInResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const since = new Date(now.getTime() - OTP_WINDOW_MS);

  // Un intento bloqueado no se registra: si lo hiciera, insistir mantendría el bloqueo abierto
  // para siempre y cualquiera podría dejar afuera a una persona a voluntad.
  if ((await countFailures("email", email, since)) >= LOGIN_MAX_PER_EMAIL) {
    logger.warn({ email }, "ingreso: límite por correo");
    return { ok: false, reason: "LOCKED" };
  }
  if (input.ip && (await countFailures("ip", input.ip, since)) >= LOGIN_MAX_PER_IP) {
    logger.warn({ ip: input.ip }, "ingreso: límite por IP");
    return { ok: false, reason: "LOCKED" };
  }

  const member = await findEligibleMemberByEmail(email);
  const stored = member ? await findPasswordHash(member.personId) : null;
  // Sin credencial se gasta el mismo tiempo que con una: si no, el reloj enumeraría el roster.
  const matches = stored
    ? await verifyPassword(stored, input.password)
    : await burnPasswordTime().then(() => false);

  if (!member || !stored || !matches) {
    await recordAttempt(email, input.ip, false);
    logger.info({ email, hadCredential: Boolean(stored) }, "ingreso: credenciales incorrectas");
    return { ok: false, reason: "INVALID" };
  }

  const created = await getDb().transaction((tx) =>
    createSession(tx, {
      personId: member.personId,
      remember: input.remember,
      userAgent: input.userAgent,
      ip: input.ip,
      now,
    }),
  );
  await recordAttempt(email, input.ip, true);
  logger.info({ personId: member.personId }, "sesión abierta con contraseña");
  return { ok: true, ...created, personId: member.personId };
}
