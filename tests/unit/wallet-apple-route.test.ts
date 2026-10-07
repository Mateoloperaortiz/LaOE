import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/wallet/apple/route";
import { safeNextPath } from "@/modules/identity/domain/pure";

const state = vi.hoisted(() => ({
  available: vi.fn(),
  actor: vi.fn(),
  issue: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/modules/identity", () => ({ getActor: state.actor }));
vi.mock("@/modules/wallet", () => ({
  walletAvailability: state.available,
  buildApplePass: state.issue,
}));
vi.mock("@/shared/log", () => ({ logger: { warn: state.warn } }));

beforeEach(() => {
  vi.resetAllMocks();
  state.available.mockReturnValue({ apple: true, google: true });
  state.actor.mockResolvedValue({ personId: "persona-sintetica" });
});

describe("ruta Wallet apple", () => {
  it("apagada devuelve 404 sin consultar sesión y sin caché", async () => {
    state.available.mockReturnValue({ apple: false, google: false });
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.actor).not.toHaveBeenCalled();
    expect(state.issue).not.toHaveBeenCalled();
  });
  it("sin sesión manda al ingreso en el origen público y vuelve al carnet con la marca de descarga, sin caché", async () => {
    state.actor.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "http://sin-redireccion.invalid");
    expect(`${location.origin}${location.pathname}`).toBe("https://oe-sintetica.example/ingresar");
    const next = location.searchParams.get("next") ?? "";
    expect(next).toBe("/app/carnet?descarga=1");
    // El ingreso filtra su destino con `safeNextPath`: el carnet lo pasa; la ruta del pase no.
    expect(safeNextPath(next)).toBe(next);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.issue).not.toHaveBeenCalled();
  });
  it("entrega el resultado solo para la persona autenticada", async () => {
    state.issue.mockResolvedValue(Buffer.from("archivo-sintetico"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="carnet-oe.pkpass"',
    );
    expect(await response.text()).toBe("archivo-sintetico");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.issue).toHaveBeenCalledWith("persona-sintetica");
  });
  it("el fallo vuelve al carnet sin filtrar el error ni sus secretos al log", async () => {
    state.issue.mockRejectedValue(new Error("oe2.secreto-de-prueba"));
    const response = await GET();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app/carnet?error=apple");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(state.warn.mock.calls)).not.toContain("secreto");
  });
});
