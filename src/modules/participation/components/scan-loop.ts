// Lo que el lector del carnet hace sin tocar el DOM (ADR-035 regla 8): el sondeo, el envío de una lectura,
// la lectura de una foto y el arranque de la cámara.

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

export type PhotoScan = { kind: "token"; token: string } | { kind: "error"; message: string };

/**
 * Lee el carnet de una foto (ADR-120 regla 15). `decode` abre la imagen y busca el QR: responde el token,
 * o `null` si la foto no trae ninguno. Si el navegador no puede abrirla (un HEIC en Chrome, un archivo
 * dañado), `decode` rechaza y el lector responde un error con su texto en vez de quedarse callado. Nunca
 * rechaza: quien llama siempre tiene un estado que pintar.
 */
export async function readPhoto(
  decode: () => Promise<string | null>,
  messages: { unreadable: string; noCode: string },
): Promise<PhotoScan> {
  let token: string | null;
  try {
    token = await decode();
  } catch {
    return { kind: "error", message: messages.unreadable };
  }
  return token ? { kind: "token", token } : { kind: "error", message: messages.noCode };
}

/**
 * Un arranque de la cámara a la vez (ADR-120 regla 15). Mientras `task` no termine, porque el navegador
 * sigue pidiendo el permiso, otro toque no arranca nada y responde `false`: no se pide un segundo flujo
 * de video, que pisaría la referencia del primero y lo dejaría encendido. Al terminar, también si falló,
 * vuelve a dejar pasar.
 */
export function createStartGate(): (task: () => Promise<void>) => Promise<boolean> {
  let starting = false;
  return async (task) => {
    if (starting) {
      return false;
    }
    starting = true;
    try {
      await task();
      return true;
    } finally {
      starting = false;
    }
  };
}
