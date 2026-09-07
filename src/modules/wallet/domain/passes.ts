import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { isApplePassConfigured } from "@/shared/adapters/apple-pass";
import { isGoogleWalletConfigured } from "@/shared/adapters/google-wallet";
import { walletPass } from "../schema";
import type { CarnetData } from "./pass-pure";

export type WalletPassRecord = typeof walletPass.$inferSelect;
export type WalletPlatform = WalletPassRecord["platform"];

/** Fechas de emisión reflejan una respuesta construida, no instalación en el celular. */
export async function listPassesFor(
  personId: string,
  exec: Executor = getDb(),
): Promise<WalletPassRecord[]> {
  return exec
    .select()
    .from(walletPass)
    .where(eq(walletPass.personId, personId))
    .orderBy(asc(walletPass.platform));
}

export function walletAvailability() {
  return { apple: isApplePassConfigured(), google: isGoogleWalletConfigured() };
}

export async function recordPassIssued(
  exec: Executor,
  platform: WalletPlatform,
  externalId: string,
  data: CarnetData,
  now = new Date(),
): Promise<void> {
  const snapshot = {
    walletEpoch: data.walletEpoch,
    tokenRevision: data.revision,
    renderedTermId: data.term?.id ?? null,
  };
  const existing = (await listPassesFor(data.personId, exec)).find(
    (item) => item.platform === platform,
  );
  await exec
    .insert(walletPass)
    .values({
      personId: data.personId,
      platform,
      externalId,
      ...snapshot,
      issuedAt: now,
      lastIssuedAt: now,
    })
    .onConflictDoUpdate({
      target: [walletPass.personId, walletPass.platform],
      set: {
        ...snapshot,
        externalId,
        issuedAt: existing?.issuedAt ?? now,
        lastIssuedAt: now,
        revokedAt: null,
      },
    });
}
