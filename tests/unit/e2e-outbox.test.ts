import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drain: vi.fn(), errors: vi.fn(), close: vi.fn() }));
vi.mock("@/jobs/handlers", () => ({}));
vi.mock("@/jobs/poller", () => ({ drain: mocks.drain }));
vi.mock("@/db/client", () => ({
  closeDb: mocks.close,
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.errors }) }) }),
}));

import { drenarOutbox } from "../e2e/outbox";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.errors.mockResolvedValue([]);
});

it("rechaza un fallo del lote aunque todavía no aparezca en la consulta de errores", async () => {
  mocks.drain.mockResolvedValue({ processed: 0, failed: 1 });
  await expect(drenarOutbox()).rejects.toThrow(/Falló el outbox E2E/);
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("denuncia también un trabajo viejo con error y reintento aplazado", async () => {
  mocks.drain.mockResolvedValue({ processed: 0, failed: 0 });
  mocks.errors.mockResolvedValue([{ type: "person.imported", error: "persona ausente" }]);
  await expect(drenarOutbox()).rejects.toThrow(/person.imported.*persona ausente/);
});

it("drena los eventos encadenados hasta vaciar lo disponible", async () => {
  mocks.drain
    .mockResolvedValueOnce({ processed: 1, failed: 0 })
    .mockResolvedValueOnce({ processed: 1, failed: 0 })
    .mockResolvedValueOnce({ processed: 0, failed: 0 });
  await drenarOutbox();
  expect(mocks.drain).toHaveBeenCalledTimes(3);
});
