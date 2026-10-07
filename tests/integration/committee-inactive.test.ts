import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createRequestAs } from "@/modules/crm";
import {
  checkInSelfAs,
  closeOccasionAs,
  listCommitteeRepresentation,
  rankCommittees,
  recomputeCommitteeAssembly,
} from "@/modules/participation";
import {
  committeeAssemblyAttendance,
  committeeParticipation,
} from "@/modules/participation/schema";
import {
  listCommitteesForSelection,
  listLiveCommitteeIds,
  setCommitteeMemberships,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
  seedVeteran,
} from "./factories";

// Un comité desactivado sale de la app (ADR-073): no se ofrece para elegir, no recibe pertenencias
// nuevas, no compite en el ranking y no acumula faltas de asamblea; lo que ya existe se puede cerrar.

const db = () => getDb();

describe("comité desactivado", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("no se ofrece para elegir, salvo que el registro que se edita ya lo tenga", async () => {
    const a3 = await seedCommittee("a3");
    const eco = await seedCommittee("eco", "ECO", { status: "ON_TRIAL" });
    const sos = await seedCommittee("sos", "SOS", { status: "INACTIVE" });

    expect((await listCommitteesForSelection()).map((item) => item.id).sort()).toEqual(
      [a3, eco].sort(),
    );
    expect((await listCommitteesForSelection([sos])).map((item) => item.id).sort()).toEqual(
      [a3, eco, sos].sort(),
    );
    const live = await listLiveCommitteeIds();
    expect(live.has(a3)).toBe(true);
    expect(live.has(eco)).toBe(true);
    expect(live.has(sos)).toBe(false);
  });

  it("no recibe pertenencias nuevas, pero la que ya existe se conserva y se cierra", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const sos = await seedCommittee("sos", "SOS", { status: "INACTIVE" });
    // La pertenencia vieja quedó abierta cuando el comité todavía existía.
    const quedaba = await seedVeteran("queda@eafit.edu.co");
    await seedCommitteeMembership(quedaba, sos, termId);
    await seedCommitteeMembership(quedaba, a3, termId);

    // Conservarla no es entrar: la lista repite lo que ya estaba abierto.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, quedaba, termId, [
        { committeeId: a3, roleCode: "MIEMBRO", transferredIn: false },
        { committeeId: sos, roleCode: "MIEMBRO", transferredIn: false },
      ]),
    );

    // Salir nunca se bloquea.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setCommitteeMemberships(ctx, quedaba, termId, [
        { committeeId: a3, roleCode: "MIEMBRO", transferredIn: false },
      ]),
    );

    // Reabrir la misma pertenencia ya no se puede.
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        setCommitteeMemberships(ctx, quedaba, termId, [
          { committeeId: a3, roleCode: "MIEMBRO", transferredIn: false },
          { committeeId: sos, roleCode: "MIEMBRO", transferredIn: false },
        ]),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2618", { comité: "SOS" })) });

    // Y nadie nuevo entra.
    const otra = await seedVeteran("otra@eafit.edu.co");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        setCommitteeMemberships(ctx, otra, termId, [
          { committeeId: sos, roleCode: "MIEMBRO", transferredIn: false },
        ]),
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("no compite en el ranking ni se le calculan filas nuevas", async () => {
    const termId = await seedTerm(currentTermCode());
    const a3 = await seedCommittee("a3");
    const pixel = await seedCommittee("pixel");
    const sos = await seedCommittee("sos", "SOS", { status: "INACTIVE" });
    const uno = await seedMember("uno@eafit.edu.co");
    const dos = await seedMember("dos@eafit.edu.co");
    const tres = await seedMember("tres@eafit.edu.co");
    await seedCommitteeMembership(uno, a3, termId);
    await seedCommitteeMembership(dos, pixel, termId);
    // Quedó activo en el comité desactivado, como pasó en producción antes del arreglo.
    await seedCommitteeMembership(tres, sos, termId);
    const ocasion = await seedOccasion(termId, { points: 10 });
    await checkInSelfAs({ personId: uno }, { publicId: ocasion.publicId });
    await closeOccasionAs({ personId: uno }, ocasion.id);
    await drainOutbox();

    const filas = await db()
      .select()
      .from(committeeParticipation)
      .where(eq(committeeParticipation.committeeId, sos));
    expect(filas).toHaveLength(0);
    const ranking = await rankCommittees(termId);
    expect(ranking.map((item) => [item.rank, item.row.committeeId])).toEqual([
      [1, a3],
      [2, pixel],
    ]);
  });

  it("no acumula faltas de asamblea ni aparece en la escalera del término", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const sos = await seedCommittee("sos", "SOS", { status: "INACTIVE" });
    const uno = await seedMember("uno@eafit.edu.co");
    const tres = await seedMember("tres@eafit.edu.co");
    await seedCommitteeMembership(uno, a3, termId);
    await seedCommitteeMembership(tres, sos, termId);
    const startsAt = new Date(Date.now() - 86_400_000);
    const asamblea = await seedOccasion(termId, {
      title: "Asamblea ordinaria",
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      status: "OPEN",
      startsAt,
      checkInOpensAt: new Date(startsAt.getTime() - 3_600_000),
      checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
    });
    await closeOccasionAs({ personId: uno }, asamblea.id);
    await recomputeCommitteeAssembly(asamblea.id);

    const filas = await db()
      .select()
      .from(committeeAssemblyAttendance)
      .where(eq(committeeAssemblyAttendance.occasionId, asamblea.id));
    expect(filas.map((row) => row.committeeId)).toEqual([a3]);
    const escalera = await listCommitteeRepresentation(termId);
    expect(escalera.map((row) => row.committeeSlug)).toEqual(["a3"]);
  });

  it("la solicitud de transferencia no lo acepta como destino", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3");
    const sos = await seedCommittee("sos", "SOS", { status: "INACTIVE" });
    const personId = await seedVeteran("pide@eafit.edu.co");
    await seedCommitteeMembership(personId, a3, termId);

    await expect(
      createRequestAs({ personId }, "TRANSFER", {
        leaveCommitteeIds: [a3],
        joinCommitteeIds: [sos],
        reason: "Me interesa más ese comité",
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining(t("T-2618", { comité: "SOS" })) });
  });
});
