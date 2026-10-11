import { describe, expect, it } from "vitest";
import type { WalletFailureReason } from "@/modules/wallet/domain/failure";
import { WalletError } from "@/shared/adapters/wallet-error";

// DT-312, inciso 4 (ADR-123 regla 24): el adaptador compartido declara solo sus motivos, y los que
// solo conoce la emisión viven en el módulo `wallet`. Es una regla de tipos: la sostiene el
// compilador (`npm run typecheck` falla si la línea marcada deja de ser un error), y acá queda además
// que el error que sale es el mismo de siempre.

describe("los motivos de un fallo de billetera", () => {
  it("un adaptador lanza los suyos sin decir nada más", () => {
    const error = new WalletError("PROVIDER_HTTP", "respondió HTTP 503", 503);
    expect(error).toMatchObject({ name: "WalletError", reason: "PROVIDER_HTTP", status: 503 });
  });

  it("un motivo de la emisión no entra por el adaptador: hay que nombrar la unión del módulo", () => {
    // @ts-expect-error `CHANGED_DURING_ISSUE` no es un motivo del adaptador.
    const loose = new WalletError("CHANGED_DURING_ISSUE", "cambió durante la emisión");
    const named = new WalletError<WalletFailureReason>(
      "CHANGED_DURING_ISSUE",
      "cambió durante la emisión",
    );
    // En ejecución son el mismo error: la clase, el nombre y el motivo no cambian.
    expect(loose).toBeInstanceOf(WalletError);
    expect(named).toMatchObject({ name: "WalletError", reason: "CHANGED_DURING_ISSUE" });
    expect(named.status).toBeUndefined();
  });
});
