import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "@/shared/lib/timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("entrega el resultado si el trabajo termina a tiempo y no deja el temporizador vivo", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve("listo"), 1_000, "Prueba")).resolves.toBe("listo");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rechaza con TimeoutError cuando el trabajo no vuelve", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 1_000, "Prueba");
    const assertion = expect(pending).rejects.toEqual(new TimeoutError("Prueba", 1_000));
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it("propaga el error propio del trabajo", async () => {
    await expect(withTimeout(Promise.reject(new Error("falló")), 1_000, "Prueba")).rejects.toThrow(
      "falló",
    );
  });

  it("con 0 no limita", async () => {
    vi.useFakeTimers();
    const work = new Promise<string>((resolve) => setTimeout(() => resolve("tarde"), 60_000));
    const pending = withTimeout(work, 0, "Prueba");
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toBe("tarde");
  });
});
