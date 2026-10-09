import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  listAssemblyRepresentation,
  listCommitteeRepresentation,
  recomputeCommitteeAssembly,
} from "@/modules/participation";
import { closeOccasion } from "@/modules/participation/domain/occasions";
import { checkIn, committeeAssemblyAttendance } from "@/modules/participation/schema";
import {
  anonymizePersonAs,
  endMembershipAs,
  leaveCommitteeAs,
  listRepresentatives,
  requestDeletionAs,
  setCommitteeMembershipsAs,
  setRepresentativeAs,
} from "@/modules/people";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/lib/errors";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedTerm,
} from "./factories";

// Representación de los comités ante la Asamblea Directiva (ADR-060 regla 7): titular y suplente
// activos del comité, asistencia por comité derivada al cerrar la asamblea (titular, suplente o
// cualquier cargo de dirección), excusa aceptada y la escalera del término.

const db = () => getDb();

async function assembly(termId: string, title: string, daysAgo: number) {
  const startsAt = new Date(Date.now() - daysAgo * 86_400_000);
  return seedOccasion(termId, {
    title,
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
    status: "OPEN",
    startsAt,
    checkInOpensAt: new Date(startsAt.getTime() - 3_600_000),
    checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
  });
}

describe("representación en la asamblea", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("nombra titular y suplente entre los activos del comité, uno por rol", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const gh = await seedMember("gh@eafit.edu.co");
    const titular = await seedMember("titular@eafit.edu.co");
    const suplente = await seedMember("suplente@eafit.edu.co");
    const ajeno = await seedMember("ajeno@eafit.edu.co");
    const onLeave = await seedPerson("licencia@eafit.edu.co");
    await seedMembership(onLeave, termId, "ON_LEAVE");
    await seedCommitteeMembership(titular, a3, termId, "GENERAL");
    await seedCommitteeMembership(suplente, a3, termId);
    await seedCommitteeMembership(onLeave, a3, termId);
    const actor = { personId: gh, ip: null };
    const base = { committeeId: a3, termId };

    await expect(
      setRepresentativeAs(actor, { ...base, role: "TITULAR", personId: ajeno }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      setRepresentativeAs(actor, { ...base, role: "TITULAR", personId: onLeave }),
    ).rejects.toBeInstanceOf(DomainError);
    await setRepresentativeAs(actor, { ...base, role: "TITULAR", personId: titular });
    await setRepresentativeAs(actor, { ...base, role: "SUPLENTE", personId: suplente });
    expect(
      (await listRepresentatives(termId, a3)).map((row) => [row.role, row.personId]).sort(),
    ).toEqual(
      [
        ["SUPLENTE", suplente],
        ["TITULAR", titular],
      ].sort(),
    );
    // Pasar al suplente a titular lo saca del otro rol; vaciar un rol lo borra.
    await setRepresentativeAs(actor, { ...base, role: "TITULAR", personId: suplente });
    expect((await listRepresentatives(termId, a3)).map((row) => [row.role, row.personId])).toEqual([
      ["TITULAR", suplente],
    ]);
    await setRepresentativeAs(actor, { ...base, role: "TITULAR", personId: null });
    expect(await listRepresentatives(termId, a3)).toEqual([]);
  });

  it("al cerrar una asamblea calcula qué comités estuvieron representados y con qué excusas", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const ius = await seedCommittee("ius", "IUS");
    const gh = await seedMember("gh@eafit.edu.co");
    const generalA3 = await seedMember("general@eafit.edu.co");
    const miembroA3 = await seedMember("miembro@eafit.edu.co");
    const suplentePixel = await seedMember("suplente@eafit.edu.co");
    const miembroPixel = await seedMember("otro@eafit.edu.co");
    const miembroIus = await seedMember("ius@eafit.edu.co");
    await seedCommitteeMembership(generalA3, a3, termId, "GENERAL");
    await seedCommitteeMembership(miembroA3, a3, termId);
    await seedCommitteeMembership(suplentePixel, pixel, termId);
    await seedCommitteeMembership(miembroPixel, pixel, termId);
    await seedCommitteeMembership(miembroIus, ius, termId);
    const actor = { personId: gh, ip: null };
    await setRepresentativeAs(actor, {
      committeeId: pixel,
      termId,
      role: "SUPLENTE",
      personId: suplentePixel,
    });

    // Primera asamblea: A3 por su General (sin representante nombrado), Pixel por su suplente,
    // IUS sin nadie de la mesa aunque un miembro raso asistió.
    const first = await assembly(termId, "Primera", 10);
    await seedCheckIn(first.id, generalA3);
    await seedCheckIn(first.id, suplentePixel);
    await seedCheckIn(first.id, miembroIus);
    expect(await recomputeCommitteeAssembly(first.id)).toBe(0); // abierta todavía
    await runCommand(SYSTEM_ACTOR, (ctx) => closeOccasion(ctx, first.id));
    await drainOutbox();
    const rows = await db()
      .select()
      .from(committeeAssemblyAttendance)
      .where(eq(committeeAssemblyAttendance.occasionId, first.id));
    const byCommittee = new Map(rows.map((row) => [row.committeeId, row]));
    expect(byCommittee.get(a3)).toMatchObject({ represented: true, representedById: generalA3 });
    expect(byCommittee.get(pixel)).toMatchObject({
      represented: true,
      representedById: suplentePixel,
    });
    expect(byCommittee.get(ius)).toMatchObject({ represented: false, excused: false });
    expect((await listAssemblyRepresentation(termId)).get(first.id)).toMatchObject({
      represented: 2,
      total: 3,
    });

    // Segunda asamblea: nadie de A3; el suplente de Pixel con excusa aceptada; IUS de nuevo sin mesa.
    const second = await assembly(termId, "Segunda", 3);
    await db().insert(checkIn).values({
      occasionId: second.id,
      personId: suplentePixel,
      status: "EXCUSED",
      source: "ADMIN",
    });
    await runCommand(SYSTEM_ACTOR, (ctx) => closeOccasion(ctx, second.id));
    await drainOutbox();
    const summary = await listCommitteeRepresentation(termId);
    const of = (id: string) => summary.find((row) => row.committeeId === id);
    expect(of(a3)).toMatchObject({
      assemblies: 2,
      represented: 1,
      unexcused: 1,
      excused: 0,
      ladder: 1,
    });
    expect(of(pixel)).toMatchObject({
      assemblies: 2,
      represented: 1,
      unexcused: 0,
      excused: 1,
      ladder: 0,
      suplente: expect.objectContaining({ personId: suplentePixel }),
    });
    expect(of(ius)).toMatchObject({ assemblies: 2, represented: 0, unexcused: 2, ladder: 2 });

    // Un check-in aprobado después del cierre vuelve a calcular la asamblea.
    await seedCheckIn(second.id, generalA3);
    await recomputeCommitteeAssembly(second.id);
    const [a3Second] = await db()
      .select()
      .from(committeeAssemblyAttendance)
      .where(
        and(
          eq(committeeAssemblyAttendance.occasionId, second.id),
          eq(committeeAssemblyAttendance.committeeId, a3),
        ),
      );
    expect(a3Second).toMatchObject({ represented: true, representedById: generalA3 });
    expect(of(a3)?.ladder).toBe(1);
    expect(
      (await listCommitteeRepresentation(termId)).find((row) => row.committeeId === a3),
    ).toMatchObject({ unexcused: 0, ladder: 0 });
  });

  // ADR-118 regla 6 (DT-202): todo cierre de pertenencia retira la representación de ese comité. La
  // asamblea se cierra después: las ya cerradas no se recalculan (decisión abierta 39).
  interface Salida {
    gh: { personId: string; ip: null };
    titular: string;
    a3: string;
    pixel: string;
    termId: string;
  }
  const salidas: Array<[string, (salida: Salida) => Promise<unknown>]> = [
    [
      "GH la pasa a otro comité",
      ({ gh, titular, pixel, termId }) =>
        setCommitteeMembershipsAs(gh, titular, termId, [{ committeeId: pixel }]),
    ],
    [
      "el cierre de permanencia la saca del comité",
      ({ gh, titular, a3, termId }) => leaveCommitteeAs(gh, titular, a3, termId, "Cierre"),
    ],
    [
      "se da de baja",
      ({ gh, titular }) =>
        endMembershipAs(gh, titular, {
          endReason: "RESIGNATION",
          memorialConsent: false,
          contactConsent: false,
        }),
    ],
    [
      "pide que borren sus datos",
      async ({ gh, titular }) => {
        await requestDeletionAs({ personId: titular, ip: null });
        await anonymizePersonAs(gh, titular);
      },
    ],
  ];

  it.each(
    salidas,
  )("la titular deja de representar a su comité cuando %s, aunque haya asistido a la asamblea", async (_caso, salir) => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
    const titular = await seedMember("titular@eafit.edu.co");
    const queda = await seedMember("queda@eafit.edu.co");
    await seedCommitteeMembership(titular, a3, termId);
    await seedCommitteeMembership(queda, a3, termId);
    await setRepresentativeAs(gh, { committeeId: a3, termId, role: "TITULAR", personId: titular });
    const asamblea = await assembly(termId, "Asamblea", 1);
    await seedCheckIn(asamblea.id, titular);

    await salir({ gh, titular, a3, pixel, termId });

    await runCommand(SYSTEM_ACTOR, (ctx) => closeOccasion(ctx, asamblea.id));
    await recomputeCommitteeAssembly(asamblea.id);
    const [fila] = await db()
      .select()
      .from(committeeAssemblyAttendance)
      .where(
        and(
          eq(committeeAssemblyAttendance.occasionId, asamblea.id),
          eq(committeeAssemblyAttendance.committeeId, a3),
        ),
      );
    expect(fila).toMatchObject({ represented: false, representedById: null });
    expect(await listRepresentatives(termId, a3)).toEqual([]);
    // El retiro queda en la auditoría del comité, igual que un nombramiento.
    const rastro = await db()
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.action, "committee-representative.set"), eq(auditLog.entityId, a3)));
    expect(rastro.map((row) => (row.after as { personId: string | null }).personId)).toEqual(
      expect.arrayContaining([titular, null]),
    );
  });
});
