// La cola del registro sin señal (ADR-182): lo que el modo anfitrión escaneó sin red, guardado en el
// teléfono hasta que vuelva la conexión. Lógica pura, para probarla sin navegador.

export const OFFLINE_QUEUE_MAX = 300;

export interface QueuedScan {
  token: string;
  /** Cuándo se escaneó en el teléfono: solo para mostrarlo; la casa registra con su propia hora. */
  at: number;
}

/** Lee la cola guardada; lo que no tenga la forma esperada se descarta. */
export function parseQueue(raw: string | null): QueuedScan[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is QueuedScan =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as QueuedScan).token === "string" &&
        (item as QueuedScan).token.length > 0 &&
        typeof (item as QueuedScan).at === "number",
    );
  } catch {
    return [];
  }
}

/** Suma un escaneo: el mismo carnet dos veces cuenta una, y la cola no pasa del tope. */
export function enqueueScan(queue: QueuedScan[], token: string, at: number): QueuedScan[] {
  if (queue.some((item) => item.token === token)) return queue;
  return [...queue, { token, at }].slice(-OFFLINE_QUEUE_MAX);
}

/** Quita de la cola lo que ya subió. */
export function dequeue(queue: QueuedScan[], token: string): QueuedScan[] {
  return queue.filter((item) => item.token !== token);
}
