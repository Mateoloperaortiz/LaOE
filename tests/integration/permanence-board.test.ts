import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { boardExportRows, boardIndicators, recomputeSnapshots } from "@/modules/permanence";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "./factories";

// Panel de la junta (ADR-036 regla 12): agregados por término y comité sobre datos sembrados, sin
// ids ni correos de personas en la respuesta.

describe("indicadores de la junta", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("calcula retención, nuevos, estados y asistencia sin exponer personas", async () => {
    const first = await seedTerm("2024-1");
    const termId = await seedTerm("2024-2");
    const a3 = await seedCommittee("a3");
    const stays = await seedPerson("sigue@eafit.edu.co");
    const leaves = await seedPerson("sale@eafit.edu.co");
    const newcomer = await seedPerson("nueva@eafit.edu.co");
    await seedMembership(stays, first);
    await seedMembership(leaves, first);
    await seedMembership(newcomer, termId);
    const joined = new Date("2024-07-20T12:00:00Z");
    await seedCommitteeMembership(stays, a3, first, "MIEMBRO", {
      joinedAt: new Date("2024-01-20T12:00:00Z"),
    });
    await seedCommitteeMembership(leaves, a3, first, "MIEMBRO", {
      joinedAt: new Date("2024-01-20T12:00:00Z"),
    });
    await seedCommitteeMembership(stays, a3, termId, "MIEMBRO", { joinedAt: joined });
    await seedCommitteeMembership(newcomer, a3, termId, "MIEMBRO", { joinedAt: joined });
    // Criterio de asistencia sin más integraciones por venir; la tabla general vacía vale su nominal
    // como posible: la veterana queda en riesgo (margen 0) y la nueva, con umbral 80, no alcanza.
    await seedRule(termId, "eventos", {
      committeeId: a3,
      weight: 60,
      computation: "CHECKIN_COUNT",
      params: { category: "INTEGRATION", perUnit: 10 },
    });
    const meeting = await seedOccasion(termId, {
      category: "COMMITTEE_MEETING",
      committeeId: a3,
      status: "CLOSED",
      points: 0,
      startsAt: new Date("2024-09-03T22:00:00Z"),
      checkInOpensAt: new Date("2024-09-03T21:00:00Z"),
      checkInClosesAt: new Date("2024-09-03T23:00:00Z"),
    });
    await seedCheckIn(meeting.id, stays);
    const integration = await seedOccasion(termId, {
      category: "INTEGRATION",
      status: "CLOSED",
      points: 0,
      startsAt: new Date("2024-09-10T22:00:00Z"),
      checkInOpensAt: new Date("2024-09-10T21:00:00Z"),
      checkInClosesAt: new Date("2024-09-10T23:00:00Z"),
    });
    await seedCheckIn(integration.id, stays);
    await seedCheckIn(integration.id, newcomer);
    await recomputeSnapshots(termId);

    const data = await boardIndicators(termId);
    expect(data).not.toBeNull();
    if (!data) throw new Error("sin datos");
    expect(data.cards).toMatchObject({
      active: 2,
      newcomers: 1,
      retention: 50,
      enCamino: 0,
      enRiesgo: 1,
      noAlcanza: 1,
      meetingAttendance: 50,
      integrations: 1,
      assemblies: 0,
    });
    expect(data.retention).toEqual([
      { termCode: "2024-1", withCommittee: 2, continued: 1, retention: 50, newcomers: 2 },
      { termCode: "2024-2", withCommittee: 2, continued: null, retention: null, newcomers: 1 },
    ]);
    expect(data.committees).toEqual([
      {
        committeeId: a3,
        committeeName: "A3",
        members: 2,
        newcomers: 1,
        enCamino: 0,
        enRiesgo: 1,
        noAlcanza: 1,
        meetings: 1,
        attendance: 50,
      },
    ]);
    expect(data.integrations).toEqual({ held: 1, checkIns: 2, average: 2 });
    const serialized = JSON.stringify(data);
    for (const forbidden of [stays, leaves, newcomer, "@eafit.edu.co", "sigue", "nueva"]) {
      expect(serialized).not.toContain(forbidden);
    }
    const rows = boardExportRows(data, {
      cards: [
        "Activos",
        "Nuevos",
        "Retención",
        "En camino",
        "En riesgo",
        "No alcanza",
        "Reuniones",
        "Integraciones",
        "Asambleas",
      ],
      retention: ["Semestre", "Con comité", "Siguen", "Retención", "Nuevos"],
      committees: [
        "Comité",
        "Miembros",
        "En camino",
        "En riesgo",
        "No alcanza",
        "Reuniones",
        "Asistencia",
      ],
    });
    expect(rows).toContainEqual({
      id: "Asistencia:A3:2024-2",
      indicator: "Asistencia",
      committee: "A3",
      term: "2024-2",
      value: 50,
    });
    // La tarjeta trae la retención del término anterior; la fila de 2024-2 no tiene siguiente.
    expect(
      rows
        .filter((row) => row.indicator === "Retención" && row.term === "2024-2")
        .map((row) => row.value),
    ).toEqual([50, ""]);
  });
});
