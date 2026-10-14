import { describe, expect, it } from "vitest";
import {
  type IssueGrantState,
  initialIssueGrantState,
  issueGrantRejected,
} from "@/app/admin/personas/acceso-state";
import { t } from "@/shared/copy";
import { guardAction } from "@/shared/ui/use-guarded-action-state";

// El panel que emite el enlace de acceso cuando la emisión no tuvo respuesta (ADR-118 regla 20).

const offline = async (): Promise<IssueGrantState> => {
  throw new TypeError("Failed to fetch");
};

function requested(kind: string): FormData {
  const sent = new FormData();
  sent.set("personId", "persona-de-prueba");
  sent.set("kind", kind);
  return sent;
}

function afterRejection(previous: IssueGrantState, kind: string): Promise<IssueGrantState> {
  return guardAction(offline, issueGrantRejected, t("T-3252"))(previous, requested(kind));
}

describe("el panel del enlace de acceso cuando la emisión no tuvo respuesta", () => {
  it("deja elegido el tipo de enlace que se pidió y muestra el aviso", async () => {
    expect(await afterRejection(initialIssueGrantState, "RECOVERY")).toEqual({
      ...initialIssueGrantState,
      error: t("T-3252"),
      kind: "RECOVERY",
    });
    expect((await afterRejection(initialIssueGrantState, "ACTIVATION")).kind).toBe("ACTIVATION");
  });

  it("conserva el enlace que ya estaba a la vista", async () => {
    const issued: IssueGrantState = {
      personId: "persona-de-prueba",
      url: "https://casa.test/activar/abc",
      qrSvg: "<svg />",
      expiresAt: "2026-10-08T15:00:00.000Z",
      error: null,
    };

    expect(await afterRejection(issued, "RECOVERY")).toEqual({
      ...issued,
      error: t("T-3252"),
      kind: "RECOVERY",
    });
  });

  it("un tipo que no reconoce vuelve a activación, que es lo que el formulario trae elegido", async () => {
    expect((await afterRejection(initialIssueGrantState, "OTRO")).kind).toBe("ACTIVATION");
  });
});
