import { getEnv } from "@/env";
import {
  type CarnetVerification,
  type SignedCarnet,
  signCarnet,
  verifyCarnet,
} from "./carnet-pure";

// El carnet de la persona con sesión (ADR-034 regla 10): el secreto vive aquí, nunca en src/app.

export function issueCarnet(personId: string, now = new Date()): SignedCarnet {
  return signCarnet(personId, { secret: getEnv().SESSION_SECRET, now });
}

/** Lee el QR del carnet en la consola anfitrión (fase 3): el secreto vive aquí, nunca en src/app. */
export function readCarnet(token: string, now = new Date()): CarnetVerification {
  return verifyCarnet(token, { secret: getEnv().SESSION_SECRET, now });
}
