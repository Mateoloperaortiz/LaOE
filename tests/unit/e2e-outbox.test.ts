import { beforeEach, expect, it, vi } from "vitest";

// La semántica del drenado se prueba contra el poller real en tests/integration/outbox-drain.test.ts.
// Acá queda lo propio del envoltorio E2E: suelta la conexión siempre y no se traga el fallo.
const mocks = vi.hoisted(() => ({ drainOutbox: vi.fn(), close: vi.fn() }));
vi.mock("../helpers/outbox", () => ({ drainOutbox: mocks.drainOutbox }));
vi.mock("@/db/client", () => ({ closeDb: mocks.close }));
vi.mock("@/modules/system", () => ({ clearConfigCache: vi.fn() }));

import { drenarOutbox } from "../e2e/outbox";

beforeEach(() => {
  vi.resetAllMocks();
});

it("un fallo del outbox rompe el caso E2E y la conexión se cierra igual", async () => {
  mocks.drainOutbox.mockRejectedValue(new Error("Falló el outbox"));
  await expect(drenarOutbox()).rejects.toThrow(/Falló el outbox/);
  expect(mocks.close).toHaveBeenCalledOnce();
});

it("drena sin adelantar el reloj ni tolerar fallos, y cierra la conexión al terminar", async () => {
  mocks.drainOutbox.mockResolvedValue({ processed: 2, failed: 0 });
  await drenarOutbox();
  expect(mocks.drainOutbox).toHaveBeenCalledExactlyOnceWith();
  expect(mocks.close).toHaveBeenCalledOnce();
});
