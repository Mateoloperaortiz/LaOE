import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand, type Tx } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { accessGrantIssued } from "@/domain-events/identity";
import { canParticipate, getMemberSummary, lockWalletMember } from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { logger } from "@/shared/log";
import { accessGrant, credential, permission } from "../schema";
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
  // La concesión de un permiso toma el mismo candado: la comparación de abajo no lee los permisos
  // de antes de una concesión que ya está escribiendo (ADR-119 regla 17).
  await lockAccessGrantsOf(ctx.tx, input.personId);
  // Sin emisor es el arranque del sistema (ADR-051 regla 16): el camino de vuelta de un ADMIN.
  if (ctx.actor.personId !== null) {
    await assertNoPrivilegeGain(ctx, ctx.actor.personId, input.personId);
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
  await ctx.emit(
    eventOf(accessGrantIssued, {
      personId: input.personId,
      kind: input.kind,
      issuedById: ctx.actor.personId,
    }),
  );
  return { token, expiresAt };
}

export function issueAccessGrantAs(
  actor: Actor,
  input: IssueAccessGrantInput,
): Promise<IssuedAccessGrant> {
  return runCommand(actor, (ctx) => issueAccessGrant(ctx, input));
}

/**
 * Quien emite ve el enlace y puede entrar como su destinatario (amenaza aceptada de ADR-051), así
 * que el enlace no le puede dar permisos que no tiene: si el destinatario tiene alguno de más, solo
 * ADMIN emite (ADR-113 regla 1). Los permisos se leen acá, en la transacción, y no de la sesión de
 * quien llama. De quien emite cuentan los que hoy operan (en licencia, ninguno, como en
 * `resolveActor`); del destinatario, todos los guardados, porque vuelven a operar con él.
 *
 * El estado de quien emite se lee también acá, con el candado de su ciclo de membresía tomado
 * (ADR-120 regla 5): la emisión que llega mientras sale a licencia o lo dan de baja espera y decide
 * con lo que quedó confirmado. Va después del candado del destinatario (`lockAccessGrantsOf`), y
 * ningún camino toma los dos en el otro orden.
 */
async function assertNoPrivilegeGain(
  ctx: CommandContext,
  issuerId: string,
  recipientId: string,
): Promise<void> {
  const rows = await ctx.tx
    .select({
      personId: permission.personId,
      code: permission.code,
      committeeId: permission.committeeId,
    })
    .from(permission)
    .where(inArray(permission.personId, [issuerId, recipientId]));
  const wanted = rows.filter((row) => row.personId === recipientId);
  if (wanted.length === 0) {
    return;
  }
  const issuer = await lockWalletMember(ctx.tx, issuerId);
  const held = canParticipate(issuer?.status)
    ? rows.filter((row) => row.personId === issuerId)
    : [];
  if (held.some((row) => row.code === "ADMIN")) {
    return;
  }
  const covered = wanted.every((want) =>
    held.some((have) => have.code === want.code && have.committeeId === want.committeeId),
  );
  if (!covered) {
    throw new DomainError(t("T-3206"));
  }
}

/**
 * Candado de los enlaces de una persona: emitirle uno y concederle un permiso van de a uno, así que
 * ningún enlace nace con los permisos de antes de una concesión simultánea (ADR-119 regla 17).
 */
export async function lockAccessGrantsOf(tx: Tx, personId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`access-grant:${personId}`}, 0))`,
  );
}

/**
 * Borra los enlaces de una persona: los llaman el retiro y la anonimización, como a la credencial, y
 * la concesión de un permiso (ADR-119 regla 17).
 */
export async function deleteAccessGrantsFor(exec: Executor, personId: string): Promise<number> {
  const rows = await exec
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
