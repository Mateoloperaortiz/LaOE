import { ForbiddenError } from "@/modules/identity";
import { WalletError, type WalletFailureReason } from "@/shared/adapters/wallet-error";
import { DomainError } from "@/shared/lib/errors";
import { errorCode } from "@/shared/log";

type WalletFailure =
  | { reason: WalletFailureReason; status?: number }
  | { reason: "UNEXPECTED"; errorType: string; errorCode?: string | number };

/** Un código de error y el nombre de una clase son identificadores. Otra cosa no se escribe. */
const IDENTIFIER = /^[A-Za-z0-9_]{1,40}$/;

/** La clase del error, como la escribe el registro en `err.type`. */
function className(error: Error): string {
  const name: unknown = (error.constructor as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && IDENTIFIER.test(name) ? name : "Error";
}

/**
 * Lo que es seguro registrar de un carnet que no se pudo emitir, o `null` si no fue un fallo: el
 * dominio dijo que a esa persona no se le emite. Lo dice de dos maneras: la reserva de la credencial
 * rechaza con `ForbiddenError` a quien no participa (de baja, en licencia, anonimizada), y leer el
 * carnet rechaza con `DomainError` a quien no tiene uno vigente.
 *
 * De un error de billetera sale su motivo y, si el proveedor respondió, su estado. De cualquier otro,
 * la clase del error y su código o el de su causa (`57P01` de la base, `ECONNREFUSED` de la red).
 * Nunca el mensaje ni la traza: los de un error que no escribió la casa pueden traer el token del QR
 * o el enlace firmado (ADR-120 regla 13).
 */
export function walletFailure(error: unknown): WalletFailure | null {
  if (error instanceof DomainError || error instanceof ForbiddenError) {
    return null;
  }
  if (error instanceof WalletError) {
    return error.status === undefined
      ? { reason: error.reason }
      : { reason: error.reason, status: error.status };
  }
  if (!(error instanceof Error)) {
    return { reason: "UNEXPECTED", errorType: typeof error };
  }
  const errorType = className(error);
  const code = errorCode(error);
  const readable = typeof code === "number" || (typeof code === "string" && IDENTIFIER.test(code));
  return readable && code !== undefined
    ? { reason: "UNEXPECTED", errorType, errorCode: code }
    : { reason: "UNEXPECTED", errorType };
}
