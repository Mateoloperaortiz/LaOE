import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Actor, CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { appConfig } from "../schema";
import { writeConfig } from "./config";
import { isPrivacyPolicyReady, privacyPolicyVersionSchema } from "./privacy-pure";

/** La acción administrativa resuelve ADMIN/step-up y publicación; system solo guarda y audita. */
export async function setPrivacyPolicyVersionAs(actor: Actor, value: unknown): Promise<void> {
  const version = privacyPolicyVersionSchema.parse(value);
  await writeConfig(actor, "privacy.policyVersion", version);
}

export class PrivacyPolicyPendingError extends DomainError {
  constructor(audience: "public" | "admin" = "public") {
    super(t(audience === "admin" ? "T-1179" : "T-1178"));
    this.name = "PrivacyPolicyPendingError";
  }
}

/** Lectura fresca para la UI: cambiar la versión no espera la caché general de configuración. */
export async function getPrivacyPolicyState(): Promise<{ ready: boolean; version: string | null }> {
  const [row] = await getDb()
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "privacy.policyVersion"));
  const version = typeof row?.value === "string" ? row.value : null;
  return { ready: isPrivacyPolicyReady(version), version };
}

/** ADR-039: comprueba y fija la versión hasta que termine la transacción que guarda la aceptación. */
export async function requirePrivacyPolicyVersion(
  ctx: CommandContext,
  audience: "public" | "admin" = "public",
): Promise<string> {
  const [row] = await ctx.tx
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, "privacy.policyVersion"))
    .for("share");
  if (!isPrivacyPolicyReady(row?.value)) {
    throw new PrivacyPolicyPendingError(audience);
  }
  return row.value;
}
