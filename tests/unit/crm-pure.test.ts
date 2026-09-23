import { describe, expect, it } from "vitest";
import { mediaProcess } from "@/domain-events/content";
import { cardCreated, requestDecided } from "@/domain-events/crm";
import { submissionReceived } from "@/domain-events/forms";
import { permissionGranted } from "@/domain-events/identity";
import { sudokuCompleted } from "@/domain-events/participation";
import {
  appointmentChanged,
  committeeMembershipChanged,
  committeeRemovalRequested,
  consentChanged,
  membershipChanged,
  membershipTermChanged,
  personUpdated,
} from "@/domain-events/people";
import {
  evaluationRecorded,
  leaderScoreRecorded,
  manualCreditGranted,
  permanenceDecided,
  workGroupMembershipChanged,
} from "@/domain-events/permanence";
import {
  summarizeEvent,
  TIMELINE_RULES,
  type TimelineLabels,
} from "@/modules/crm/domain/timeline-pure";
import { normalizePhone } from "@/modules/people/domain/person-pure";
import { segmentFilterSchema } from "@/modules/people/domain/segments";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";

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

const persona = { actorId: null, personId: "p" };

describe("línea de tiempo", () => {
  it("traduce cada evento a su texto de T-458 con los nombres resueltos", () => {
    expect(
      summarizeEvent(
        membershipChanged,
        { personId: "p", from: "ACTIVE", to: "ON_LEAVE", reason: "Semestre afuera", actorId: "a" },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "MEMBERSHIP",
      actorId: "a",
      summary: fillCopy(tList("T-458")[1], {
        de: "Activo",
        a: "En licencia",
        motivo: "Semestre afuera",
      }),
    });
    expect(
      summarizeEvent(
        membershipChanged,
        { ...persona, from: "ACTIVE", to: "INACTIVE", reason: null, endReason: "GRADUATION" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-458")[2], { motivo: "GRADUATION" }));
    // El alta la cuenta person.admitted: aquí no deja entrada.
    expect(
      summarizeEvent(
        membershipChanged,
        { ...persona, from: null, to: "ACTIVE", reason: null },
        labels,
        lookup,
      ),
    ).toBeNull();
    // Sin cargos registrados, la pertenencia se cuenta por su cargo principal.
    expect(
      summarizeEvent(
        committeeMembershipChanged,
        {
          ...persona,
          termId: "t1",
          committees: [
            { committeeId: "c1", roleCode: "GENERAL", transferredIn: false, roles: [] },
            { committeeId: "c2", roleCode: "MIEMBRO", transferredIn: false, roles: [] },
          ],
        },
        labels,
        lookup,
      )?.summary,
    ).toBe(
      fillCopy(tList("T-458")[4], { término: "2026-2", comités: "A3 · General, PIXEL · Miembro" }),
    );
    expect(
      summarizeEvent(
        committeeMembershipChanged,
        {
          ...persona,
          termId: "t1",
          committees: [
            {
              committeeId: "c1",
              roleCode: "GENERAL",
              transferredIn: false,
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
    ).toBe(
      fillCopy(tList("T-458")[4], {
        término: "2026-2",
        comités: `A3 · ${t("T-2178", { lista: t("T-2144", { cargo: "General" }), último: "Miembro" })}`,
      }),
    );
    expect(
      summarizeEvent(
        committeeRemovalRequested,
        { personId: "p", actorId: "a", committeeId: "c1", termId: "t1", reason: "No volvió" },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "COMMITTEES",
      summary: t("T-2171", { comité: "A3", motivo: "No volvió" }),
    });
    expect(
      summarizeEvent(
        appointmentChanged,
        { ...persona, action: "ADDED", kind: "VP_GH", termId: "t1" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-458")[5], { cargo: "Vicepresidencia de GH", término: "2026-2" }));
    expect(
      summarizeEvent(
        consentChanged,
        { ...persona, purpose: "DIRECTORY_PHOTO", action: "REVOKED" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-458")[8], { propósito: "Foto en el directorio" }));
    expect(
      summarizeEvent(personUpdated, { ...persona, fields: ["phone", "program"] }, labels, lookup)
        ?.summary,
    ).toBe(fillCopy(tList("T-458")[9], { campos: "Celular, Programa" }));
    expect(
      summarizeEvent(
        permissionGranted,
        { ...persona, code: "ADMIN", committeeId: null },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "PERMISSION",
      summary: fillCopy(tList("T-458")[14], { permiso: "ADMIN" }),
      metadata: { event: "permission.granted", code: "ADMIN", committeeId: null },
    });
  });

  it("un evento sin regla no deja rastro, y uno sin persona ni organización tampoco", () => {
    expect(summarizeEvent(mediaProcess, { assetId: "x" }, labels, lookup)).toBeNull();
    expect(
      summarizeEvent(
        submissionReceived,
        {
          actorId: null,
          submissionId: "s1",
          formId: "f1",
          formTitle: "Contacto",
          formSlug: "contacto",
          personId: null,
          email: "alguien@example.com",
          actions: {},
        },
        labels,
        lookup,
      ),
    ).toBeNull();
  });

  it("un payload que no cumple el contrato no se cuenta a medias: falla", () => {
    expect(() =>
      summarizeEvent(personUpdated, { personId: "p" } as never, labels, lookup),
    ).toThrow();
  });

  it("cada tipo de evento tiene una sola regla", () => {
    const types = TIMELINE_RULES.map((rule) => rule.definition.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.length).toBe(45);
    expect(types).toContain("panal.completed");
  });

  it("la tarjeta de una organización entra a la línea de tiempo de la organización", () => {
    expect(
      summarizeEvent(
        cardCreated,
        {
          actorId: "a",
          cardId: "k1",
          pipelineId: "pl1",
          pipelineName: "Aliados",
          stageName: "Contacto",
          personId: null,
          organizationId: "o1",
        },
        labels,
        lookup,
      ),
    ).toMatchObject({ personId: null, organizationId: "o1", kind: "PIPELINE" });
  });

  it("una solicitud respondida sin motivo no deja los dos puntos colgando", () => {
    const base = {
      actorId: "a",
      personId: "p",
      requestId: "r1",
      kind: "LEAVE",
      kindLabel: "licencia",
      email: "p@example.com",
      firstName: "Ana",
    };
    const sinMotivo = summarizeEvent(
      requestDecided,
      { ...base, status: "APPROVED", reason: null },
      labels,
      lookup,
    );
    const conMotivo = summarizeEvent(
      requestDecided,
      { ...base, status: "REJECTED", reason: "Fuera de plazo" },
      labels,
      lookup,
    );
    expect(sinMotivo?.summary.endsWith(":")).toBe(false);
    expect(conMotivo?.summary).toContain("Fuera de plazo");
    expect(sinMotivo?.metadata).toMatchObject({ status: "APPROVED", requestId: "r1" });
  });

  it("un Sudoku acreditado entra como participación con su dificultad y su modo (ADR-078)", () => {
    const entry = summarizeEvent(
      sudokuCompleted,
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
      summary: fillCopy(tList("T-667")[13], { fecha: "2026-09-19", n: 6 }),
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
    const evaluacion = { ...persona, termId: "t1", groupId: "g1", kind: "GAP" };
    expect(
      summarizeEvent(
        evaluationRecorded,
        {
          ...evaluacion,
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
      summary: fillCopy(tList("T-832")[0], { grupo: "GAP Días EAFIT", evaluador: "Miguel" }),
    });
    // La importación histórica no sabe quién evaluó: se cuenta como GH.
    expect(
      summarizeEvent(
        evaluationRecorded,
        { ...evaluacion, groupName: "GT", evaluation: "INSUFFICIENT", note: "No fue" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-832")[1], { grupo: "GT", evaluador: "GH", nota: "No fue" }));
    const puntaje = { ...persona, termId: "t1", ruleId: "r1" };
    expect(
      summarizeEvent(
        leaderScoreRecorded,
        {
          ...puntaje,
          committeeId: "c1",
          criterion: "Convivencia",
          value: 3,
          weight: 5,
          note: "Llegó tarde",
        },
        labels,
        lookup,
      )?.summary,
    ).toBe(
      `${fillCopy(tList("T-832")[2], { criterio: "Convivencia", comité: "A3", valor: 3, peso: 5 })}: Llegó tarde`,
    );
    expect(
      summarizeEvent(
        manualCreditGranted,
        { ...puntaje, criterion: "Extra", value: 4, weight: 5, reason: "Apoyo" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-832")[3], { criterio: "Extra", valor: 4, motivo: "Apoyo" }));
    // Condición del semestre (ADR-056): marcada o retirada, con el término y el motivo.
    const condicion = { personId: "p", termId: "t1", committeeId: null, reportAsVeteran: false };
    expect(
      summarizeEvent(
        membershipTermChanged,
        { ...condicion, probation: true, reason: "Roster mal cargado", actorId: "a" },
        labels,
        lookup,
      ),
    ).toMatchObject({
      kind: "PERMANENCE",
      actorId: "a",
      summary: fillCopy(tList("T-832")[7], { término: "2026-2", motivo: "Roster mal cargado" }),
      metadata: { event: "membership-term.changed", termId: "t1", probation: true },
    });
    expect(
      summarizeEvent(
        membershipTermChanged,
        { ...condicion, actorId: null, probation: false, reason: "" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-832")[8], { término: "2026-2", motivo: "—" }));
    expect(
      summarizeEvent(
        workGroupMembershipChanged,
        { ...persona, termId: "t1", groupId: "g1", groupName: "CGH", kind: "CGH", change: "LEFT" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-832")[5], { grupo: "CGH" }));
    expect(
      summarizeEvent(
        permanenceDecided,
        { ...persona, termId: "t1", committeeId: "c1", decision: "PROBATION", reason: "" },
        labels,
        lookup,
      )?.summary,
    ).toBe(fillCopy(tList("T-832")[6], { término: "2026-2", decisión: "Periodo de prueba (A3)" }));
  });
});
