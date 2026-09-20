import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getMemberSummary } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { logger } from "@/shared/log";
import { accessGrant, credential } from "../schema";
import {
  ACCESS_GRANT_TTL_MS,
  checkPassword,
  generateAccessToken,
  hashPassword,
  hashToken,
  type PasswordProblem,
} from "./pure";
import { createSession, destroySessionsFor } from "./session";

// Enlace de un solo uso que emite la junta fuera del correo (ADR-051). El token en claro existe
// únicamente en la URL y en la pantalla de quien lo emite: en base va solo su SHA-256, y nunca
// pasa por `message`, por los logs ni por un exporte.

export type AccessGrantKind = "ACTIVATION" | "RECOVERY";

export interface IssueAccessGrantInput {
  personId: string;
  kind: AccessGrantKind;
}

export interface IssuedAccessGrant {
  token: string;
  expiresAt: Date;
}

/**
 * Emite el enlace y consume los que la persona tuviera vivos: hay uno solo a la vez, así que ante
 * la duda de si el anterior llegó bien, se emite otro y el viejo deja de servir.
 */
export async function issueAccessGrant(
  ctx: CommandContext,
  input: IssueAccessGrantInput,
  now = new Date(),
): Promise<IssuedAccessGrant> {
  if (ctx.actor.personId === input.personId) {
    throw new DomainError(t("T-2126"));
  }
  const member = await getMemberSummary(input.personId);
  if (!member?.canSignIn) {
    throw new DomainError(t("T-2127"));
  }
  await ctx.tx
    .update(accessGrant)
    .set({ consumedAt: now })
    .where(
      and(
        eq(accessGrant.personId, input.personId),
        isNull(accessGrant.consumedAt),
        gt(accessGrant.expiresAt, now),
      ),
    );
  const token = generateAccessToken();
  const expiresAt = new Date(now.getTime() + ACCESS_GRANT_TTL_MS);
  const [row] = await ctx.tx
    .insert(accessGrant)
    .values({
      personId: input.personId,
      kind: input.kind,
      tokenHash: hashToken(token),
      issuedById: ctx.actor.personId,
      expiresAt,
    })
    .returning({ id: accessGrant.id });
  if (!row) {
    throw new Error("No se pudo emitir el enlace de acceso");
  }
  await ctx.audit({
    action: "access-grant.issued",
    entityType: "access_grant",
    entityId: row.id,
    after: { personId: input.personId, kind: input.kind, expiresAt: expiresAt.toISOString() },
  });
  await ctx.emit({
    type: "access-grant.issued",
    payload: {
      personId: input.personId,
      kind: input.kind,
      issuedById: ctx.actor.personId,
    },
  });
  return { token, expiresAt };
}

export function issueAccessGrantAs(
  actor: Actor,
  input: IssueAccessGrantInput,
): Promise<IssuedAccessGrant> {
  return runCommand(actor, (ctx) => issueAccessGrant(ctx, input));
}

/** Borra los enlaces de una persona: los llaman el retiro y la anonimización, como a la credencial. */
export async function deleteAccessGrantsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(accessGrant)
    .where(eq(accessGrant.personId, personId))
    .returning({ id: accessGrant.id });
  return rows.length;
}

export interface AccessGrantReading {
  personId: string;
  kind: AccessGrantKind;
  /** Para que quien recibe el enlace confirme que es suyo antes de escribir nada. */
  name: string;
  email: string;
}

/** Lee un enlace vivo sin consumirlo, para pintar la pantalla. */
export async function resolveAccessGrant(
  token: string,
  now = new Date(),
): Promise<AccessGrantReading | null> {
  const [row] = await getDb()
    .select({ personId: accessGrant.personId, kind: accessGrant.kind })
    .from(accessGrant)
    .where(
      and(
        eq(accessGrant.tokenHash, hashToken(token)),
        isNull(accessGrant.consumedAt),
        gt(accessGrant.expiresAt, now),
      ),
    );
  if (!row) {
    return null;
  }
  const member = await getMemberSummary(row.personId);
  if (!member?.canSignIn) {
    return null;
  }
  return {
    personId: row.personId,
    kind: row.kind,
    name: member.preferredName ?? member.firstName,
    email: member.email,
  };
}

export type ConsumeAccessGrantResult =
  | { ok: true; token: string; sessionId: string; expiresAt: Date; personId: string }
  | { ok: false; reason: "INVALID" }
  | { ok: false; reason: "PASSWORD"; problem: PasswordProblem };

export interface ConsumeAccessGrantInput {
  token: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
  now?: Date;
}

/**
 * Fija la contraseña, consume el enlace, cierra las sesiones anteriores y abre la nueva, todo en
 * una transacción. Las sesiones se borran en vez de invalidarse con `person.sessionsRevokedAt`:
 * esa marca y el `createdAt` de la sesión nueva caerían en el mismo instante dentro de la
 * transacción, y `resolveActor` rechaza lo creado en ese instante o antes (corrección de ADR-051).
 */
export async function consumeAccessGrant(
  input: ConsumeAccessGrantInput,
): Promise<ConsumeAccessGrantResult> {
  const now = input.now ?? new Date();
  const reading = await resolveAccessGrant(input.token, now);
  if (!reading) {
    return { ok: false, reason: "INVALID" };
  }
  const problem = checkPassword(input.password, {
    email: reading.email,
    names: [reading.name],
  });
  if (problem) {
    return { ok: false, reason: "PASSWORD", problem };
  }
  const passwordHash = await hashPassword(input.password);
  const tokenHash = hashToken(input.token);

  return getDb().transaction(async (tx) => {
    // El enlace se consume dentro de la transacción y solo si seguía vivo: dos pestañas con el
    // mismo enlace no fijan dos contraseñas.
    const consumed = await tx
      .update(accessGrant)
      .set({ consumedAt: now, consumedIp: input.ip })
      .where(
        and(
          eq(accessGrant.tokenHash, tokenHash),
          isNull(accessGrant.consumedAt),
          gt(accessGrant.expiresAt, now),
        ),
      )
      .returning({ id: accessGrant.id });
    if (consumed.length === 0) {
      return { ok: false, reason: "INVALID" };
    }
    await tx
      .insert(credential)
      .values({ personId: reading.personId, passwordHash })
      .onConflictDoUpdate({
        target: credential.personId,
        set: { passwordHash, updatedAt: now },
      });
    const closed = await destroySessionsFor(tx, reading.personId);
    const created = await createSession(tx, {
      personId: reading.personId,
      remember: true,
      userAgent: input.userAgent,
      ip: input.ip,
      now,
    });
    logger.info(
      { personId: reading.personId, kind: reading.kind, closed },
      "enlace de acceso usado",
    );
    return { ok: true, ...created, personId: reading.personId };
  });
}
