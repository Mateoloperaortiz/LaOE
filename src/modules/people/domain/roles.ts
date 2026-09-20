import { asc, count, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committeeRole } from "../schema";
import { capabilitySchema, parseCapabilities } from "./capabilities";
import type { CommitteeRoleRow } from "./committee-memberships";

// Catálogo editable de cargos dentro del comité (ADR-029): sembrado por la migración 0001 y, desde
// ADR-058 (migración 0015), con cargos obligatorios y capacidades por cargo.

export const committeeRoleInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  label: z.string().trim().min(2).max(80),
  isLeadership: z.boolean().default(false),
  required: z.boolean().default(false),
  capabilities: z
    .array(capabilitySchema)
    .default([])
    .transform((values) => parseCapabilities(values)),
  sortOrder: z.coerce.number().int().min(0).max(999).default(50),
  /** Retirado del catálogo de comités (ADR-060 regla 4): no se ofrece al nombrar y el roster lo traduce. */
  retired: z.boolean().default(false),
  replacedByCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(40)
    .nullable()
    .default(null)
    .transform((value) => value || null),
});

export type CommitteeRoleInput = z.infer<typeof committeeRoleInputSchema>;

/** El reemplazo de un cargo retirado tiene que existir y ser otro cargo. */
async function assertReplacement(
  ctx: CommandContext,
  code: string,
  replacedByCode: string | null,
): Promise<void> {
  if (!replacedByCode) {
    return;
  }
  const [row] =
    replacedByCode === code
      ? []
      : await ctx.tx
          .select({ code: committeeRole.code })
          .from(committeeRole)
          .where(eq(committeeRole.code, replacedByCode));
  if (!row) {
    throw new DomainError(t("T-2211"), "replacedByCode");
  }
}

export async function listRoles(params: {
  q: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: CommitteeRoleRow[]; total: number }> {
  const where = params.q
    ? or(ilike(committeeRole.code, `%${params.q}%`), ilike(committeeRole.label, `%${params.q}%`))
    : undefined;
  const db = getDb();
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(committeeRole)
      .where(where)
      .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ n: count() }).from(committeeRole).where(where),
  ]);
  return { rows: rows.map((row) => ({ ...row, id: row.code })), total: total?.n ?? 0 };
}

export async function getRole(code: string): Promise<CommitteeRoleRow | null> {
  const [row] = await getDb()
    .select()
    .from(committeeRole)
    .where(eq(committeeRole.code, code))
    .limit(1);
  return row ? { ...row, id: row.code } : null;
}

export async function createCommitteeRole(
  ctx: CommandContext,
  input: CommitteeRoleInput,
): Promise<{ id: string }> {
  await assertReplacement(ctx, input.code, input.replacedByCode);
  try {
    await ctx.tx.insert(committeeRole).values(input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(t("T-474"), "code");
    }
    throw error;
  }
  await ctx.audit({
    action: "committee-role.created",
    entityType: "committee_role",
    entityId: input.code,
    after: input,
  });
  return { id: input.code };
}

/** El código no cambia: es la clave de las pertenencias. */
export async function updateCommitteeRole(
  ctx: CommandContext,
  code: string,
  input: CommitteeRoleInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(committeeRole).where(eq(committeeRole.code, code));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  await assertReplacement(ctx, code, input.replacedByCode);
  const values = {
    label: input.label,
    isLeadership: input.isLeadership,
    required: input.required,
    capabilities: input.capabilities,
    sortOrder: input.sortOrder,
    retired: input.retired,
    replacedByCode: input.replacedByCode,
  };
  await ctx.tx.update(committeeRole).set(values).where(eq(committeeRole.code, code));
  await ctx.audit({
    action: "committee-role.updated",
    entityType: "committee_role",
    entityId: code,
    before,
    after: values,
  });
}
