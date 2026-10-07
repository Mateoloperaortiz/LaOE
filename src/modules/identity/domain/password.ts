import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
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
  PERSON_PASSWORD_MAX_FAILED,
  PERSON_PASSWORD_WINDOW_MS,
  personAttemptKey,
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

/**
 * Borra la contraseña de una persona. La llaman el retiro y la anonimización (ADR-014, ADR-030):
 * quien ya no entra no necesita credencial, y un hash de contraseña no es historia institucional.
 */
export async function deleteCredentialFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(credential)
    .where(eq(credential.personId, personId))
    .returning({ id: credential.id });
  return rows.length;
}

// Quien ya tiene sesión cuenta sus contraseñas equivocadas aparte (ADR-114, regla 2). El paso de
// seguridad y el cambio de contraseña gastan un mismo contador, que es de la persona: el ingreso sin
// sesión no lo lee ni lo escribe, y ellos no miran los contadores del ingreso, ni el del correo ni
// el de la IP, que cualquiera mueve desde afuera.

/**
 * Anota el intento de una persona con sesión antes de comparar la contraseña y devuelve su fila, o
 * null si ya gastó los de la ventana. Contar y anotar van juntos bajo un candado por persona: los
 * intentos que llegan a la vez hacen fila y ninguno cae entre la cuenta y la escritura. El intento
 * nace como fallo y `settlePersonAttempt` lo corrige si la contraseña era la buena, así que uno que
 * queda a medias cuenta en contra. Uno bloqueado no se anota: insistir no alarga el bloqueo.
 */
async function openPersonAttempt(
  personId: string,
  ip: string | null,
  now: Date,
): Promise<string | null> {
  const key = personAttemptKey(personId);
  const since = new Date(now.getTime() - PERSON_PASSWORD_WINDOW_MS);
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`password:${key}`}, 0))`);
    const [row] = await tx
      .select({ n: count() })
      .from(loginAttempt)
      .where(
        and(
          eq(loginAttempt.email, key),
          eq(loginAttempt.succeeded, false),
          gt(loginAttempt.createdAt, since),
        ),
      );
    // Negado a propósito: sin cuenta, o con una que no es un número, no hay intento.
    if (!row || !(row.n < PERSON_PASSWORD_MAX_FAILED)) {
      logger.warn({ personId }, "contraseña con sesión: límite por persona");
      return null;
    }
    const [attempt] = await tx
      .insert(loginAttempt)
      .values({ email: key, ip, succeeded: false, createdAt: now })
      .returning({ id: loginAttempt.id });
    return attempt?.id ?? null;
  });
}

async function settlePersonAttempt(attemptId: string): Promise<void> {
  await getDb().update(loginAttempt).set({ succeeded: true }).where(eq(loginAttempt.id, attemptId));
}

/**
 * Compara la contraseña de quien tiene sesión gastando el contador de la persona. Sin credencial
 * gasta el mismo tiempo y cuenta como fallo.
 */
async function checkOwnPassword(
  personId: string,
  stored: string | null,
  password: string,
  ip: string | null,
  now: Date,
): Promise<"OK" | "INVALID" | "LOCKED"> {
  const attemptId = await openPersonAttempt(personId, ip, now);
  if (attemptId === null) {
    return "LOCKED";
  }
  const matches = stored
    ? await verifyPassword(stored, password)
    : await burnPasswordTime().then(() => false);
  if (!matches) {
    return "INVALID";
  }
  await settlePersonAttempt(attemptId);
  return "OK";
}

export type StepUpResult = { ok: true } | { ok: false; reason: "INVALID" | "LOCKED" };

export interface StepUpPasswordInput {
  personId: string;
  password: string;
  sessionId: string;
  ip: string | null;
  now?: Date;
}

/**
 * Step-up con la contraseña propia (ADR-051, regla 7). Estampa la misma marca de sesión que
 * estampaba el código, así que la ventana de 15 minutos y los guards no cambian. Los fallos se
 * cuentan por persona (ADR-114, regla 2).
 */
export async function verifyStepUpPassword(input: StepUpPasswordInput): Promise<StepUpResult> {
  const now = input.now ?? new Date();
  const stored = await findPasswordHash(input.personId);
  const check = await checkOwnPassword(input.personId, stored, input.password, input.ip, now);
  if (check !== "OK") {
    return { ok: false, reason: check };
  }
  await markStepUp(input.sessionId, now);
  return { ok: true };
}

export type SetPasswordResult =
  | { ok: true; closed: number }
  | { ok: false; reason: "CURRENT" }
  | { ok: false; reason: "LOCKED" }
  | { ok: false; reason: "PASSWORD"; problem: PasswordProblem };

export interface SetOwnPasswordInput {
  personId: string;
  email: string;
  names: readonly string[];
  /** Solo cuando ya hay una contraseña: quien no tiene ninguna llega con step-up. */
  current: string;
  password: string;
  keepSessionId: string;
  /** Queda en la fila del intento cuando se compara la contraseña actual. */
  ip: string | null;
  now?: Date;
}

/**
 * Crear o cambiar la contraseña propia desde Ajustes (ADR-051, regla 8). Cierra las demás sesiones:
 * cambiarla es lo que hace alguien que sospecha que su acceso quedó en otro lado. La contraseña
 * actual se prueba contra el contador de la persona (ADR-114, regla 2): quien tenga la sesión no la
 * adivina acá sin tope.
 */
export async function setOwnPassword(input: SetOwnPasswordInput): Promise<SetPasswordResult> {
  const now = input.now ?? new Date();
  const stored = await findPasswordHash(input.personId);
  if (stored) {
    const check = await checkOwnPassword(input.personId, stored, input.current, input.ip, now);
    if (check !== "OK") {
      return { ok: false, reason: check === "LOCKED" ? "LOCKED" : "CURRENT" };
    }
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
