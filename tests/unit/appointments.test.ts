import { describe, expect, it } from "vitest";
import { APPOINTMENT_KINDS, appointmentInputSchema } from "@/modules/people/domain/appointments";
import { tList } from "@/shared/copy";

// Cargos de junta y de GH (ADR-034 regla 13, ADR-057): las etiquetas de T-444 se resuelven por índice.

describe("cargos de junta y de GH", () => {
  it("tiene una etiqueta de T-444 por cada tipo, en el mismo orden", () => {
    const labels = tList("T-444");
    expect(labels).toHaveLength(APPOINTMENT_KINDS.length);
    expect(labels[APPOINTMENT_KINDS.indexOf("VP_COMMUNICATIONS")]).toBe(
      "Vicepresidencia de Comunicaciones y Mercadeo",
    );
    expect(labels[APPOINTMENT_KINDS.indexOf("OTHER")]).toBe("Otro");
  });

  it("acepta la vicepresidencia nueva sin título y sigue exigiéndolo para Otro", () => {
    expect(
      appointmentInputSchema.safeParse({ kind: "VP_COMMUNICATIONS", termId: "t1" }).success,
    ).toBe(true);
    expect(appointmentInputSchema.safeParse({ kind: "OTHER", termId: "t1" }).success).toBe(false);
  });
});
