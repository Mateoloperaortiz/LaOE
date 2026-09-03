import { and, desc, eq, gt, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { getMemberSummary } from "@/modules/people";
import { permission, session } from "../schema";
import type { Actor, ActorPermission } from "./actor";
import {
  generateSessionToken,
  hashToken,
  SESSION_REMEMBERED_MS,
  SESSION_SHORT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from "./pure";

export interface SessionRecord {
  id: string;
  personId: string;
  remembered: boolean;
  expiresAt: Date;
  otpVerifiedAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export interface CreateSessionInput {
  personId: string;
  remember: boolean;
  userAgent: string | null;
  ip: string | null;
  now?: Date;
}

/** Token opaco de 32 bytes; en la base solo queda su hash (ADR-010). */
export async function createSession(
  exec: Executor,
  input: CreateSessionInput,
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = generateSessionToken();
  const expiresAt = new Date(
    now.getTime() + (input.remember ? SESSION_REMEMBERED_MS : SESSION_SHORT_MS),
  );
  const [row] = await exec
    .insert(session)
    .values({
      personId: input.personId,
      tokenHash: hashToken(token),
      expiresAt,
      remembered: input.remember,
      otpVerifiedAt: now,
      userAgent: input.userAgent,
      ip: input.ip,
      lastSeenAt: now,
    })
    .returning({ id: session.id });
  if (!row) {
    throw new Error("No se pudo crear la sesión");
  }
  return { token, sessionId: row.id, expiresAt };
}

export async function findSessionByToken(
  token: string,
  now = new Date(),
): Promise<SessionRecord | null> {
  const [row] = await getDb()
    .select()
    .from(session)
    .where(and(eq(session.tokenHash, hashToken(token)), gt(session.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

/** Renueva la sesión al usarse, como mucho una vez cada diez minutos. */
export async function touchSession(record: SessionRecord, now = new Date()): Promise<void> {
  if (now.getTime() - record.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) {
    return;
  }
  await getDb()
    .update(session)
    .set({
      lastSeenAt: now,
      ...(record.remembered ? { expiresAt: new Date(now.getTime() + SESSION_REMEMBERED_MS) } : {}),
    })
    .where(eq(session.id, record.id));
}

export async function markStepUp(sessionId: string, at = new Date()): Promise<void> {
  await getDb().update(session).set({ otpVerifiedAt: at }).where(eq(session.id, sessionId));
}

export async function destroySessionByToken(token: string): Promise<void> {
  await getDb()
    .delete(session)
    .where(eq(session.tokenHash, hashToken(token)));
}

/** Destruye todas las sesiones de una persona (cambio de estado o de correo), salvo la indicada. */
export async function destroySessionsFor(
  exec: Executor,
  personId: string,
  keepSessionId?: string,
): Promise<number> {
  const condition =
    keepSessionId === undefined
      ? eq(session.personId, personId)
      : and(eq(session.personId, personId), ne(session.id, keepSessionId));
  const deleted = await exec.delete(session).where(condition).returning({ id: session.id });
  return deleted.length;
}

export async function listSessionsFor(
  personId: string,
  now = new Date(),
): Promise<SessionRecord[]> {
  return getDb()
    .select()
    .from(session)
    .where(and(eq(session.personId, personId), gt(session.expiresAt, now)))
    .orderBy(desc(session.lastSeenAt));
}

export async function listPermissionsFor(personId: string): Promise<ActorPermission[]> {
  return getDb()
    .select({ code: permission.code, committeeId: permission.committeeId })
    .from(permission)
    .where(eq(permission.personId, personId));
}

/** Sesión vigente + persona con membresía que puede entrar + permisos; null si algo falla. */
export async function resolveActor(token: string, now = new Date()): Promise<Actor | null> {
  const record = await findSessionByToken(token, now);
  if (!record) {
    return null;
  }
  const member = await getMemberSummary(record.personId);
  if (!member || !member.canSignIn) {
    return null;
  }
  const permissions = await listPermissionsFor(record.personId);
  return {
    personId: member.personId,
    sessionId: record.id,
    email: member.email,
    name: member.preferredName ?? member.firstName,
    firstName: member.firstName,
    membershipStatus: member.membershipStatus,
    permissions,
    otpVerifiedAt: record.otpVerifiedAt,
    sessionLastSeenAt: record.lastSeenAt,
    sessionRemembered: record.remembered,
    isAdmin: permissions.some((item) => item.code === "ADMIN"),
  };
}
