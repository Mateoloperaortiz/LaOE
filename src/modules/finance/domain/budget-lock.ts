import { and, eq } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { scopeId } from "@/shared/lib/scope-id";
import { committeeBudget } from "../schema";

/** Serializa todas las operaciones del presupuesto. En el área de comité, el alcance va en la consulta. */
export async function lockBudget(ctx: CommandContext, id: string, scope?: { committeeId: string }) {
  const committeeId = scope === undefined ? undefined : scopeId(scope, "committeeId");
  if (committeeId === null) throw new DomainError(t("T-032"));
  const [budget] = await ctx.tx
    .select()
    .from(committeeBudget)
    .where(
      and(
        eq(committeeBudget.id, id),
        committeeId === undefined ? undefined : eq(committeeBudget.committeeId, committeeId),
      ),
    )
    .for("update");
  if (!budget) throw new DomainError(t("T-032"));
  return budget;
}
