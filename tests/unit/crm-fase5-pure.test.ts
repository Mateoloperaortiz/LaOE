import { describe, expect, it } from "vitest";
import { hasRoom, initialEntryStatus, isCallOpen } from "@/modules/crm/domain/calls-pure";
import {
  closedAtAfterMove,
  daysInStage,
  templateStages,
} from "@/modules/crm/domain/pipelines-pure";
import {
  leavePayloadSchema,
  resignationPayloadSchema,
  resultingCommittees,
  transferPayloadSchema,
} from "@/modules/crm/domain/requests-pure";
import { tList } from "@/shared/copy";

// Pipelines, solicitudes y convocatorias sin I/O (ADR-037).

describe("plantillas de pipeline", () => {
  it("la admisión y el patrocinio marcan las dos últimas etapas como ganada y perdida", () => {
    const admission = templateStages("ADMISSION", tList("T-965"));
    expect(admission.map((s) => s.name)).toEqual([
      "Recibida",
      "Entrevista",
      "Admitida",
      "Alta",
      "No admitida",
    ]);
    expect(admission.map((s) => [s.isWon, s.isLost])).toEqual([
      [false, false],
      [false, false],
      [false, false],
      [true, false],
      [false, true],
    ]);
    const sponsorship = templateStages("SPONSORSHIP", tList("T-966"));
    expect(sponsorship[3]).toMatchObject({ name: "Cerrado", isWon: true, sortOrder: 3 });
    expect(sponsorship[4]).toMatchObject({ name: "Sin acuerdo", isLost: true });
  });

  it("un pipeline personalizado nace con una sola etapa abierta", () => {
    expect(templateStages("CUSTOM", tList("T-967"))).toEqual([
      { name: "Nueva", sortOrder: 0, isWon: false, isLost: false },
    ]);
  });

  it("cierra la tarjeta al llegar a ganada o perdida y la reabre al volver", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    expect(closedAtAfterMove({ isWon: true, isLost: false }, now)).toBe(now);
    expect(closedAtAfterMove({ isWon: false, isLost: true }, now)).toBe(now);
    expect(closedAtAfterMove({ isWon: false, isLost: false }, now)).toBeNull();
    expect(daysInStage(new Date("2026-09-01T00:00:00Z"), now)).toBe(4);
  });
});

describe("solicitudes", () => {
  it("valida el payload de cada tipo", () => {
    expect(leavePayloadSchema.parse({ reason: "Intercambio", until: "2026-12-01" })).toEqual({
      reason: "Intercambio",
      until: "2026-12-01",
    });
    expect(leavePayloadSchema.safeParse({ reason: "x" }).success).toBe(false);
    expect(
      resignationPayloadSchema.parse({ reason: "Me gradúo", memorialConsent: true }),
    ).toMatchObject({ memorialConsent: true, contactConsent: false });
    const nothing = transferPayloadSchema.safeParse({ reason: "Cambio de aires" });
    expect(nothing.success).toBe(false);
    if (!nothing.success) {
      expect(nothing.error.issues[0]?.message).toBe("T-887");
    }
    expect(
      transferPayloadSchema.safeParse({
        reason: "Cambio",
        leaveCommitteeIds: ["a3"],
        joinCommitteeIds: ["a3"],
      }).success,
    ).toBe(false);
  });

  it("calcula los comités del semestre siguiente conservando cargos y marcando transferencias", () => {
    const current = [
      { committeeId: "a3", roleCode: "GENERAL" },
      { committeeId: "pixel", roleCode: "MIEMBRO" },
    ];
    const limits = { min: 1, max: 3 };
    expect(
      resultingCommittees(
        current,
        { leaveCommitteeIds: ["pixel"], joinCommitteeIds: ["cigma"] },
        limits,
      ),
    ).toEqual({
      rows: [
        { committeeId: "a3", roleCode: "GENERAL", transferredIn: false },
        { committeeId: "cigma", roleCode: "MIEMBRO", transferredIn: true },
      ],
      error: null,
    });
    expect(
      resultingCommittees(
        current,
        { leaveCommitteeIds: ["a3", "pixel"], joinCommitteeIds: [] },
        limits,
      ).error,
    ).toBe("T-886");
    expect(
      resultingCommittees(current, { leaveCommitteeIds: [], joinCommitteeIds: ["x", "y"] }, limits)
        .error,
    ).toBe("T-886");
    expect(
      resultingCommittees(
        current,
        { leaveCommitteeIds: ["nada"], joinCommitteeIds: ["a3"] },
        limits,
      ).error,
    ).toBe("T-887");
  });
});

describe("convocatorias", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const window = {
    opensAt: new Date("2026-09-01T00:00:00Z"),
    closesAt: new Date("2026-09-10T00:00:00Z"),
  };

  it("abierta solo en OPEN y dentro de la ventana", () => {
    expect(isCallOpen({ status: "OPEN", ...window }, now)).toBe(true);
    expect(isCallOpen({ status: "DRAFT", ...window }, now)).toBe(false);
    expect(isCallOpen({ status: "CLOSED", ...window }, now)).toBe(false);
    expect(isCallOpen({ status: "OPEN", ...window }, new Date("2026-09-10T00:00:00Z"))).toBe(false);
  });

  it("por orden de llegada acepta hasta el cupo y deja en lista de espera; manual queda pendiente", () => {
    expect(initialEntryStatus("FIRST_COME", 2, 1)).toBe("ACCEPTED");
    expect(initialEntryStatus("FIRST_COME", 2, 2)).toBe("WAITLISTED");
    expect(initialEntryStatus("FIRST_COME", null, 99)).toBe("ACCEPTED");
    expect(initialEntryStatus("MANUAL", 2, 0)).toBe("APPLIED");
    expect(hasRoom(1, 1)).toBe(false);
    expect(hasRoom(null, 10)).toBe(true);
  });
});
