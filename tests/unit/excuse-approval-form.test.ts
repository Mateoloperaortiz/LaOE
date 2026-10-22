import { describe, expect, it, vi } from "vitest";
import { PanelSolicitud } from "@/app/admin/solicitudes/_ui/PanelSolicitud";
import type { RequestView } from "@/modules/crm";
import { elements } from "../helpers/react-tree";

vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));
vi.mock("@/env", () => ({
  getEnv: () => ({ APP_URL: "https://oe-sintetica.example", APP_TIMEZONE: "America/Bogota" }),
}));

const excuse: RequestView = {
  id: "solicitud-sintetica",
  personId: "persona-sintetica",
  kind: "EXCUSE",
  termId: "semestre-sintetico",
  occasionId: "asamblea-sintetica",
  payload: { cause: "OTHER", reason: "Explicación sintética", lateSubmission: true },
  status: "PENDING",
  taskId: null,
  decidedById: null,
  decidedAt: null,
  reason: null,
  createdAt: new Date("2026-10-22T15:00:00Z"),
  updatedAt: new Date("2026-10-22T15:00:00Z"),
  personName: "Miembro Sintético",
  personEmail: "miembro@example.test",
  kindLabel: "Excusa",
  statusLabel: "Pendiente",
  detail: "Asamblea sintética",
  decidedByName: null,
};

describe("el formulario con el que GH aprueba una excusa", () => {
  it("permite enviar el motivo de una aprobación fuera de plazo en la misma decisión", () => {
    const tree = PanelSolicitud({
      request: excuse,
      closeHref: "/admin/solicitudes",
      returnTo: "/admin/solicitudes?solicitud=solicitud-sintetica",
      error: "",
      nextTermCode: null,
    });
    const approval = elements(tree).find(
      (item) =>
        item.type === "form" &&
        elements(item).some(
          (field) =>
            field.type === "input" &&
            field.props.name === "decision" &&
            field.props.value === "APPROVED",
        ),
    );
    const reason = elements(approval).find(
      (item) => item.type === "textarea" && item.props.name === "reason",
    );

    expect(reason).toBeDefined();
    expect(reason?.props.required).not.toBe(true);
  });
});
