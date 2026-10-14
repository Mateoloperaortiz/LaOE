import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it, vi } from "vitest";
import { logCarnetNotIssued } from "@/app/api/wallet/not-issued";
import { ForbiddenError } from "@/modules/identity/domain/errors";
import { issueError } from "@/modules/wallet/domain/failure";
import { WalletError } from "@/shared/adapters/wallet-error";
import { DomainError } from "@/shared/lib/errors";
import { captureLogs, type LoggedLine } from "../helpers/logs";

// Lo que deja en el registro una ruta de billetera que no entregó el carnet (ADR-120 regla 13), por
// la función que las dos comparten. Esta matriz estaba copiada en las pruebas de las dos rutas
// (DT-312, inciso 5); cada ruta conserva un caso, que dice que la llama con su plataforma.
//
// El registro es el de verdad: lo que se afirma es la línea que sale, ya serializada. Y lo que es
// seguro escribir lo decide el módulo, no la prueba (DT-228).
vi.mock("@/modules/identity", async () => {
  const { ForbiddenError } = await import("@/modules/identity/domain/errors");
  return { ForbiddenError };
});
vi.mock("@/modules/wallet", async () => {
  const { walletFailure } = await import("@/modules/wallet/domain/failure");
  return { walletFailure };
});

const PLATFORMS = ["APPLE", "GOOGLE"] as const;

/** Las líneas que deja la emisión que falla con `error`. */
async function linesOf(
  platform: (typeof PLATFORMS)[number],
  error: unknown,
): Promise<LoggedLine[]> {
  const { lines } = await captureLogs(async () => logCarnetNotIssued(platform, error));
  return lines;
}

describe.each(
  PLATFORMS,
)("lo que registra la ruta de billetera de %s cuando no entrega el carnet", (platform) => {
  it("un error cualquiera deja una línea de fallo con su clase, sin su mensaje ni sus secretos", async () => {
    const lines = await linesOf(platform, new Error("oe2.secreto-de-prueba"));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({
      level: 50,
      msg: "no se pudo emitir el carnet",
      platform,
      reason: "UNEXPECTED",
      errorType: "Error",
    });
    expect(lines[0]?.line).not.toContain("secreto");
    expect(lines[0]?.line).not.toContain("oe2.");
  });

  it("dice por qué no se pudo emitir: el motivo y el estado que respondió el proveedor", async () => {
    const http = await linesOf(
      platform,
      new WalletError("PROVIDER_HTTP", "respondió HTTP 503 oe2.secreto-de-prueba", 503),
    );
    const config = await linesOf(
      platform,
      new WalletError("NOT_CONFIGURED", "no está configurado"),
    );
    expect(http[0]?.record).toMatchObject({
      level: 50,
      platform,
      reason: "PROVIDER_HTTP",
      status: 503,
    });
    expect(config[0]?.record).toMatchObject({ level: 50, reason: "NOT_CONFIGURED" });
    expect(config[0]?.record).not.toHaveProperty("status");
    for (const { line } of [...http, ...config]) {
      for (const written of ["secreto", "respondió", "no está configurado"]) {
        expect(line).not.toContain(written);
      }
    }
  });

  it("si lo que se cae es la base, la línea trae la clase del error y su código, sin la consulta ni sus valores", async () => {
    const down = Object.assign(new Error("terminating connection due to administrator command"), {
      code: "57P01",
    });
    const lines = await linesOf(
      platform,
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
    const lines = await linesOf(
      platform,
      issueError("CHANGED_DURING_ISSUE", "cambió durante la emisión"),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({ level: 40, platform, reason: "CHANGED_DURING_ISSUE" });
  });

  it("distingue por el motivo un proveedor que no responde, una autorización rechazada y una firma que falla", async () => {
    const down = await linesOf(platform, new WalletError("PROVIDER_UNREACHABLE", "no respondió"));
    const denied = await linesOf(
      platform,
      new WalletError("PROVIDER_AUTH", "autorización HTTP 400", 400),
    );
    const unsigned = await linesOf(
      platform,
      new WalletError("SIGNING_FAILED", "no se pudo firmar"),
    );
    expect(down[0]?.record).toMatchObject({ level: 50, reason: "PROVIDER_UNREACHABLE" });
    expect(denied[0]?.record).toMatchObject({ level: 50, reason: "PROVIDER_AUTH", status: 400 });
    expect(unsigned[0]?.record).toMatchObject({ level: 50, reason: "SIGNING_FAILED" });
  });

  it.each([
    ["no tiene carnet vigente", new DomainError("mensaje de dominio sintético"), "DomainError"],
    ["no participa", new ForbiddenError(), "ForbiddenError"],
  ])("quien %s no deja una línea de fallo: la línea dice con qué clase lo dijo el dominio", async (_name, rejection, errorType) => {
    const lines = await linesOf(platform, rejection);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.record).toMatchObject({ level: 30, platform, errorType });
    expect(lines[0]?.record.msg).not.toBe("no se pudo emitir el carnet");
    expect(lines[0]?.record).not.toHaveProperty("reason");
    expect(lines[0]?.line).not.toContain("sintético");
  });
});
