import { describe, expect, it } from "vitest";
import {
  dequeue,
  enqueueScan,
  OFFLINE_QUEUE_MAX,
  parseQueue,
} from "@/modules/participation/components/offline-queue";
import { sseComment, sseEvent, sseStream } from "@/shared/lib/sse";

// La ola 4: el flujo SSE (ADR-179) y la cola del registro sin señal (ADR-182).

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

describe("el flujo SSE", () => {
  it("un evento lleva su dato en JSON y el latido es un comentario", () => {
    expect(sseEvent({ n: 1 })).toBe('data: {"n":1}\n\n');
    expect(sseEvent({ n: 1 }, 3000)).toBe('retry: 3000\ndata: {"n":1}\n\n');
    expect(sseComment()).toBe(": latido\n\n");
  });

  it("manda solo lo que cambió, late mientras no cambia y se cierra al tope", async () => {
    let clock = 0;
    const states = [{ n: 1 }, { n: 1 }, { n: 1 }, { n: 2 }, { n: 2 }];
    let index = 0;
    const text = await drain(
      sseStream(
        new AbortController().signal,
        async () => states[Math.min(index++, states.length - 1)],
        {
          intervalMs: 10,
          heartbeatMs: 20,
          maxMs: 50,
          now: () => clock,
          sleep: async (ms) => {
            clock += ms;
          },
        },
      ),
    );
    expect(text.match(/^data: /gm)).toHaveLength(2);
    expect(text).toContain('data: {"n":1}');
    expect(text).toContain('data: {"n":2}');
    expect(text).toContain(": latido");
  });

  it("si la lectura falla, el flujo se cierra sin romper", async () => {
    const text = await drain(
      sseStream(new AbortController().signal, async () => {
        throw new Error("sin permiso");
      }),
    );
    expect(text).toBe("");
  });

  it("un pedido que se corta cierra el flujo", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await drain(sseStream(controller.signal, async () => ({ n: 1 })))).toBe("");
  });
});

describe("la cola sin señal", () => {
  it("el mismo carnet dos veces cuenta una y se quita al subir", () => {
    let queue = enqueueScan([], "oe1-a", 1);
    queue = enqueueScan(queue, "oe1-a", 2);
    queue = enqueueScan(queue, "oe1-b", 3);
    expect(queue.map((item) => item.token)).toEqual(["oe1-a", "oe1-b"]);
    expect(dequeue(queue, "oe1-a").map((item) => item.token)).toEqual(["oe1-b"]);
  });

  it("no pasa del tope y descarta lo que no tiene la forma esperada", () => {
    let queue = parseQueue(null);
    for (let index = 0; index < OFFLINE_QUEUE_MAX + 5; index += 1) {
      queue = enqueueScan(queue, `oe1-${index}`, index);
    }
    expect(queue).toHaveLength(OFFLINE_QUEUE_MAX);
    expect(parseQueue('[{"token":"oe1-x","at":1},{"token":""},"otra"]')).toEqual([
      { token: "oe1-x", at: 1 },
    ]);
    expect(parseQueue("{roto")).toEqual([]);
  });
});
