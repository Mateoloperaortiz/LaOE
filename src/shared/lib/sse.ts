// Tiempo real con Server-Sent Events (ADR-179): una respuesta `text/event-stream` que manda el estado
// cuando cambia, un latido para que nada intermedio la corte y un cierre a los pocos minutos para que el
// navegador reconecte con la sesión al día. Sin cola ni `LISTEN/NOTIFY` hasta medir (ADR-183): el flujo
// vuelve a leer en el servidor cada `intervalMs`.

export const SSE_HEARTBEAT_MS = 15_000;
export const SSE_MAX_MS = 5 * 60_000;
export const SSE_INTERVAL_MS = 2_000;

/** Un evento SSE con su dato en JSON; `retry` le dice al navegador cuánto esperar para reconectar. */
export function sseEvent(data: unknown, retryMs?: number): string {
  const retry = retryMs === undefined ? "" : `retry: ${retryMs}\n`;
  return `${retry}data: ${JSON.stringify(data)}\n\n`;
}

/** Un comentario SSE: el latido, que el navegador ignora pero mantiene viva la conexión. */
export function sseComment(text = "latido"): string {
  return `: ${text}\n\n`;
}

export interface SseOptions {
  intervalMs?: number;
  heartbeatMs?: number;
  maxMs?: number;
  /** Para pruebas: el reloj y la espera. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * El flujo de un estado que cambia: lo lee con `load`, lo manda si es distinto del último enviado, late
 * mientras no cambia y se cierra a los `maxMs` o cuando el pedido se corta. Si `load` falla, cierra el
 * flujo: el navegador reconecta y la ruta vuelve a exigir el permiso.
 */
export function sseStream(
  signal: AbortSignal,
  load: () => Promise<unknown>,
  options: SseOptions = {},
): ReadableStream<Uint8Array> {
  const intervalMs = options.intervalMs ?? SSE_INTERVAL_MS;
  const heartbeatMs = options.heartbeatMs ?? SSE_HEARTBEAT_MS;
  const maxMs = options.maxMs ?? SSE_MAX_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = now();
      let lastSent = "";
      let lastBeat = started;
      let first = true;
      try {
        while (!signal.aborted && now() - started < maxMs) {
          const json = JSON.stringify(await load());
          if (json !== lastSent) {
            controller.enqueue(
              encoder.encode(sseEvent(JSON.parse(json), first ? 3_000 : undefined)),
            );
            lastSent = json;
            lastBeat = now();
            first = false;
          } else if (now() - lastBeat >= heartbeatMs) {
            controller.enqueue(encoder.encode(sseComment()));
            lastBeat = now();
          }
          await sleep(intervalMs);
        }
      } catch {
        // Sin sesión, sin permiso o un fallo de la base: se cierra y el navegador reconecta.
      } finally {
        try {
          controller.close();
        } catch {
          // Ya cerrado porque la persona se fue.
        }
      }
    },
  });
}

/** La respuesta HTTP de un flujo SSE, sin caché ni compresión intermedia. */
export function sseResponse(
  request: Request,
  load: () => Promise<unknown>,
  options: SseOptions = {},
): Response {
  return new Response(sseStream(request.signal, load, options), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
