// Qué muestra como vigente la consola en vivo, sin tocar el DOM (ADR-035 regla 16 y ADR-122 regla
// 14). El QR y el código rotativo valen mientras la casa los siga confirmando: lo decide cómo
// terminó el último sondeo.

/** Cómo terminó un sondeo: la casa respondió bien, respondió con error o no hubo respuesta. */
export type PollOutcome = "fresh" | "rejected" | "unreachable";

/** Lo último que la consola sabe de la casa. */
export type LiveStatus = "live" | "rejected" | "unreachable";

/**
 * Un rechazo (sesión vencida o revocada, permiso retirado, ocasión borrada, fallo de la casa) se
 * queda hasta que un sondeo responda bien: quedarse sin red después no lo borra.
 */
export function afterPoll(previous: LiveStatus, outcome: PollOutcome): LiveStatus {
  if (outcome === "fresh") return "live";
  if (outcome === "rejected" || previous === "rejected") return "rejected";
  return "unreachable";
}

/**
 * ¿El QR y el código se muestran como vigentes? Tras un rechazo, no. Sin respuesta, el código vale
 * lo que le quede a su cuenta; sin código rotativo el QR no cambia, y el siguiente sondeo lo
 * intenta de nuevo, como antes.
 */
export function showsAsCurrent(status: LiveStatus, code: { secondsLeft: number } | null): boolean {
  if (status === "live") return true;
  if (status === "rejected") return false;
  return code === null || code.secondsLeft > 0;
}
