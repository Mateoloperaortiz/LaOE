/**
 * Por qué un adaptador de billetera no pudo firmar o hablar con el proveedor: el motivo, sin datos.
 * Acá van solo los que lanza un adaptador; los que solo conoce la emisión los declara el módulo
 * `wallet`, que amplía esta unión (`WalletFailureReason`, ADR-123 regla 24).
 */
export type WalletAdapterFailureReason =
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
  | "PROVIDER_RESPONSE";

/**
 * El error de un adaptador de billetera y del dominio que lo usa. El mensaje lo escribe la casa, sin
 * nada de lo que respondió el proveedor, y es para quien depura con el error en la mano; lo que una
 * ruta registra es `reason` y, si el proveedor respondió, `status` (ADR-120 regla 13).
 *
 * Sin más, el motivo es uno del adaptador, y no se infiere de lo que se escriba. El módulo `wallet`
 * lanza los suyos por su fábrica (`issueError`), que es quien le nombra a la clase la unión del
 * módulo. El tipo no impide nombrarle otra: `shared` no conoce la del módulo, así que no la puede
 * acotar (ADR-123 regla 24).
 */
export class WalletError<Reason extends string = WalletAdapterFailureReason> extends Error {
  readonly reason: Reason;
  readonly status: number | undefined;

  constructor(reason: NoInfer<Reason>, message: string, status?: number) {
    super(message);
    this.name = "WalletError";
    this.reason = reason;
    this.status = status;
  }
}
