import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/wallet/google/route";

const state = vi.hoisted(() => ({
  available: vi.fn(),
  actor: vi.fn(),
  issue: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/modules/identity", () => ({ getActor: state.actor }));
vi.mock("@/modules/wallet", () => ({
  walletAvailability: state.available,
  issueGoogleSaveUrl: state.issue,
}));
vi.mock("@/shared/log", () => ({ logger: { warn: state.warn } }));

const request = () => new Request("https://mi.oe.test/api/wallet/google");
beforeEach(() => {
  vi.resetAllMocks();
  state.available.mockReturnValue({ apple: true, google: true });
  state.actor.mockResolvedValue({ personId: "persona-sintetica" });
});

describe("ruta Wallet google", () => {
  it("apagada devuelve 404 sin consultar sesión y sin caché", async () => {
    state.available.mockReturnValue({ apple: false, google: false });
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.actor).not.toHaveBeenCalled();
    expect(state.issue).not.toHaveBeenCalled();
  });
  it("sin sesión redirige al ingreso conservando el destino y sin caché", async () => {
    state.actor.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://mi.oe.test/ingresar?next=%2Fapi%2Fwallet%2Fgoogle",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.issue).not.toHaveBeenCalled();
  });
  it("entrega el resultado solo para la persona autenticada", async () => {
    state.issue.mockResolvedValue("https://pay.google.com/gp/v/save/jwt-sintetico");
    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://pay.google.com/gp/v/save/jwt-sintetico");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.issue).toHaveBeenCalledWith("persona-sintetica");
  });
  it("el fallo vuelve al carnet sin filtrar el error ni sus secretos al log", async () => {
    state.issue.mockRejectedValue(new Error("oe2.secreto-de-prueba"));
    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://mi.oe.test/app/carnet?error=google");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(state.warn.mock.calls)).not.toContain("secreto");
  });
});
