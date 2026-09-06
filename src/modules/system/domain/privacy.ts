import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { appConfig } from "../schema";
import { isPrivacyPolicyReady } from "./privacy-pure";

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
