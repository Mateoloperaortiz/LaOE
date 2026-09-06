import { z } from "zod";

/** Identificador administrativo; el marcador de bloqueo se guarda siempre igual. */
export const privacyPolicyVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .transform((value) => (value.toLowerCase() === "pendiente" ? "pendiente" : value));

/** Una versión de prueba o aprobada es explícita; el marcador inicial nunca autoriza aceptaciones. */
export function isPrivacyPolicyReady(version: unknown): version is string {
  return (
    typeof version === "string" &&
    version.trim() !== "" &&
    version.trim().toLowerCase() !== "pendiente"
  );
}
