// Lo que el lector del carnet hace sin tocar el DOM (ADR-035 regla 8): el sondeo y el envío de una lectura.

export type ScanResult = { ok: boolean; message: string };

export type ScanState =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "busy" }
  | { kind: "result"; ok: boolean; message: string }
  | { kind: "error"; message: string };

type ScanLoopOptions = {
  /** Lee un cuadro: el token del QR, o `null` si no hay ninguno. */
  read: () => Promise<string | null> | string | null;
  onToken: (token: string) => void;
  intervalMs: number;
};

/**
 * Sondeo del lector (ADR-118 regla 19). Una lectura a la vez: un tick no arranca mientras el anterior
 * sigue esperando al detector. Al primer token el sondeo se detiene solo y lo entrega una vez; lo que
 * termine de leerse después de detenerlo se descarta. Un cuadro que falla cuenta como cuadro sin código.
 * Devuelve cómo detenerlo.
 */
export function startScanLoop({ read, onToken, intervalMs }: ScanLoopOptions): () => void {
  let stopped = false;
  let reading = false;
  const timer = setInterval(async () => {
    if (reading) {
      return;
    }
    reading = true;
    let token: string | null = null;
    try {
      token = await read();
    } catch {
      token = null;
    } finally {
      reading = false;
    }
    if (!token || stopped) {
      return;
    }
    stop();
    onToken(token);
  }, intervalMs);
  function stop() {
    stopped = true;
    clearInterval(timer);
  }
  return stop;
}

/**
 * Manda una lectura (ADR-118 regla 19). Si la acción rechaza (se cayó la red, o el servidor lanzó algo
 * que no atrapó), el lector no se queda ocupado: responde un error con el texto del inventario, que no
 * deshabilita el botón de escanear. `rethrow` deja pasar las señales del framework, como la redirección
 * al ingreso de una sesión vencida.
 */
export async function sendScan(
  onScan: (token: string) => Promise<ScanResult>,
  token: string,
  failedMessage: string,
  rethrow: (error: unknown) => void,
): Promise<ScanState> {
  try {
    const result = await onScan(token);
    return { kind: "result", ok: result.ok, message: result.message };
  } catch (error) {
    rethrow(error);
    return { kind: "error", message: failedMessage };
  }
}
