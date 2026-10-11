import { ForbiddenError } from "@/modules/identity";
import { type WalletAdapterFailureReason, WalletError } from "@/shared/adapters/wallet-error";
import { DomainError } from "@/shared/lib/errors";
import { errorCode } from "@/shared/log";

/**
 * Por qué no se pudo emitir o sincronizar un pase: los motivos del adaptador y los que solo conoce la
 * emisión, que se declaran acá y no en el adaptador compartido (ADR-123 regla 24).
 */
export type WalletFailureReason =
  | WalletAdapterFailureReason
  /** El pase registrado no es del emisor o del sufijo configurados hoy. */
  | "PASS_MISMATCH"
  /** El enlace de guardado supera el tamaño admitido. */
  | "LINK_TOO_LONG"
  /** La membresía o el QR cambiaron mientras se emitía: la persona vuelve a intentar. */
  | "CHANGED_DURING_ISSUE";

type WalletFailure =
  | { reason: WalletFailureReason; status?: number }
  | { reason: "UNEXPECTED"; errorType: string; errorCode?: string | number };

/** No fue un fallo: el dominio dijo que a esa persona no se le emite, con esa clase de error. */
interface WalletRefusal {
  reason: "REFUSED";
  errorType: "DomainError" | "ForbiddenError";
}

/** Un código de error y el nombre de una clase son identificadores. Otra cosa no se escribe. */
const IDENTIFIER = /^[A-Za-z0-9_]{1,40}$/;

/** La clase del error, como la escribe el registro en `err.type`. */
function className(error: Error): string {
  const name: unknown = (error.constructor as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && IDENTIFIER.test(name) ? name : "Error";
}

/**
 * Lo que es seguro registrar de un carnet que no se pudo emitir, o `REFUSED` si no fue un fallo: el
 * dominio dijo que a esa persona no se le emite. Lo dice de dos maneras: la reserva de la credencial
 * rechaza con `ForbiddenError` a quien no participa (de baja, en licencia, anonimizada), y leer el
 * carnet rechaza con `DomainError` a quien no tiene uno vigente. Con cuál de las dos lo dijo sale en
 * `errorType`, escrito acá y no leído del error: un `DomainError` de otro punto de la emisión se
 * distingue así de quien no participa.
 *
 * De un error de billetera sale su motivo y, si el proveedor respondió, su estado. De cualquier otro,
 * la clase del error y su código o el de su causa (`57P01` de la base, `ECONNREFUSED` de la red).
 * Nunca el mensaje ni la traza: los de un error que no escribió la casa pueden traer el token del QR
 * o el enlace firmado (ADR-120 regla 13).
 */
export function walletFailure(error: unknown): WalletFailure | WalletRefusal {
  if (error instanceof ForbiddenError) {
    return { reason: "REFUSED", errorType: "ForbiddenError" };
  }
  if (error instanceof DomainError) {
    return { reason: "REFUSED", errorType: "DomainError" };
  }
  if (error instanceof WalletError) {
    // Un `WalletError` lo lanza un adaptador o la emisión: su motivo es de la unión del módulo.
    const { reason, status } = error as WalletError<WalletFailureReason>;
    return status === undefined ? { reason } : { reason, status };
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
