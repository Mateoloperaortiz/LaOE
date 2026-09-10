import { and, count, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { findEligibleMemberByEmail } from "@/modules/people";
import { logger } from "@/shared/log";
import { credential, loginAttempt } from "../schema";
import {
  burnPasswordTime,
  checkPassword,
  hashPassword,
  LOGIN_MAX_PER_EMAIL,
  LOGIN_MAX_PER_IP,
  normalizeEmail,
  OTP_WINDOW_MS,
  type PasswordProblem,
  verifyPassword,
} from "./pure";
import { createSession, destroySessionsFor, markStepUp } from "./session";

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

/** Si la persona ya eligió contraseña. Devuelve un booleano, no el hash: nada de secretos en la UI. */
export async function hasPassword(personId: string): Promise<boolean> {
  return (await findPasswordHash(personId)) !== null;
}

/** Quiénes de esta lista ya eligieron contraseña, para la jornada de activación (ADR-051). */
export async function listPeopleWithPassword(personIds: string[]): Promise<Set<string>> {
  if (personIds.length === 0) {
    return new Set();
  }
  const rows = await getDb()
    .select({ personId: credential.personId })
    .from(credential)
    .where(inArray(credential.personId, personIds));
  return new Set(rows.map((row) => row.personId));
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

export type StepUpResult = { ok: true } | { ok: false; reason: "INVALID" | "LOCKED" };

export interface StepUpPasswordInput {
  personId: string;
  email: string;
  password: string;
  sessionId: string;
  ip: string | null;
  now?: Date;
}

/**
 * Step-up con la contraseña propia (ADR-051, regla 7). Estampa la misma marca de sesión que
 * estampaba el código, así que la ventana de 15 minutos y los guards no cambian.
 */
export async function verifyStepUpPassword(input: StepUpPasswordInput): Promise<StepUpResult> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const since = new Date(now.getTime() - OTP_WINDOW_MS);
  if ((await countFailures("email", email, since)) >= LOGIN_MAX_PER_EMAIL) {
    return { ok: false, reason: "LOCKED" };
  }
  if (input.ip && (await countFailures("ip", input.ip, since)) >= LOGIN_MAX_PER_IP) {
    return { ok: false, reason: "LOCKED" };
  }
  const stored = await findPasswordHash(input.personId);
  const matches = stored
    ? await verifyPassword(stored, input.password)
    : await burnPasswordTime().then(() => false);
  if (!matches) {
    await recordAttempt(email, input.ip, false);
    return { ok: false, reason: "INVALID" };
  }
  await recordAttempt(email, input.ip, true);
  await markStepUp(input.sessionId, now);
  return { ok: true };
}

export type SetPasswordResult =
  | { ok: true; closed: number }
  | { ok: false; reason: "CURRENT" }
  | { ok: false; reason: "PASSWORD"; problem: PasswordProblem };

export interface SetOwnPasswordInput {
  personId: string;
  email: string;
  names: readonly string[];
  /** Solo cuando ya hay una contraseña: quien no tiene ninguna llega con step-up. */
  current: string;
  password: string;
  keepSessionId: string;
  now?: Date;
}

/**
 * Crear o cambiar la contraseña propia desde Ajustes (ADR-051, regla 8). Cierra las demás sesiones:
 * cambiarla es lo que hace alguien que sospecha que su acceso quedó en otro lado.
 */
export async function setOwnPassword(input: SetOwnPasswordInput): Promise<SetPasswordResult> {
  const now = input.now ?? new Date();
  const stored = await findPasswordHash(input.personId);
  if (stored && !(await verifyPassword(stored, input.current))) {
    return { ok: false, reason: "CURRENT" };
  }
  const problem = checkPassword(input.password, { email: input.email, names: input.names });
  if (problem) {
    return { ok: false, reason: "PASSWORD", problem };
  }
  const passwordHash = await hashPassword(input.password);
  return getDb().transaction(async (tx) => {
    await tx
      .insert(credential)
      .values({ personId: input.personId, passwordHash })
      .onConflictDoUpdate({ target: credential.personId, set: { passwordHash, updatedAt: now } });
    const closed = await destroySessionsFor(tx, input.personId, input.keepSessionId);
    logger.info({ personId: input.personId, closed }, "contraseña propia guardada");
    return { ok: true, closed };
  });
}
