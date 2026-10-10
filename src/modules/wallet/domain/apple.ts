import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { getOrCreateCarnetCredential } from "@/modules/identity";
import { getWalletMemberState, lockWalletMember } from "@/modules/people";
import { isApplePassConfigured, signPass } from "@/shared/adapters/apple-pass";
import { WalletError } from "@/shared/adapters/wallet-error";
import { loadCarnetData } from "./carnet-data";
import { buildApplePassJson } from "./pass-pure";
import { recordPassIssued } from "./passes";

let assets: Promise<Record<string, Buffer>> | undefined;
function appleAssets(): Promise<Record<string, Buffer>> {
  assets ??= (async () => {
    const names = [
      "icon.png",
      "icon@2x.png",
      "icon@3x.png",
      "logo.png",
      "logo@2x.png",
      "logo@3x.png",
    ];
    return Object.fromEntries(
      await Promise.all(
        names.map(
          async (name) =>
            [name, await readFile(join(process.cwd(), "src/modules/wallet/assets", name))] as const,
        ),
      ),
    );
  })().catch((error) => {
    assets = undefined;
    throw error;
  });
  return assets;
}

export async function buildApplePass(personId: string): Promise<Buffer> {
  const env = getEnv();
  if (!isApplePassConfigured() || !env.APPLE_PASS_TYPE_ID || !env.APPLE_TEAM_ID) {
    throw new WalletError("NOT_CONFIGURED", "Apple Wallet no está configurado");
  }
  const data = await getDb().transaction(async (tx) => {
    await getOrCreateCarnetCredential(tx, personId);
    return loadCarnetData(personId, tx);
  });
  const bytes = await signPass({
    files: await appleAssets(),
    props: buildApplePassJson(data, {
      passTypeIdentifier: env.APPLE_PASS_TYPE_ID,
      teamIdentifier: env.APPLE_TEAM_ID,
      appUrl: env.APP_URL,
    }),
  });
  // La firma no sostiene el lock de membresía; si cambió la persona, no se entrega el pase viejo.
  await getDb().transaction(async (tx) => {
    await lockWalletMember(tx, personId);
    const state = await getWalletMemberState(tx, personId);
    if (
      !state ||
      state.anonymizedAt ||
      state.status === "INACTIVE" ||
      state.status === "ON_LEAVE" ||
      state.walletEpoch !== data.walletEpoch
    )
      throw new WalletError("CHANGED_DURING_ISSUE", "La membresía cambió durante la emisión");
    const current = await loadCarnetData(personId, tx);
    if (current.revision !== data.revision) {
      throw new WalletError("CHANGED_DURING_ISSUE", "El QR cambió durante la emisión");
    }
    await recordPassIssued(tx, "APPLE", personId, data);
  });
  return bytes;
}
