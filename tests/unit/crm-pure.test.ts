import { describe, expect, it } from "vitest";
import { summarizeEvent, type TimelineLabels } from "@/modules/crm/domain/timeline-pure";
import { normalizePhone } from "@/modules/people/domain/person-pure";
import { segmentFilterSchema } from "@/modules/people/domain/segments";
import { tList } from "@/shared/copy";

const labels: TimelineLabels = {
  texts: tList("T-458"),
  participationTexts: tList("T-667"),
  permanenceTexts: tList("T-832"),
  crmTexts: tList("T-1046"),
  directionTexts: tList("T-2171"),
  stages: { PROSPECT: "prospecto", APPLICANT: "postulante", MEMBER: "miembro", ALUMNI: "egresado" },
  requestStatuses: { APPROVED: "Aprobada", REJECTED: "Rechazada", WITHDRAWN: "Retirada" },
  callEntryStatuses: { ACCEPTED: "Aceptada", WAITLISTED: "En lista de espera" },
  decisions: { CONTINUES: "Continúa", PROBATION: "Periodo de prueba", EXIT_OE: "Sale de la OE" },
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
        "committee-membership.changed",
        {
          personId: "p",
          termId: "t1",
          committees: [
            {
              committeeId: "c1",
              roleCode: "GENERAL",
              roles: [
                { roleCode: "GENERAL", coDirector: true },
                { roleCode: "LOGISTICA", coDirector: false },
              ],
            },
          ],
        },
        labels,
        lookup,
      )?.summary,
    ).toBe("Comités de 2026-2: A3 · Codirección de General y Miembro");
    expect(
      summarizeEvent(
        "committee-removal.requested",
        { personId: "p", actorId: "a", committeeId: "c1", termId: "t1", reason: "No volvió" },
        labels,
        lookup,
      ),
    ).toMatchObject({ kind: "COMMITTEES", summary: "Pidieron a GH su retiro de A3: No volvió" });
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

  it("un Sudoku acreditado entra como participación con su dificultad y su modo (ADR-078)", () => {
    const entry = summarizeEvent(
      "sudoku.completed",
      {
        personId: "p",
        termId: "t1",
        runId: "r1",
        day: "2026-09-19",
        difficulty: "HARD",
        assisted: false,
        points: 6,
      },
      labels,
      lookup,
    );
    expect(entry).toMatchObject({
      kind: "PARTICIPATION",
      summary: "Resolvió un Sudoku el 2026-09-19 y sumó 6 GH Points",
      metadata: { runId: "r1", difficulty: "HARD", assisted: false, points: 6 },
    });
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

describe("línea de tiempo de permanencia (fase 4)", () => {
  it("traduce evaluaciones, puntajes, créditos, grupos y decisiones con los textos de T-832", () => {
    expect(
      summarizeEvent(
        "evaluation.recorded",
        {
          personId: "p",
          groupName: "GAP Días EAFIT",
          evaluation: "GOOD",
          evaluatorName: "Miguel",
          note: "",
        },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "PERMANENCE",
      summary: "Buen desempeño en GAP Días EAFIT, evaluado por Miguel",
    });
    expect(
      summarizeEvent(
        "evaluation.recorded",
        { personId: "p", groupName: "GT", evaluation: "INSUFFICIENT", note: "No fue" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Desempeño insuficiente en GT, evaluado por GH: No fue");
    expect(
      summarizeEvent(
        "leader-score.recorded",
        {
          personId: "p",
          committeeId: "c1",
          criterion: "Convivencia",
          value: 3,
          weight: 5,
          note: "Llegó tarde",
        },
        labels,
        lookup,
      )?.summary,
    ).toBe("Convivencia en A3: 3 de 5: Llegó tarde");
    expect(
      summarizeEvent(
        "manual-credit.granted",
        { personId: "p", criterion: "Extra", value: 4, reason: "Apoyo" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Crédito manual en Extra: 4 (Apoyo)");
    // Condición del semestre (ADR-056): marcada o retirada, con el término y el motivo.
    expect(
      summarizeEvent(
        "membership-term.changed",
        {
          personId: "p",
          termId: "t1",
          probation: true,
          reason: "Roster mal cargado",
          actorId: "a",
        },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "PERMANENCE",
      actorId: "a",
      summary: "En periodo de prueba en 2026-2: Roster mal cargado",
      metadata: { event: "membership-term.changed", termId: "t1", probation: true },
    });
    expect(
      summarizeEvent(
        "membership-term.changed",
        { personId: "p", termId: "t1", probation: false, reason: "" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Sin periodo de prueba en 2026-2: —");
    expect(
      summarizeEvent(
        "work-group-membership.changed",
        { personId: "p", groupName: "CGH", change: "LEFT" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Salió del grupo CGH");
    expect(
      summarizeEvent(
        "permanence.decided",
        { personId: "p", termId: "t1", committeeId: "c1", decision: "PROBATION", reason: "" },
        labels,
        lookup,
      )?.summary,
    ).toBe("Cierre de 2026-2: Periodo de prueba (A3)");
  });
});
