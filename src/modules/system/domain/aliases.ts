import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { legacyAlias } from "../schema";

// Alias legados (ADR-018, ADR-035 regla 3): /asamblea/{publicId} y los publicId retirados de GHPOINTS
// siguen resolviendo a la ocasión nueva.

export const ALIAS_PATH = /^\/(a|asamblea)\/[0-9a-z]{10}$/;

export type LegacyAliasRow = typeof legacyAlias.$inferSelect;

export async function resolveAlias(path: string): Promise<LegacyAliasRow | null> {
  const [row] = await getDb().select().from(legacyAlias).where(eq(legacyAlias.path, path)).limit(1);
  return row ?? null;
}

export async function createAlias(
  ctx: CommandContext,
  input: { path: string; targetId: string; targetType?: string },
): Promise<{ id: string }> {
  const path = input.path.trim();
  if (!ALIAS_PATH.test(path)) {
    throw new DomainError(t("T-661"), "path");
  }
  try {
    const [row] = await ctx.tx
      .insert(legacyAlias)
      .values({ path, targetId: input.targetId, targetType: input.targetType ?? "OCCASION" })
      .returning({ id: legacyAlias.id });
    if (!row) {
      throw new Error("No se pudo crear el alias");
    }
    await ctx.audit({
      action: "legacy-alias.created",
      entityType: "legacy_alias",
      entityId: row.id,
      after: { path, targetId: input.targetId },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error, "legacy_alias_path_unique")) {
      throw new DomainError(t("T-660"), "path");
    }
    throw error;
  }
}
