import { getEnv } from "@/env";
import { type SignedCarnet, signCarnet } from "./carnet-pure";

// El carnet de la persona con sesión (ADR-034 regla 10): el secreto vive aquí, nunca en src/app.

export function issueCarnet(personId: string, now = new Date()): SignedCarnet {
  return signCarnet(personId, { secret: getEnv().SESSION_SECRET, now });
}
