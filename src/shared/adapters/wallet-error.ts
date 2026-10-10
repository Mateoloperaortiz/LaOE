/** Por qué no se pudo emitir o sincronizar un pase de billetera: el motivo, sin datos. */
export type WalletFailureReason =
  /** Faltan las credenciales o los identificadores del emisor. */
  | "NOT_CONFIGURED"
  /** La llave o el certificado no firmaron: la credencial está mal cargada. */
  | "SIGNING_FAILED"
  /** El proveedor no respondió: venció el plazo o falló la red. */
  | "PROVIDER_UNREACHABLE"
  /** El proveedor no dio la autorización: respondió un error, que va en `status`, o algo que no es un token. */
  | "PROVIDER_AUTH"
  /** El proveedor respondió a la operación un estado que no es de éxito; va en `status`. */
  | "PROVIDER_HTTP"
  /** El proveedor respondió con éxito algo que no se pudo leer. */
  | "PROVIDER_RESPONSE"
  /** El pase registrado no es del emisor o del sufijo configurados hoy. */
  | "PASS_MISMATCH"
  /** El enlace de guardado supera el tamaño admitido. */
  | "LINK_TOO_LONG"
  /** La membresía o el QR cambiaron mientras se emitía: la persona vuelve a intentar. */
  | "CHANGED_DURING_ISSUE";

/**
 * El error de un adaptador de billetera y del dominio que lo usa. El mensaje lo escribe la casa, sin
 * nada de lo que respondió el proveedor, y es para quien depura con el error en la mano; lo que una
 * ruta registra es `reason` y, si el proveedor respondió, `status` (ADR-120 regla 13).
 */
export class WalletError extends Error {
  readonly reason: WalletFailureReason;
  readonly status: number | undefined;

  constructor(reason: WalletFailureReason, message: string, status?: number) {
    super(message);
    this.name = "WalletError";
    this.reason = reason;
    this.status = status;
  }
}
