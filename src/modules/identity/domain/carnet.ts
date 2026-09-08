import { getEnv } from "@/env";
import { canParticipate, getMembershipRef } from "@/modules/people";
import {
  CARNET_TOKEN,
  type SignedCarnet,
  signCarnet,
  verifyCarnet,
  WALLET_CARNET_PREFIX,
} from "./carnet-pure";
import { resolveCarnetToken } from "./carnet-token";
import { ForbiddenError } from "./errors";

// El carnet de la persona con sesión (ADR-034 regla 10): el secreto vive aquí, nunca en src/app.

export async function issueCarnet(personId: string, now = new Date()): Promise<SignedCarnet> {
  const member = await getMembershipRef(personId);
  if (!canParticipate(member?.status)) throw new ForbiddenError();
  return signCarnet(personId, { secret: getEnv().SESSION_SECRET, now });
}

export type CarnetReading =
  | { ok: true; personId: string; expiresAt: Date | null; source: "APP" | "WALLET" }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" | "EXPIRED" | "REVOKED" };

/** Lee ambos QR: oe1 conserva su firma y vencimiento; oe2 se resuelve contra el estado vigente. */
export async function readCarnet(token: string, now = new Date()): Promise<CarnetReading> {
  if (token.startsWith(`${WALLET_CARNET_PREFIX}.`)) {
    if (!CARNET_TOKEN.test(token)) {
      return { ok: false, reason: "MALFORMED" };
    }
    const personId = await resolveCarnetToken(token, now);
    return personId
      ? { ok: true, personId, expiresAt: null, source: "WALLET" }
      : { ok: false, reason: "REVOKED" };
  }
  const result = verifyCarnet(token, { secret: getEnv().SESSION_SECRET, now });
  return result.ok ? { ...result, source: "APP" } : result;
}
