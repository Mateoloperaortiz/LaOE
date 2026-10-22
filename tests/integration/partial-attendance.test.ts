import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { createRequestAs, decideRequestAs, listRequestsByPerson } from "@/modules/crm";
import {
  assemblyStatusFor,
  findCheckIn,
  hostCheckInAs,
  listApprovedCheckInsForPersonInTerm,
  listAssemblyRepresentation,
  listExcusedCheckInsForPersonInTerm,
} from "@/modules/participation";
import { listEntriesFor } from "@/modules/participation/domain/ledger";
import { setRepresentativeAs } from "@/modules/people";
import { getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

async function fixture() {
  const termId = await seedTerm();
  const adminId = await seedMember("gestion.parciales@eafit.edu.co");
  const personId = await seedMember("persona.parcial@eafit.edu.co");
  const startsAt = new Date(Date.now() - 24 * 3_600_000);
  const assembly = await seedOccasion(termId, {
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    title: "Asamblea de prueba",
    status: "CLOSED",
    points: 0,
    startsAt,
    checkInOpensAt: new Date(startsAt.getTime() - 3_600_000),
    checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
  });
  const term = await getTerm(termId);
  if (!term) throw new Error("Falta el término de prueba");
  return { termId, term, adminId, personId, assembly, admin: { personId: adminId, ip: null } };
}

describe("asistencia parcial y excusa independiente", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("registra la toma parcial y la muestra sin acreditar la asamblea completa", async () => {
    const f = await fixture();
    await hostCheckInAs(f.admin, {
      occasionId: f.assembly.id,
      personId: f.personId,
      personName: "Persona de prueba",
      source: "ADMIN",
      attendanceExtent: "PARTIAL",
      attendanceList: "SECOND",
    });

    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "PARTIAL",
      attendanceList: "SECOND",
    });
    expect((await assemblyStatusFor(f.personId, f.term)).compliance).toMatchObject({
      compliant: false,
      ordinaryAttended: 0,
      attendedTotal: 0,
    });
    expect(await listApprovedCheckInsForPersonInTerm(f.personId, f.termId)).toEqual([]);
    expect(await listEntriesFor(f.personId, f.termId)).toEqual([]);
  });

  it("presentar, rechazar y aprobar la excusa conserva la presencia parcial y su toma", async () => {
    const f = await fixture();
    await hostCheckInAs(f.admin, {
      occasionId: f.assembly.id,
      personId: f.personId,
      personName: "Persona de prueba",
      source: "ADMIN",
      attendanceExtent: "PARTIAL",
      attendanceList: "FIRST",
    });
    const payload = {
      occasionId: f.assembly.id,
      cause: "ACADEMIC",
      reason: "Evaluación académica durante la segunda parte",
    };
    const first = await createRequestAs({ personId: f.personId, ip: null }, "EXCUSE", payload);
    expect(
      (await listRequestsByPerson(f.personId)).find((row) => row.id === first.id)?.status,
    ).toBe("PENDING");
    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "PARTIAL",
      attendanceList: "FIRST",
    });
    await decideRequestAs(f.admin, first.id, {
      decision: "REJECTED",
      reason: "Falta el soporte académico",
    });
    expect((await assemblyStatusFor(f.personId, f.term)).compliance.compliant).toBe(false);
    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "PARTIAL",
      attendanceList: "FIRST",
    });

    const second = await createRequestAs({ personId: f.personId, ip: null }, "EXCUSE", payload);
    await decideRequestAs(f.admin, second.id, { decision: "APPROVED" });
    expect(
      (await listRequestsByPerson(f.personId)).find((row) => row.id === second.id)?.status,
    ).toBe("APPROVED");
    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "EXCUSED",
      attendanceExtent: "PARTIAL",
      attendanceList: "FIRST",
    });
    expect((await assemblyStatusFor(f.personId, f.term)).compliance).toMatchObject({
      compliant: true,
      ordinaryAttended: 0,
      attendedTotal: 0,
    });
    expect(await listApprovedCheckInsForPersonInTerm(f.personId, f.termId)).toEqual([]);
    expect(await listExcusedCheckInsForPersonInTerm(f.personId, f.termId)).toEqual([f.assembly.id]);
    expect(await listEntriesFor(f.personId, f.termId)).toEqual([]);
  });

  it("una excusa sin presencia previa no inventa una asistencia completa", async () => {
    const f = await fixture();
    const submitted = await createRequestAs({ personId: f.personId, ip: null }, "EXCUSE", {
      occasionId: f.assembly.id,
      cause: "WORK",
      reason: "Turno de trabajo durante la asamblea",
    });
    await decideRequestAs(f.admin, submitted.id, { decision: "APPROVED" });
    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "EXCUSED",
      attendanceExtent: null,
      attendanceList: null,
    });
  });

  it("una asistencia completa sigue sin admitir excusa sobre la misma asamblea", async () => {
    const f = await fixture();
    await hostCheckInAs(f.admin, {
      occasionId: f.assembly.id,
      personId: f.personId,
      personName: "Persona de prueba",
      source: "ADMIN",
    });
    await expect(
      createRequestAs({ personId: f.personId, ip: null }, "EXCUSE", {
        occasionId: f.assembly.id,
        cause: "WORK",
        reason: "Turno de trabajo",
      }),
    ).rejects.toThrow(t("T-2223"));
    expect(await findCheckIn(f.assembly.id, f.personId)).toMatchObject({
      status: "APPROVED",
      attendanceExtent: "FULL",
      attendanceList: null,
    });
  });

  it("una representante parcial no acredita al comité; su excusa aceptada lo deja justificado", async () => {
    const f = await fixture();
    const committeeId = await seedCommittee("comite-parcial", "Comité de prueba");
    await seedCommitteeMembership(f.personId, committeeId, f.termId);
    await setRepresentativeAs(f.admin, {
      committeeId,
      personId: f.personId,
      termId: f.termId,
      role: "TITULAR",
    });
    await hostCheckInAs(f.admin, {
      occasionId: f.assembly.id,
      personId: f.personId,
      personName: "Persona de prueba",
      source: "ADMIN",
      attendanceExtent: "PARTIAL",
      attendanceList: "SECOND",
    });
    await drainOutbox();
    expect((await listAssemblyRepresentation(f.termId)).get(f.assembly.id)).toMatchObject({
      total: 1,
      represented: 0,
      excused: 0,
    });
    const submitted = await createRequestAs({ personId: f.personId, ip: null }, "EXCUSE", {
      occasionId: f.assembly.id,
      cause: "ACADEMIC",
      reason: "Evaluación académica durante la primera parte",
    });
    await decideRequestAs(f.admin, submitted.id, { decision: "APPROVED" });
    await drainOutbox();
    expect((await listAssemblyRepresentation(f.termId)).get(f.assembly.id)).toMatchObject({
      total: 1,
      represented: 0,
      excused: 1,
    });
  });

  it("rechaza una parcial sin toma y una completa con toma parcial, sin crear un registro", async () => {
    const f = await fixture();
    const base = {
      occasionId: f.assembly.id,
      personId: f.personId,
      personName: "Persona de prueba",
      source: "ADMIN" as const,
    };
    await expect(hostCheckInAs(f.admin, { ...base, attendanceExtent: "PARTIAL" })).rejects.toThrow(
      t("T-3592"),
    );
    await expect(
      hostCheckInAs(f.admin, { ...base, attendanceExtent: "FULL", attendanceList: "FIRST" }),
    ).rejects.toThrow(t("T-3593"));
    expect(await findCheckIn(f.assembly.id, f.personId)).toBeNull();
  });

  it("la captura parcial se limita a asambleas y no modifica una actividad", async () => {
    const f = await fixture();
    const activity = await seedOccasion(f.termId, { points: 10, status: "CLOSED" });
    await expect(
      hostCheckInAs(f.admin, {
        occasionId: activity.id,
        personId: f.personId,
        personName: "Persona de prueba",
        source: "ADMIN",
        attendanceExtent: "PARTIAL",
        attendanceList: "FIRST",
      }),
    ).rejects.toThrow(t("T-3591"));
    expect(await findCheckIn(activity.id, f.personId)).toBeNull();
    expect(await listEntriesFor(f.personId, f.termId)).toEqual([]);
  });
});
