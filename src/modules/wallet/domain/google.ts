import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent, type Tx } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { walletSync } from "@/domain-events/wallet";
import { getEnv } from "@/env";
import { getCarnetCredential, getOrCreateCarnetCredential } from "@/modules/identity";
import { getWalletMemberState } from "@/modules/people";
import {
  googleWalletRequest,
  isGoogleWalletConfigured,
  setGoogleWalletTransportForTests as setTransport,
  signSaveJwt,
} from "@/shared/adapters/google-wallet";
import { WalletError } from "@/shared/adapters/wallet-error";
import { walletPass } from "../schema";
import { loadCarnetData } from "./carnet-data";
import { issueError } from "./failure";
import {
  buildGoogleClass,
  buildGoogleObject,
  buildGoogleTombstone,
  buildSaveClaims,
  type CarnetData,
  googleIdentifiers,
} from "./pass-pure";
import { recordPassIssued } from "./passes";

let classMemo: { id: string; ready: Promise<void> } | undefined;

function googleConfig() {
  const env = getEnv();
  if (!env.GOOGLE_WALLET_ISSUER_ID || !env.GOOGLE_WALLET_SA_EMAIL || !isGoogleWalletConfigured()) {
    throw new WalletError("NOT_CONFIGURED", "Google Wallet no está configurado");
  }
  return {
    issuerId: env.GOOGLE_WALLET_ISSUER_ID,
    serviceAccountEmail: env.GOOGLE_WALLET_SA_EMAIL,
    classSuffix: env.GOOGLE_WALLET_CLASS_SUFFIX,
    appUrl: env.APP_URL,
  };
}

function accepted(status: number): void {
  if (status < 200 || status >= 300) {
    // Nunca incluir el cuerpo remoto: puede repetir nombre, QR o claves.
    throw new WalletError("PROVIDER_HTTP", `Google Wallet respondió HTTP ${status}`, status);
  }
}

/** Solo se memoiza una clase asegurada con éxito; las carreras POST admiten 409. */
export async function ensureGoogleClass(classId: string): Promise<void> {
  if (classMemo?.id === classId) {
    return classMemo.ready;
  }
  const ready = (async () => {
    const path = `/genericClass/${encodeURIComponent(classId)}`;
    const found = await googleWalletRequest("GET", path);
    if (found.status === 404) {
      const inserted = await googleWalletRequest(
        "POST",
        "/genericClass",
        buildGoogleClass(classId),
      );
      if (inserted.status !== 409) {
        accepted(inserted.status);
        return;
      }
    } else {
      accepted(found.status);
    }
    accepted((await googleWalletRequest("PATCH", path, buildGoogleClass(classId))).status);
  })();
  classMemo = { id: classId, ready };
  try {
    await ready;
  } catch (error) {
    if (classMemo?.ready === ready) classMemo = undefined;
    throw error;
  }
}

async function lockGoogle(tx: Tx, personId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wallet-google:${personId}`}))`);
}

async function currentSnapshot(tx: Tx, data: CarnetData): Promise<boolean> {
  const member = await getWalletMemberState(tx, data.personId);
  const credential = await getCarnetCredential(data.personId, tx);
  return Boolean(
    member &&
      !member.anonymizedAt &&
      (member.status === "ACTIVE" || member.status === "HONORARY") &&
      member.walletEpoch === data.walletEpoch &&
      credential?.walletEpoch === data.walletEpoch &&
      credential.revision === data.revision,
  );
}

async function resyncIfChanged(tx: Tx, data: CarnetData): Promise<boolean> {
  const current = await currentSnapshot(tx, data);
  if (!current) {
    await enqueueEvent(tx, eventOf(walletSync, { personId: data.personId }));
  }
  return current;
}

/** La reserva se confirma antes del primer REST, incluso antes de asegurar la clase. */
export async function issueGoogleSaveUrl(personId: string): Promise<string> {
  const config = googleConfig();
  const ids = googleIdentifiers(config.issuerId, config.classSuffix, personId);
  await getDb().transaction(async (tx) => {
    const credential = await getOrCreateCarnetCredential(tx, personId);
    await tx
      .insert(walletPass)
      .values({
        personId,
        platform: "GOOGLE",
        externalId: ids.id,
        walletEpoch: credential.walletEpoch,
        tokenRevision: credential.revision,
      })
      .onConflictDoNothing({ target: [walletPass.personId, walletPass.platform] });
  });
  const url = await getDb().transaction(async (tx) => {
    await lockGoogle(tx, personId);
    const data = await loadCarnetData(personId, tx);
    if (!(await currentSnapshot(tx, data))) return null;
    const [pass] = await tx
      .select()
      .from(walletPass)
      .where(and(eq(walletPass.personId, personId), eq(walletPass.platform, "GOOGLE")));
    if (!pass || pass.externalId !== ids.id) {
      // Cambiar emisor/sufijo con pases existentes requiere conservar y migrar los IDs anteriores.
      throw issueError(
        "PASS_MISMATCH",
        "La configuración de Google Wallet no coincide con el pase registrado",
      );
    }
    await ensureGoogleClass(ids.classId);
    const path = `/genericObject/${encodeURIComponent(ids.id)}`;
    const object = buildGoogleObject(data, { ...ids, appUrl: config.appUrl });
    const existing = await googleWalletRequest("GET", path);
    if (existing.status === 404) {
      const inserted = await googleWalletRequest("POST", "/genericObject", object);
      if (inserted.status === 409) {
        accepted((await googleWalletRequest("PUT", path, object)).status);
      } else accepted(inserted.status);
    } else {
      accepted(existing.status);
      accepted((await googleWalletRequest("PUT", path, object)).status);
    }
    await recordPassIssued(tx, "GOOGLE", ids.id, data);
    if (!(await resyncIfChanged(tx, data))) return null;
    const jwt = signSaveJwt(buildSaveClaims({ ...ids, ...config }));
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;
    if (saveUrl.length > 1800)
      throw issueError("LINK_TOO_LONG", "El enlace de Google Wallet supera el tamaño admitido");
    return saveUrl;
  });
  if (!url) {
    throw issueError(
      "CHANGED_DURING_ISSUE",
      "El carnet cambió durante la emisión; volvé a intentarlo",
    );
  }
  return url;
}

/** Serializa el REST; las rotaciones y bajas usan otro lock y no esperan a la red. */
export async function refreshGooglePass(personId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await lockGoogle(tx, personId);
    const [pass] = await tx
      .select()
      .from(walletPass)
      .where(and(eq(walletPass.personId, personId), eq(walletPass.platform, "GOOGLE")));
    if (!pass) return;
    const member = await getWalletMemberState(tx, personId);
    const anonymous = !member || member.anonymizedAt !== null;
    const expired =
      !member || member.status === "INACTIVE" || pass.walletEpoch !== member.walletEpoch;
    if (!anonymous && pass.revokedAt) return;
    if (!isGoogleWalletConfigured())
      throw new WalletError(
        "NOT_CONFIGURED",
        "Sin credenciales para sincronizar un pase Google existente",
      );
    const path = `/genericObject/${encodeURIComponent(pass.externalId)}`;
    const classId = pass.externalId.slice(0, pass.externalId.lastIndexOf("."));
    if (anonymous) {
      const result = await googleWalletRequest(
        "PUT",
        path,
        buildGoogleTombstone(pass.externalId, classId),
      );
      if (result.status !== 404) accepted(result.status);
      await tx.delete(walletPass).where(eq(walletPass.id, pass.id));
      return;
    }
    if (expired) {
      const result = await googleWalletRequest("PATCH", path, { state: "EXPIRED" });
      if (result.status !== 404) accepted(result.status);
      await tx.update(walletPass).set({ revokedAt: new Date() }).where(eq(walletPass.id, pass.id));
      return;
    }
    const credential = await getCarnetCredential(personId, tx);
    if (!credential || credential.walletEpoch !== member.walletEpoch) {
      const result = await googleWalletRequest("PATCH", path, { state: "EXPIRED" });
      if (result.status !== 404) accepted(result.status);
      await tx.update(walletPass).set({ revokedAt: new Date() }).where(eq(walletPass.id, pass.id));
      return;
    }
    const data = await loadCarnetData(personId, tx);
    const result = await googleWalletRequest(
      "PUT",
      path,
      buildGoogleObject(data, {
        id: pass.externalId,
        classId,
        appUrl: getEnv().APP_URL,
      }),
    );
    if (result.status === 404) {
      await tx.update(walletPass).set({ revokedAt: new Date() }).where(eq(walletPass.id, pass.id));
      return;
    }
    accepted(result.status);
    const now = new Date();
    await tx
      .update(walletPass)
      .set({
        walletEpoch: data.walletEpoch,
        tokenRevision: data.revision,
        renderedTermId: data.term?.id ?? null,
        lastRefreshedAt: now,
        // Una reserva se confirma al comprobar que el objeto remoto existe; no se recrea si falta.
        ...(pass.issuedAt ? {} : { issuedAt: now, lastIssuedAt: now }),
      })
      .where(eq(walletPass.id, pass.id));
    // ON_LEAVE conserva el pase, pero el anfitrión sigue rechazando su check-in.
    const latest = await getWalletMemberState(tx, personId);
    const token = await getCarnetCredential(personId, tx);
    if (
      !latest ||
      latest.anonymizedAt ||
      latest.status === "INACTIVE" ||
      latest.walletEpoch !== data.walletEpoch ||
      token?.revision !== data.revision ||
      token.walletEpoch !== data.walletEpoch
    ) {
      await enqueueEvent(tx, eventOf(walletSync, { personId }));
    }
  });
}

/** Intercepta OAuth y REST; restablece también el memo de clase. */
export function setGoogleWalletTransportForTests(
  transport?: Parameters<typeof setTransport>[0],
): void {
  classMemo = undefined;
  setTransport(transport);
}
