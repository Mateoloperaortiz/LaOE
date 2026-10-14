import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/env", () => ({
  getEnv: () => ({
    S3_ENDPOINT: "http://synthetic.invalid",
    S3_REGION: "local",
    S3_BUCKET: "synthetic",
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: "synthetic",
    S3_SECRET_ACCESS_KEY: "synthetic",
  }),
}));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = mocks.send;
    },
  };
});

import { getObjectStream } from "@/shared/adapters/storage";

function storedStream(source: ReadableStream<Uint8Array>, byteSize = 3) {
  mocks.send.mockResolvedValue({
    Body: { transformToWebStream: () => source },
    ContentLength: byteSize,
  });
}

describe("stream privado de fotos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("cancela el bucket cuando el cuerpo se estanca después de recibir headers", async () => {
    const cancelled = vi.fn();
    storedStream(new ReadableStream({ cancel: cancelled }));
    const object = await getObjectStream("synthetic.webp", undefined, { inactivityTimeoutMs: 50 });
    if (!object) throw new Error("stream no creado");
    const read = object.body.getReader().read();
    const rejected = expect(read).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ name: "TimeoutError" }));
  });

  it("conserva abort de la petición después de recibir headers", async () => {
    const cancelled = vi.fn();
    const abort = new AbortController();
    storedStream(new ReadableStream({ cancel: cancelled }));
    const object = await getObjectStream("synthetic.webp", abort.signal);
    if (!object) throw new Error("stream no creado");
    const read = object.body.getReader().read();
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await rejected;
    expect(cancelled).toHaveBeenCalledWith(abort.signal.reason);
    expect(mocks.send).toHaveBeenCalledWith(expect.anything(), { abortSignal: abort.signal });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("entrega cada chunk sin copiar y respeta la pausa del consumidor", async () => {
    const chunks = [new Uint8Array([1]), new Uint8Array([2, 3])];
    const cancelled = vi.fn();
    let index = 0;
    storedStream(
      new ReadableStream(
        {
          pull(controller) {
            const chunk = chunks[index++];
            if (chunk) controller.enqueue(chunk);
            else controller.close();
          },
          cancel: cancelled,
        },
        { highWaterMark: 0 },
      ),
    );
    const object = await getObjectStream("synthetic.webp", undefined, { inactivityTimeoutMs: 50 });
    if (!object) throw new Error("stream no creado");
    const reader = object.body.getReader();
    expect((await reader.read()).value).toBe(chunks[0]);
    await vi.advanceTimersByTimeAsync(500);
    expect((await reader.read()).value).toBe(chunks[1]);
    expect(await reader.read()).toEqual({ value: undefined, done: true });
    expect(cancelled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(object.byteSize).toBe(3);
  });

  it("cancelar desde el consumidor corta la lectura S3 pendiente y limpia el plazo", async () => {
    const cancelled = vi.fn();
    storedStream(new ReadableStream({ cancel: cancelled }));
    const object = await getObjectStream("synthetic.webp", undefined, { inactivityTimeoutMs: 50 });
    if (!object) throw new Error("stream no creado");
    const reader = object.body.getReader();
    const read = reader.read();
    await reader.cancel("visor cerrado");
    expect(await read).toEqual({ value: undefined, done: true });
    expect(cancelled).toHaveBeenCalledWith("visor cerrado");
    expect(vi.getTimerCount()).toBe(0);
  });
});
