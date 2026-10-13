import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/wallet/apple/route";
import { safeNextPath } from "@/modules/identity/domain/pure";
import { captureLogs, type LoggedLine } from "../helpers/logs";

const state = vi.hoisted(() => ({
  available: vi.fn(),
  actor: vi.fn(),
  issue: vi.fn(),
}));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/modules/identity", async () => {
  const { ForbiddenError } = await import("@/modules/identity/domain/errors");
  return { getActor: state.actor, ForbiddenError };
});
// El registro es el de verdad: lo que se afirma es la línea que sale, ya serializada. Y lo que es
// seguro escribir lo decide el módulo, no la prueba (DT-228, ADR-120 regla 13).
// Acá queda un solo caso de fallo, que dice que la ruta registra con su plataforma y vuelve al
// carnet: la matriz de lo que se registra según el error está en `wallet-not-issued.test.ts`.
vi.mock("@/modules/wallet", async () => ({
  walletAvailability: state.available,
  buildApplePass: state.issue,
  walletFailure: (await import("@/modules/wallet/domain/failure")).walletFailure,
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.available.mockReturnValue({ apple: true, google: true });
  state.actor.mockResolvedValue({ personId: "persona-sintetica" });
});

/** La emisión falla con `error`: la respuesta de la ruta y lo que dejó en el registro. */
async function failing(error: unknown): Promise<{ response: Response; lines: LoggedLine[] }> {
  state.issue.mockRejectedValue(error);
  const { result: response, lines } = await captureLogs(() => GET());
  return { response, lines };
}

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
    const { response, lines } = await failing(new Error("oe2.secreto-de-prueba"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app/carnet?error=apple");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({
      level: 50,
      msg: "no se pudo emitir el carnet",
      platform: "APPLE",
      reason: "UNEXPECTED",
      errorType: "Error",
    });
    expect(lines[0]?.line).not.toContain("secreto");
    expect(lines[0]?.line).not.toContain("oe2.");
  });
});
