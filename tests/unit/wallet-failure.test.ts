import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/modules/identity/domain/errors";
import { walletFailure } from "@/modules/wallet/domain/failure";
import { WalletError } from "@/shared/adapters/wallet-error";
import { DomainError } from "@/shared/lib/errors";

// Lo que es seguro registrar de un carnet que no se pudo emitir (DT-228, ADR-120 regla 13). Que el
// dominio lance de verdad estas clases lo fijan `tests/integration/wallet-google.test.ts` y
// `tests/integration/wallet-apple.test.ts`; acá va solo la clasificación.
vi.mock("@/modules/identity", async () => ({
  ForbiddenError: (await import("@/modules/identity/domain/errors")).ForbiddenError,
}));

const withCode = (message: string, code: unknown) => Object.assign(new Error(message), { code });

describe("lo que se registra de un carnet que no se pudo emitir", () => {
  it("de un error de billetera sale su motivo, y el estado solo si el proveedor respondió", () => {
    expect(walletFailure(new WalletError("PROVIDER_HTTP", "respondió HTTP 401", 401))).toEqual({
      reason: "PROVIDER_HTTP",
      status: 401,
    });
    expect(walletFailure(new WalletError("PROVIDER_AUTH", "autorización HTTP 400", 400))).toEqual({
      reason: "PROVIDER_AUTH",
      status: 400,
    });
    expect(walletFailure(new WalletError("NOT_CONFIGURED", "no está configurado"))).toEqual({
      reason: "NOT_CONFIGURED",
    });
    expect(walletFailure(new WalletError("PROVIDER_UNREACHABLE", "no respondió"))).toEqual({
      reason: "PROVIDER_UNREACHABLE",
    });
  });

  it("a quien el dominio no le emite carnet no es un fallo, y sale con qué clase lo dijo: un error de dominio o negando el permiso", () => {
    expect(walletFailure(new DomainError("mensaje de dominio sintético"))).toEqual({
      reason: "REFUSED",
      errorType: "DomainError",
    });
    expect(walletFailure(new ForbiddenError())).toEqual({
      reason: "REFUSED",
      errorType: "ForbiddenError",
    });
  });

  it("de cualquier otro error salen su clase y su código o el de su causa, nunca su mensaje", () => {
    expect(walletFailure(new Error("oe2.secreto-de-prueba"))).toEqual({
      reason: "UNEXPECTED",
      errorType: "Error",
    });
    expect(
      walletFailure(
        new DrizzleQueryError("select 1", ["valor.privado@eafit.edu.co"], withCode("x", "57P01")),
      ),
    ).toEqual({ reason: "UNEXPECTED", errorType: "DrizzleQueryError", errorCode: "57P01" });
    expect(
      walletFailure(new TypeError("fetch failed", { cause: withCode("no abrió", "ECONNREFUSED") })),
    ).toEqual({ reason: "UNEXPECTED", errorType: "TypeError", errorCode: "ECONNREFUSED" });
  });

  it("un código o una clase que no parecen un identificador no se escriben, y lo que se lanza sin ser un error tampoco", () => {
    expect(walletFailure(withCode("falló", "oe2.secreto de prueba"))).toEqual({
      reason: "UNEXPECTED",
      errorType: "Error",
    });
    expect(walletFailure(withCode("falló", { token: "oe2.secreto" }))).toEqual({
      reason: "UNEXPECTED",
      errorType: "Error",
    });
    const disguised = Object.assign(new Error("falló"), {
      constructor: { name: "oe2.secreto de prueba" },
    });
    expect(walletFailure(disguised)).toEqual({ reason: "UNEXPECTED", errorType: "Error" });
    expect(walletFailure("oe2.secreto-de-prueba")).toEqual({
      reason: "UNEXPECTED",
      errorType: "string",
    });
  });
});
