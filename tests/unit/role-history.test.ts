import { describe, expect, it } from "vitest";
import type { AppointmentView } from "@/modules/people/domain/appointments";
import {
  appointmentHistoryEntry,
  groupRoleHistory,
  partitionRoleHistory,
  type RoleHistoryEntry,
} from "@/modules/people/domain/role-history";
import { t } from "@/shared/copy";

const role = (
  id: string,
  termCode: string,
  scope: string,
  endedAt: Date | null = null,
): RoleHistoryEntry => ({
  id,
  appointmentId: null,
  termId: termCode,
  termCode,
  scope,
  label: id,
  endedAt,
});
const appointment = (patch: Partial<AppointmentView>): AppointmentView => ({
  id: "a",
  kind: "VP_GH",
  title: null,
  termId: "2026-2",
  termCode: "2026-2",
  committeeId: null,
  committeeName: null,
  editionId: null,
  editionLabel: null,
  roleCode: null,
  roleLabel: null,
  coDirector: false,
  createdAt: new Date(),
  ...patch,
});

describe("cargos vigentes e historial", () => {
  it("separa pasado, semestre actual y futuro, incluidos cargos cerrados durante el semestre", () => {
    const previous = role("antes", "2025-2", "Comité Alfa");
    const current = role("ahora", "2026-2", "Evento Uno");
    const closed = role("cerrado", "2026-2", "Comité Alfa", new Date("2026-08-01"));
    const future = role("después", "2027-1", "Junta Directiva");
    const entries = [future, closed, previous, current];
    expect(partitionRoleHistory(entries, { id: "2026-2", code: "2026-2" }, true)).toEqual({
      current: [current],
      past: [closed, previous],
      upcoming: [future],
    });
    expect(partitionRoleHistory(entries, null, true)).toEqual({
      current: [],
      past: entries,
      upcoming: [],
    });
    expect(partitionRoleHistory(entries, { id: "2026-2", code: "2026-2" }, false)).toEqual({
      current: [],
      past: entries,
      upcoming: [],
    });
  });

  it("agrupa por semestre descendente y ámbito sin mezclar dos cargos iguales", () => {
    const entries = [
      role("Financiero", "2025-1", "Comité Beta"),
      role("General", "2026-2", "Comité Alfa"),
      role("Financiero", "2025-1", "Comité Alfa"),
    ];
    const grouped = groupRoleHistory(entries);
    expect(grouped.map((g) => g.termCode)).toEqual(["2026-2", "2025-1"]);
    expect(grouped[1]?.scopes.map((g) => g.scope)).toEqual(["Comité Alfa", "Comité Beta"]);
    expect(entries.map((r) => r.scope)).toEqual(["Comité Beta", "Comité Alfa", "Comité Alfa"]);
  });

  it("rotula GH dentro de Junta, conserva el comité explícito y la edición del macroevento", () => {
    for (const kind of ["VP_GH", "GH_HEAD", "GH_DIRECTOR"] as const) {
      expect(appointmentHistoryEntry(appointment({ kind })).scope).toBe(t("T-2394"));
    }
    expect(
      appointmentHistoryEntry(appointment({ kind: "GH_DIRECTOR", committeeName: "Comité Alfa" }))
        .scope,
    ).toBe("Comité Alfa");
    expect(
      appointmentHistoryEntry(
        appointment({
          kind: "MACROEVENT_DIRECTOR",
          editionLabel: "Evento Uno · 2026",
          roleLabel: "Dirección de Logística",
          coDirector: true,
        }),
      ),
    ).toMatchObject({
      scope: "Evento Uno · 2026",
      label: t("T-2401", { cargo: "Dirección de Logística" }),
    });
  });

  it("ordena un título histórico con ámbito sin convertirlo en un nombramiento de macroevento", () => {
    const raw = appointment({ kind: "OTHER", title: "Director de Publicidad · Evento Uno" });
    expect(appointmentHistoryEntry(raw)).toMatchObject({
      scope: "Evento Uno",
      label: "Director de Publicidad",
      appointmentId: "a",
    });
    expect(raw.kind).toBe("OTHER");
    expect(raw.editionId).toBeNull();
    expect(
      appointmentHistoryEntry(appointment({ kind: "OTHER", title: "Representante especial" })),
    ).toMatchObject({ scope: t("T-2395"), label: "Representante especial" });
  });
});
