import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { issueError } from "@/modules/wallet/domain/failure";
import { WalletError } from "@/shared/adapters/wallet-error";

// DT-312, inciso 4 (ADR-123 regla 24): el adaptador compartido declara solo sus motivos, y los que
// solo conoce la emisión viven en el módulo `wallet`, que los lanza por su fábrica. Es una regla de
// tipos: la sostiene el compilador (`npm run typecheck` falla si una línea marcada deja de ser un
// error), y acá queda además que el error que sale es el mismo de siempre.
vi.mock("@/modules/identity", async () => {
  const { ForbiddenError } = await import("@/modules/identity/domain/errors");
  return { ForbiddenError };
});

describe("los motivos de un fallo de billetera", () => {
  it("un adaptador lanza los suyos sin decir nada más", () => {
    const error = new WalletError("PROVIDER_HTTP", "respondió HTTP 503", 503);
    expect(error).toMatchObject({ name: "WalletError", reason: "PROVIDER_HTTP", status: 503 });
  });

  it("un motivo de la emisión no entra por el adaptador: sale por la fábrica del módulo", () => {
    // @ts-expect-error `CHANGED_DURING_ISSUE` no es un motivo del adaptador.
    const loose = new WalletError("CHANGED_DURING_ISSUE", "cambió durante la emisión");
    const issued = issueError("CHANGED_DURING_ISSUE", "cambió durante la emisión");
    // En ejecución son el mismo error: la clase, el nombre y el motivo no cambian.
    expect(loose).toBeInstanceOf(WalletError);
    expect(issued).toBeInstanceOf(WalletError);
    expect(issued).toMatchObject({ name: "WalletError", reason: "CHANGED_DURING_ISSUE" });
    expect(issued.status).toBeUndefined();
  });

  it("la fábrica recibe solo los tres de la emisión", () => {
    // @ts-expect-error Un motivo que no está en ninguna unión no compila.
    const unknown = issueError("LO_QUE_SEA", "no existe");
    // @ts-expect-error Uno del adaptador se lanza sin nombrar nada, no por la fábrica.
    const adapter = issueError("PROVIDER_HTTP", "respondió HTTP 503");
    expect([unknown, adapter].every((error) => error instanceof WalletError)).toBe(true);
  });

  // El tipo de la clase no lo impide: `new WalletError<string>("LO_QUE_SEA", …)` compila, porque
  // `shared` no puede conocer la unión del módulo. Por eso se lee.
  it("en `src` solo la fábrica le nombra a `WalletError` el tipo de su motivo", () => {
    const naming = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((path) => /\.tsx?$/.test(path))
      .map((path) => join("src", path))
      .filter((path) => /\bWalletError</.test(readFileSync(path, "utf8")))
      .sort();
    expect(naming).toEqual([
      "src/modules/wallet/domain/failure.ts",
      "src/shared/adapters/wallet-error.ts",
    ]);
  });
});
