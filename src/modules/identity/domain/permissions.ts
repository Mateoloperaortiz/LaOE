import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { permissionGranted, permissionRevoked } from "@/domain-events/identity";
import {
  findMemberByEmail,
  getPeopleByIds,
  listAllCommittees,
  searchPeople,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { permission } from "../schema";
import { deleteAccessGrantsFor, lockAccessGrantsOf } from "./access-grant";
import { normalizeEmail } from "./pure";

// Permisos técnicos (ADR-011): ADMIN, líder de comité y junta. Se conceden con step-up y quedan auditados.

export const permissionInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    code: z.enum(["ADMIN", "COMMITTEE_LEADER", "BOARD"]),
    committeeId: z.string().trim().min(1).optional(),
  })
  .refine((input) => (input.code === "COMMITTEE_LEADER") === (input.committeeId !== undefined), {
    path: ["committeeId"],
    message: t("T-294"),
  });

export type PermissionInput = z.infer<typeof permissionInputSchema>;

export interface PermissionRow {
  id: string;
  personId: string;
  personName: string;
  personEmail: string;
  code: "ADMIN" | "COMMITTEE_LEADER" | "BOARD";
  committeeId: string | null;
  committeeName: string | null;
  grantedById: string | null;
  grantedByName: string | null;
  grantedAt: Date;
}

export interface PermissionListParams {
  q: string;
  code?: string | undefined;
  page: number;
  pageSize: number;
}

export async function listPermissions(
  params: PermissionListParams,
): Promise<{ rows: PermissionRow[]; total: number }> {
  const conditions = [];
  if (params.q) {
    const people = await searchPeople(params.q, 50);
    if (people.length === 0) {
      return { rows: [], total: 0 };
    }
    conditions.push(
      inArray(
        permission.personId,
        people.map((item) => item.id),
      ),
    );
  }
  if (params.code === "ADMIN" || params.code === "COMMITTEE_LEADER" || params.code === "BOARD") {
    conditions.push(eq(permission.code, params.code));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [total], committees] = await Promise.all([
    db
      .select()
      .from(permission)
      .where(where)
      .orderBy(desc(permission.grantedAt))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(permission).where(where),
    listAllCommittees(),
  ]);
  const people = await getPeopleByIds([
    ...rows.map((row) => row.personId),
    ...rows.flatMap((row) => (row.grantedById ? [row.grantedById] : [])),
  ]);
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  return {
    total: total?.n ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      personName: people.get(row.personId)?.fullName ?? "",
      personEmail: people.get(row.personId)?.email ?? "",
      code: row.code,
      committeeId: row.committeeId,
      committeeName: row.committeeId ? (committeeNames.get(row.committeeId) ?? null) : null,
      grantedById: row.grantedById,
      grantedByName: row.grantedById ? (people.get(row.grantedById)?.fullName ?? null) : null,
      grantedAt: row.grantedAt,
    })),
  };
}

export async function getPermission(id: string): Promise<PermissionRow | null> {
  const [row] = await getDb().select().from(permission).where(eq(permission.id, id)).limit(1);
  if (!row) {
    return null;
  }
  const people = await getPeopleByIds([
    row.personId,
    ...(row.grantedById ? [row.grantedById] : []),
  ]);
  const committees = await listAllCommittees();
  return {
    id: row.id,
    personId: row.personId,
    personName: people.get(row.personId)?.fullName ?? "",
    personEmail: people.get(row.personId)?.email ?? "",
    code: row.code,
    committeeId: row.committeeId,
    committeeName: row.committeeId
      ? (committees.find((item) => item.id === row.committeeId)?.name ?? null)
      : null,
    grantedById: row.grantedById,
    grantedByName: row.grantedById ? (people.get(row.grantedById)?.fullName ?? null) : null,
    grantedAt: row.grantedAt,
  };
}

export async function grantPermission(
  ctx: CommandContext,
  input: PermissionInput,
): Promise<{ id: string }> {
  const member = await findMemberByEmail(normalizeEmail(input.email));
  if (!member) {
    throw new DomainError(t("T-267"), "email");
  }
  // De a uno con la emisión de un enlace para esta persona (ADR-119 regla 17).
  await lockAccessGrantsOf(ctx.tx, member.id);
  try {
    const [row] = await ctx.tx
      .insert(permission)
      .values({
        personId: member.id,
        code: input.code,
        committeeId: input.committeeId ?? null,
        grantedById: ctx.actor.personId,
      })
      .returning({ id: permission.id });
    if (!row) {
      throw new Error("No se pudo otorgar el permiso");
    }
    // Un enlace emitido antes pasó la regla de privilegio sin este permiso (ADR-113 regla 1): deja
    // de servir en la misma transacción que lo concede.
    await deleteAccessGrantsFor(ctx.tx, member.id);
    await ctx.audit({
      action: "permission.granted",
      entityType: "permission",
      entityId: row.id,
      after: { personId: member.id, code: input.code, committeeId: input.committeeId ?? null },
    });
    await ctx.emit(
      eventOf(permissionGranted, {
        actorId: ctx.actor.personId,
        personId: member.id,
        code: input.code,
        committeeId: input.committeeId ?? null,
      }),
    );
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(t("T-268"), "email");
    }
    throw error;
  }
}

/** Para las acciones de página (src/app) que otorgan un permiso fuera del kit: abre su transacción. */
export function grantPermissionAs(actor: Actor, input: PermissionInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => grantPermission(ctx, input));
}

/** No se puede retirar el último ADMIN (05-acceso.md). */
export async function revokePermission(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx.select().from(permission).where(eq(permission.id, id));
  if (!row) {
    return;
  }
  if (row.code === "ADMIN") {
    const [admins] = await ctx.tx
      .select({ n: count() })
      .from(permission)
      .where(eq(permission.code, "ADMIN"));
    if ((admins?.n ?? 0) <= 1) {
      throw new DomainError(t("T-266"));
    }
  }
  await ctx.tx.delete(permission).where(eq(permission.id, id));
  await ctx.audit({
    action: "permission.revoked",
    entityType: "permission",
    entityId: id,
    before: row,
  });
  await ctx.emit(
    eventOf(permissionRevoked, {
      actorId: ctx.actor.personId,
      personId: row.personId,
      code: row.code,
      committeeId: row.committeeId,
    }),
  );
}

/**
 * Revoca todos los permisos de una persona que sale de la OE (ADR-034). Si es el último ADMIN, ese
 * permiso se conserva y se avisa: la regla de 05-acceso.md pesa más que la salida.
 */
export async function revokeAllPermissionsFor(
  ctx: CommandContext,
  personId: string,
): Promise<{ revoked: number; keptLastAdmin: boolean }> {
  const rows = await ctx.tx.select().from(permission).where(eq(permission.personId, personId));
  let keptLastAdmin = false;
  let revoked = 0;
  for (const row of rows) {
    if (row.code === "ADMIN") {
      const [admins] = await ctx.tx
        .select({ n: count() })
        .from(permission)
        .where(eq(permission.code, "ADMIN"));
      if ((admins?.n ?? 0) <= 1) {
        keptLastAdmin = true;
        continue;
      }
    }
    await ctx.tx.delete(permission).where(eq(permission.id, row.id));
    await ctx.audit({
      action: "permission.revoked",
      entityType: "permission",
      entityId: row.id,
      before: row,
    });
    await ctx.emit(
      eventOf(permissionRevoked, {
        actorId: ctx.actor.personId,
        personId,
        code: row.code,
        committeeId: row.committeeId,
      }),
    );
    revoked += 1;
  }
  return { revoked, keptLastAdmin };
}
