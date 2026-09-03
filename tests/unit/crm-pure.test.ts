import { describe, expect, it } from "vitest";
import { summarizeEvent, type TimelineLabels } from "@/modules/crm/domain/timeline-pure";
import { normalizePhone } from "@/modules/people/domain/person-pure";
import { segmentFilterSchema } from "@/modules/people/domain/segments";
import { tList } from "@/shared/copy";

const labels: TimelineLabels = {
  texts: tList("T-458"),
  statuses: { ACTIVE: "Activo", ON_LEAVE: "En licencia", INACTIVE: "Retirado" },
  appointmentKinds: { VP_GH: "Vicepresidencia de GH" },
  permissions: { ADMIN: "ADMIN" },
  purposes: { DIRECTORY_PHOTO: "Foto en el directorio" },
  fields: { phone: "Celular", program: "Programa" },
};

const lookup = {
  termCode: (id: string) => (id === "t1" ? "2026-2" : ""),
  committeeName: (id: string) => (id === "c1" ? "A3" : "PIXEL"),
  roleLabel: (code: string) => (code === "GENERAL" ? "General" : "Miembro"),
};

describe("línea de tiempo", () => {
  it("traduce cada evento a su texto de T-458 con los nombres resueltos", () => {
    expect(
      summarizeEvent(
        "membership.changed",
        { personId: "p", from: "ACTIVE", to: "ON_LEAVE", reason: "Semestre afuera", actorId: "a" },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "MEMBERSHIP",
      actorId: "a",
      summary: "Estado cambió de Activo a En licencia: Semestre afuera",
    });
    expect(
      summarizeEvent(
        "membership.changed",
        { personId: "p", from: "ACTIVE", to: "INACTIVE", endReason: "GRADUATION" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Dado de baja: GRADUATION");
    expect(
      summarizeEvent(
        "committee-membership.changed",
        {
          personId: "p",
          termId: "t1",
          committees: [
            { committeeId: "c1", roleCode: "GENERAL" },
            { committeeId: "c2", roleCode: "MIEMBRO" },
          ],
        },
        labels,
        lookup,
      )?.summary,
    ).toBe("Comités de 2026-2: A3 · General, PIXEL · Miembro");
    expect(
      summarizeEvent(
        "appointment.changed",
        { personId: "p", action: "ADDED", kind: "VP_GH", termId: "t1" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Cargo Vicepresidencia de GH desde 2026-2");
    expect(
      summarizeEvent(
        "consent.changed",
        { personId: "p", purpose: "DIRECTORY_PHOTO", action: "REVOKED" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Consentimiento de Foto en el directorio retirado");
    expect(
      summarizeEvent(
        "person.updated",
        { personId: "p", fields: ["phone", "program"] },
        labels,
        lookup,
      )?.summary,
    ).toBe("Datos actualizados: Celular, Programa");
    expect(
      summarizeEvent("permission.granted", { personId: "p", code: "ADMIN" }, labels, lookup),
    ).toMatchObject({ kind: "PERMISSION", summary: "Permiso ADMIN otorgado" });
    expect(summarizeEvent("media.process", { assetId: "x" }, labels, lookup)).toBeNull();
    expect(summarizeEvent("person.updated", {}, labels, lookup)).toBeNull();
  });
});

describe("segmentos", () => {
  it("el filtro vacío vale y un filtro viejo se normaliza", () => {
    expect(segmentFilterSchema.parse({})).toEqual({
      stages: [],
      statuses: [],
      entry: "ANY",
      committeeIds: [],
      roleCodes: [],
      tagIds: [],
      consent: "ANY",
      program: "",
    });
    expect(segmentFilterSchema.safeParse({ statuses: ["INVENTADO"] }).success).toBe(false);
  });
});

describe("celular", () => {
  it("normaliza diez dígitos con o sin +57 y conserva lo demás con aviso", () => {
    expect(normalizePhone("300 123 4567")).toEqual({ value: "+573001234567", normalized: true });
    expect(normalizePhone("+57 (300) 123-4567")).toEqual({
      value: "+573001234567",
      normalized: true,
    });
    expect(normalizePhone("573001234567")).toEqual({ value: "+573001234567", normalized: true });
    expect(normalizePhone("604 2619500")).toEqual({ value: "604 2619500", normalized: false });
  });
});
