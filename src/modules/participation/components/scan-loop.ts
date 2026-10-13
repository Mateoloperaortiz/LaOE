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
 *
 * Antes de responder apaga la cámara (`stopCamera`), traiga lo que traiga la foto, como una lectura la
 * apaga antes de mandarse. Un error pinta el botón de «Escanear» en vez del de «Detener»: con la cámara
 * encendida debajo, nadie la detiene y el sondeo sigue mandando lecturas.
 */
export async function readPhoto(
  decode: () => Promise<string | null>,
  messages: { unreadable: string; noCode: string },
  stopCamera: () => void,
): Promise<PhotoScan> {
  let photo: PhotoScan;
  try {
    const token = await decode();
    photo = token ? { kind: "token", token } : { kind: "error", message: messages.noCode };
  } catch {
    photo = { kind: "error", message: messages.unreadable };
  }
  stopCamera();
  return photo;
}

/**
 * Un arranque de la cámara a la vez (ADR-120 regla 15). Mientras `task` no termine, porque el navegador
 * sigue pidiendo el permiso, otro toque no arranca nada y responde `false`: no se pide un segundo flujo
 * de video, que pisaría la referencia del primero y lo dejaría encendido. Al terminar, también si falló,
 * vuelve a dejar pasar.
 *
 * El toque que pasa apaga primero lo que hubiera encendido (`stopCamera`): la guardia se abre apenas el
 * arranque termina, antes de que el botón cambie a «Detener», y un toque en ese instante abriría otra
 * cámara encima de la primera. El que no pasa no apaga nada: la cámara del primero está arrancando.
 */
export function createStartGate(): (
  task: () => Promise<void>,
  stopCamera: () => void,
) => Promise<boolean> {
  let starting = false;
  return async (task, stopCamera) => {
    if (starting) {
      return false;
    }
    starting = true;
    try {
      stopCamera();
      await task();
      return true;
    } finally {
      starting = false;
    }
  };
}

/** Lo que el lector necesita de un flujo de video para apagarlo. Lo cumple `MediaStream`. */
type VideoStream = { getTracks: () => { stop: () => void }[] };

export type CameraSteps<Stream> = {
  /**
   * Pide el flujo de video, como `getUserMedia`: espera a que la persona conteste el permiso y rechaza
   * si lo niega. `null` si el navegador no tiene cómo pedirlo.
   */
  open: (() => Promise<Stream>) | null;
  /** Engancha el flujo al video y lo pone a andar. `false` si no hay video donde engancharlo. */
  attach: (stream: Stream) => Promise<boolean>;
  /** Arranca el sondeo (`startScanLoop`) y devuelve cómo detenerlo. */
  poll: () => () => void;
  /** Pinta el estado del lector. */
  show: (state: ScanState) => void;
  /** El texto de la cámara que no se puede usar. */
  cameraError: string;
};

/**
 * La cámara del lector (ADR-127 regla 5): el flujo de video encendido y su sondeo. `start` pide el flujo,
 * lo engancha al video, pinta «Detener» y arranca el sondeo; `stop` apaga el sondeo y el flujo.
 *
 * `stop` cancela también el arranque que siga en vuelo. Pedir el flujo espera a que la persona conteste
 * el permiso, y mientras tanto el lector se puede detener: la pantalla se desmonta, o llega una foto, que
 * apaga la cámara antes de responder (ADR-120 regla 15). En ese momento todavía no hay flujo que apagar,
 * así que el arranque lo mira al volver de cada espera: el flujo que llega a un lector detenido se apaga
 * ahí mismo, sin engancharlo, sin pintar «Detener» y sin arrancar el sondeo. Si nadie lo apagara, quedaría
 * encendido sin un botón que lo detenga.
 *
 * Detener no deja la cámara inservible: cancela el arranque de ese momento, y el siguiente arranca como
 * siempre. El permiso que se niega pinta su error aunque el lector ya se haya detenido, como antes: qué
 * ve ahí el anfitrión espera la decisión abierta 76.
 *
 * `start` no se defiende de dos arranques en la misma tanda: el segundo pisaría el flujo guardado del
 * primero y lo dejaría encendido. Lo impide `createStartGate`, por donde pasa el único llamador.
 */
export function createCamera<Stream extends VideoStream>(): {
  start: (steps: CameraSteps<Stream>) => Promise<void>;
  stop: () => void;
} {
  let stream: Stream | null = null;
  let stopPoll: (() => void) | null = null;
  // Cada `stop` abre una tanda. El arranque guarda la suya al empezar y la compara al volver de una espera.
  let round = 0;

  function turnOff(toStop: Stream | null): void {
    for (const track of toStop?.getTracks() ?? []) {
      track.stop();
    }
  }

  function stop(): void {
    round += 1;
    stopPoll?.();
    stopPoll = null;
    turnOff(stream);
    stream = null;
  }

  async function start({ open, attach, poll, show, cameraError }: CameraSteps<Stream>) {
    const roundAtStart = round;
    const stoppedSince = () => roundAtStart !== round;
    if (!open) {
      show({ kind: "error", message: cameraError });
      return;
    }
    let opened: Stream;
    try {
      opened = await open();
    } catch {
      show({ kind: "error", message: cameraError });
      return;
    }
    if (stoppedSince()) {
      // Lo detuvieron mientras el navegador pedía el permiso: este flujo no llegó a guardarse.
      turnOff(opened);
      return;
    }
    stream = opened;
    const attached = await attach(opened);
    if (stoppedSince()) {
      // Lo detuvieron mientras el video arrancaba: `stop` ya apagó este flujo.
      return;
    }
    if (!attached) {
      stop();
      return;
    }
    show({ kind: "scanning" });
    stopPoll = poll();
  }

  return { start, stop };
}
