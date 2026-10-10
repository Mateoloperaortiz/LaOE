import { type WalletPlatform, walletFailure } from "@/modules/wallet";
import { logger } from "@/shared/log";

/**
 * Deja en el registro por qué una ruta de billetera no entregó el carnet (ADR-120 regla 13). La
 * respuesta sale bien formada, una redirección de vuelta al carnet, así que Next no registra nada:
 * sin esta línea no se distingue Google caído de una credencial vencida o de un fallo de la base.
 *
 * Lleva la plataforma y lo que `walletFailure` dice que es seguro escribir: el motivo y, según el
 * caso, el estado que respondió el proveedor o la clase y el código del error. Nunca el mensaje.
 * Quien no tiene carnet no es un fallo y sale aparte, en `info`; un carnet que cambió mientras se
 * emitía avisa en `warn`, porque la persona vuelve a intentar y no hay nada que arreglar.
 */
export function logCarnetNotIssued(platform: WalletPlatform, error: unknown): void {
  const failure = walletFailure(error);
  if (!failure) {
    logger.info({ platform }, "carnet no emitido: la persona no tiene carnet vigente");
    return;
  }
  const level = failure.reason === "CHANGED_DURING_ISSUE" ? "warn" : "error";
  logger[level]({ platform, ...failure }, "no se pudo emitir el carnet");
}
