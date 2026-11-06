import type { PermanenceConfig } from "./permanence-pure";

/** Estatutos art. 7.5, ADR-157. La vigencia sigue el código, no fechas editables. */
export function probationMarginsForTerm(
  termCode: string | undefined,
  configured: PermanenceConfig["probationMargins"],
  current: PermanenceConfig["probationMargins"],
): PermanenceConfig["probationMargins"] {
  // Sin término, las lecturas de configuración muestran la política vigente.
  // Los términos anteriores conservan su banda; los cerrados se leen de su foto.
  return { ...(termCode && termCode < "2026-2" ? configured : current) };
}
