import { DrizzleQueryError } from "drizzle-orm/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/wallet/apple/route";
import { ForbiddenError } from "@/modules/identity/domain/errors";
import { safeNextPath } from "@/modules/identity/domain/pure";
import { WalletError } from "@/shared/adapters/wallet-error";
import { DomainError } from "@/shared/lib/errors";
import { captureLogs, type LoggedLine } from "../helpers/logs";

const state = vi.hoisted(() => ({
  available: vi.fn(),
  actor: vi.fn(),
  issue: vi.fn(),
}));
vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));
vi.mock("@/modules/identity", async () => ({
  getActor: state.actor,
  ForbiddenError: (await import("@/modules/identity/domain/errors")).ForbiddenError,
}));
// El registro es el de verdad: lo que se afirma es la línea que sale, ya serializada. Y lo que es
// seguro escribir lo decide el módulo, no la prueba (DT-228, ADR-120 regla 13).
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
  it("el registro dice por qué no se pudo emitir: el motivo y el estado que respondió el proveedor", async () => {
    const http = await failing(
      new WalletError("PROVIDER_HTTP", "respondió HTTP 503 oe2.secreto-de-prueba", 503),
    );
    const config = await failing(new WalletError("NOT_CONFIGURED", "no está configurado"));
    expect(http.lines[0]?.record).toMatchObject({
      level: 50,
      platform: "APPLE",
      reason: "PROVIDER_HTTP",
      status: 503,
    });
    expect(config.lines[0]?.record).toMatchObject({ level: 50, reason: "NOT_CONFIGURED" });
    expect(config.lines[0]?.record).not.toHaveProperty("status");
    for (const { line } of [...http.lines, ...config.lines]) {
      for (const written of ["secreto", "respondió", "no está configurado"]) {
        expect(line).not.toContain(written);
      }
    }
  });
  it("si lo que se cae es la base, la línea trae la clase del error y su código, sin la consulta ni sus valores", async () => {
    const down = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
    });
    const { lines } = await failing(
      new DrizzleQueryError("select 1 where $1", ["valor.privado@eafit.edu.co"], down),
    );
    expect(lines[0]?.record).toMatchObject({
      level: 50,
      reason: "UNEXPECTED",
      errorType: "DrizzleQueryError",
      errorCode: "57P01",
    });
    expect(lines[0]?.line).not.toContain("valor.privado");
    expect(lines[0]?.line).not.toContain("select");
  });
  it("un carnet que cambió mientras se emitía avisa sin nivel de fallo: la persona vuelve a intentar", async () => {
    const { response, lines } = await failing(
      new WalletError("CHANGED_DURING_ISSUE", "cambió durante la emisión"),
    );
    expect(response.headers.get("location")).toBe("/app/carnet?error=apple");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({ level: 40, reason: "CHANGED_DURING_ISSUE" });
  });
  it("el registro distingue a Google caído de una credencial que no sirve", async () => {
    const down = await failing(new WalletError("PROVIDER_UNREACHABLE", "no respondió"));
    const denied = await failing(new WalletError("PROVIDER_AUTH", "autorización HTTP 400", 400));
    const unsigned = await failing(new WalletError("SIGNING_FAILED", "no se pudo firmar"));
    expect(down.lines[0]?.record).toMatchObject({ level: 50, reason: "PROVIDER_UNREACHABLE" });
    expect(denied.lines[0]?.record).toMatchObject({
      level: 50,
      reason: "PROVIDER_AUTH",
      status: 400,
    });
    expect(unsigned.lines[0]?.record).toMatchObject({ level: 50, reason: "SIGNING_FAILED" });
  });
  it.each([
    ["no tiene carnet vigente", new DomainError("mensaje de dominio sintético"), "DomainError"],
    ["no participa", new ForbiddenError(), "ForbiddenError"],
  ])("quien %s vuelve al carnet y no deja una línea de fallo: la línea dice con qué clase lo dijo el dominio", async (_name, rejection, errorType) => {
    const { response, lines } = await failing(rejection);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/app/carnet?error=apple");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({ level: 30, platform: "APPLE", errorType });
    expect(lines[0]?.record.msg).not.toBe("no se pudo emitir el carnet");
    expect(lines[0]?.record).not.toHaveProperty("reason");
    expect(lines[0]?.line).not.toContain("sintético");
  });
});
