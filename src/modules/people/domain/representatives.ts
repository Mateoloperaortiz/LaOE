import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  committeeMembership,
  committeeRepresentative,
  committeeRole,
  committeeRoleAssignment,
  membership,
  person,
} from "../schema";

// Representación de los comités ante la Asamblea Directiva (Est. art. 16.2 y 33.3; Regl. art. 14;
// ADR-060 regla 7): un titular y un suplente por comité y término, miembros activos del comité. Quien
// tiene ROSTER en el comité (o ADMIN) los nombra; participation los lee para saber qué comités
// estuvieron representados en cada asamblea.

export const REPRESENTATIVE_ROLES = ["TITULAR", "SUPLENTE"] as const;
export type RepresentativeRole = (typeof REPRESENTATIVE_ROLES)[number];

export function representativeRoleLabel(role: RepresentativeRole): string {
  return tList("T-2246")[REPRESENTATIVE_ROLES.indexOf(role)] ?? role;
}

export const representativeInputSchema = z.object({
  committeeId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  role: z.enum(REPRESENTATIVE_ROLES),
  /** Sin persona, el rol queda vacío. */
  personId: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => value || null),
});

export type RepresentativeInput = z.input<typeof representativeInputSchema>;

export interface RepresentativeView {
  committeeId: string;
  termId: string;
  role: RepresentativeRole;
  personId: string;
  fullName: string;
}

/** Nombra (o vacía) un rol de representación; la persona debe ser miembro activo del comité en el término. */
export async function setRepresentative(
  ctx: CommandContext,
  raw: RepresentativeInput,
): Promise<void> {
  const input = representativeInputSchema.parse(raw);
  const [current] = await ctx.tx
    .select({ id: committeeRepresentative.id, personId: committeeRepresentative.personId })
    .from(committeeRepresentative)
    .where(
      and(
        eq(committeeRepresentative.committeeId, input.committeeId),
        eq(committeeRepresentative.termId, input.termId),
        eq(committeeRepresentative.role, input.role),
      ),
    );
  if ((current?.personId ?? null) === input.personId) {
    return;
  }
  if (input.personId) {
    const [eligible] = await ctx.tx
      .select({ id: committeeMembership.id })
      .from(committeeMembership)
      .innerJoin(membership, eq(membership.personId, committeeMembership.personId))
      .where(
        and(
          eq(committeeMembership.committeeId, input.committeeId),
          eq(committeeMembership.termId, input.termId),
          eq(committeeMembership.personId, input.personId),
          isNull(committeeMembership.leftAt),
          eq(membership.status, "ACTIVE"),
        ),
      );
    if (!eligible) {
      throw new DomainError(t("T-2255"), "personId");
    }
    // Una persona ocupa un solo rol: si era el otro, lo deja.
    await ctx.tx
      .delete(committeeRepresentative)
      .where(
        and(
          eq(committeeRepresentative.committeeId, input.committeeId),
          eq(committeeRepresentative.termId, input.termId),
          eq(committeeRepresentative.personId, input.personId),
        ),
      );
  }
  if (current) {
    await ctx.tx.delete(committeeRepresentative).where(eq(committeeRepresentative.id, current.id));
  }
  if (input.personId) {
    await ctx.tx.insert(committeeRepresentative).values({
      committeeId: input.committeeId,
      termId: input.termId,
      personId: input.personId,
      role: input.role,
    });
  }
  await ctx.audit({
    action: "committee-representative.set",
    entityType: "committee",
    entityId: input.committeeId,
    before: { termId: input.termId, role: input.role, personId: current?.personId ?? null },
    after: { termId: input.termId, role: input.role, personId: input.personId },
  });
}

/** Representantes de un término, opcionalmente de un solo comité, con nombre. */
export async function listRepresentatives(
  termId: string,
  committeeId?: string,
): Promise<RepresentativeView[]> {
  const rows = await getDb()
    .select({
      committeeId: committeeRepresentative.committeeId,
      termId: committeeRepresentative.termId,
      role: committeeRepresentative.role,
      personId: committeeRepresentative.personId,
      fullName: person.fullName,
    })
    .from(committeeRepresentative)
    .innerJoin(person, eq(person.id, committeeRepresentative.personId))
    .where(
      and(
        eq(committeeRepresentative.termId, termId),
        committeeId ? eq(committeeRepresentative.committeeId, committeeId) : undefined,
      ),
    );
  return rows.map((row) => ({ ...row, fullName: row.fullName ?? "" }));
}

export interface DirectionRef {
  committeeId: string;
  personId: string;
  roleCode: string;
  required: boolean;
}

/** Cargos de dirección vivos del término con membresía activa u honoraria: la mesa directiva de cada comité. */
export async function listLiveDirectionForTerm(termId: string): Promise<DirectionRef[]> {
  return getDb()
    .select({
      committeeId: committeeRoleAssignment.committeeId,
      personId: committeeRoleAssignment.personId,
      roleCode: committeeRoleAssignment.roleCode,
      required: committeeRole.required,
    })
    .from(committeeRoleAssignment)
    .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
    .innerJoin(membership, eq(membership.personId, committeeRoleAssignment.personId))
    .where(
      and(
        eq(committeeRoleAssignment.termId, termId),
        isNull(committeeRoleAssignment.endedAt),
        eq(committeeRole.isLeadership, true),
        inArray(membership.status, ["ACTIVE", "HONORARY"]),
      ),
    );
}
