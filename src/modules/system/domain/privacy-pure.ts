/** Una versión de prueba o aprobada es explícita; el marcador inicial nunca autoriza aceptaciones. */
export function isPrivacyPolicyReady(version: unknown): version is string {
  return (
    typeof version === "string" &&
    version.trim() !== "" &&
    version.trim().toLowerCase() !== "pendiente"
  );
}
