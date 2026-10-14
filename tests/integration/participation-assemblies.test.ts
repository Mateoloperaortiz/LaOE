import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personAnonymized } from "@/domain-events/people";
import { task } from "@/modules/crm/schema";
import { assembliesResource } from "@/modules/participation/admin";
import {
  adjustRequirement,
  assemblyOverview,
  assemblyStatusFor,
} from "@/modules/participation/domain/assemblies";
import { closingSummary, getTermStanding } from "@/modules/participation/domain/closing";
import {
  adjustPointsAs,
  adjustRequirementAs,
  checkInSelfAs,
  closeOccasionAs,
  closeTermPointsAs,
} from "@/modules/participation/domain/commands";
import { getOccasion } from "@/modules/participation/domain/occasions";
import { occasion } from "@/modules/participation/schema";
import { membership, person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { getTerm } from "@/modules/terms/domain/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { copyExact } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const db = () => getDb();

async function termRow(id: string) {
  const row = await getTerm(id);
  if (!row) throw new Error("sin término");
  return row;
}

describe("asambleas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("deriva el requisito del término, calcula el cumplimiento y admite un ajuste con motivo", async () => {
    const termId = await seedTerm(currentTermCode());
    const current = await termRow(termId);
    const personId = await seedMember("socia@eafit.edu.co");
    const ordinary = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
      title: "Ordinaria",
    });
    const election = await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "BOARD_ELECTION",
      points: 0,
      title: "Elección",
    });
    const before = await assemblyStatusFor(personId, current);
    expect(before.requirement.adjusted).toBe(false);
    // La elección se exige cuando existe la ocasión, en cualquier semestre (ADR-060 regla 13).
    expect(before.requirement.requiresBoardElection).toBe(true);
    expect(before.compliance.compliant).toBe(false);
    expect(before.assemblies.map((item) => item.status)).toEqual([null, null]);

    await checkInSelfAs({ personId, ip: null }, { publicId: ordinary.publicId });
    await checkInSelfAs({ personId, ip: null }, { publicId: election.publicId });
    const after = await assemblyStatusFor(personId, current);
    expect(after.compliance.ordinaryAttended).toBe(1);
    expect(after.compliance.boardElectionAttended).toBe(true);
    expect(after.compliance.compliant).toBe(true);
    expect(after.compliance.attendedTotal).toBe(2);

    // Ajuste: exige dos ordinarias; deja de cumplir. Vuelve a ajustar sin duplicar filas.
    await expect(
      adjustRequirementAs(
        { personId, ip: null },
        {
          termId,
          personId,
          requiredOrdinary: 2,
          requiresBoardElection: true,
          requiresRunoff: false,
          reason: " ",
        },
      ),
    ).rejects.toThrow(t("T-628"));
    await adjustRequirementAs(
      { personId, ip: null },
      {
        termId,
        personId,
        requiredOrdinary: 2,
        requiresBoardElection: true,
        requiresRunoff: false,
        reason: "ingreso tardío",
      },
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      adjustRequirement(ctx, {
        termId,
        personId,
        requiredOrdinary: 1,
        requiresBoardElection: false,
        requiresRunoff: false,
        reason: "licencia",
      }),
    );
    const adjusted = await assemblyStatusFor(personId, current);
    expect(adjusted.requirement).toMatchObject({
      requiredOrdinary: 1,
      requiresBoardElection: false,
      adjusted: true,
      reason: "licencia",
    });
    expect(adjusted.compliance.compliant).toBe(true);
    const [audits] = await db()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.action, "assembly-requirement.adjusted"));
    expect(audits?.n).toBe(2);

    const overview = await assemblyOverview(current);
    expect(
      overview.map((row) => [row.personId, row.requirement.adjusted, row.compliance.compliant]),
    ).toEqual([[personId, true, true]]);
  });

  it("la mesa de GH y su exporte le ponen a quien no tiene ajuste el requisito del término: sus ordinarias y cada especial que exista sin cancelar", async () => {
    const termId = await seedTerm(currentTermCode());
    // Dos ordinarias y no la que trae un término por defecto: el número sale del término.
    await db().update(term).set({ requiredOrdinaryAssemblies: 2 }).where(eq(term.id, termId));
    const current = await termRow(termId);
    const unadjusted = await seedMember("sin-ajuste@eafit.edu.co", {
      firstName: "Ana",
      lastName: "Sin Ajuste",
    });
    const adjusted = await seedMember("ajustado@eafit.edu.co", {
      firstName: "Beto",
      lastName: "Ajustado",
    });
    // La elección en borrador ya existe y se exige; la segunda vuelta cancelada no exige nada.
    await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "BOARD_ELECTION",
      status: "DRAFT",
      points: 0,
      title: "Elección",
    });
    await seedOccasion(termId, {
      kind: "ASSEMBLY",
      assemblyKind: "RUNOFF",
      status: "CANCELLED",
      points: 0,
      title: "Segunda vuelta",
    });
    // El ajuste dice lo contrario del término en sus tres valores: ninguno se le pega al otro.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      adjustRequirement(ctx, {
        termId,
        personId: adjusted,
        requiredOrdinary: 0,
        requiresBoardElection: false,
        requiresRunoff: true,
        reason: "licencia",
      }),
    );

    const overview = await assemblyOverview(current);
    const termRequirement = {
      requiredOrdinary: 2,
      requiresBoardElection: true,
      requiresRunoff: false,
      adjusted: false,
      reason: null,
    };
    expect(overview.map((row) => [row.personId, row.requirement])).toEqual([
      [unadjusted, termRequirement],
      [
        adjusted,
        {
          requiredOrdinary: 0,
          requiresBoardElection: false,
          requiresRunoff: true,
          adjusted: true,
          reason: "licencia",
        },
      ],
    ]);
    // Ese requisito es el que decide qué le falta a cada quien, y es el mismo que ve el miembro.
    expect(overview.map((row) => row.compliance.missing)).toEqual([
      ["ORDINARY", "BOARD_ELECTION"],
      ["RUNOFF"],
    ]);
    expect((await assemblyStatusFor(unadjusted, current)).requirement).toEqual(termRequirement);

    const listed = await assembliesResource.list({
      q: "",
      page: 1,
      pageSize: 100,
      filters: { termId },
    });
    expect(listed.rows.map((row) => assembliesResource.exportRow(row))).toEqual([
      {
        nombre: "Ana Sin Ajuste",
        ordinarias_requeridas: 2,
        ordinarias_firmadas: 0,
        eleccion_requerida: "si",
        eleccion_firmada: "no",
        segunda_vuelta_requerida: "no",
        segunda_vuelta_firmada: "no",
        cumple: "no",
        ajustado: "no",
      },
      {
        nombre: "Beto Ajustado",
        ordinarias_requeridas: 0,
        ordinarias_firmadas: 0,
        eleccion_requerida: "no",
        eleccion_firmada: "no",
        segunda_vuelta_requerida: "si",
        segunda_vuelta_firmada: "no",
        cumple: "no",
        ajustado: "si",
      },
    ]);
  });

  it("cierra los puntos: bloquea con ocasiones abiertas, congela el standing y rechaza ajustes después", async () => {
    const termId = await seedTerm(currentTermCode());
    const oldTermId = await seedTerm("2019-1");
    const admin = await seedMember("admin@eafit.edu.co", { firstName: "Admin", lastName: "GH" });
    const nueva = await seedMember("nueva@eafit.edu.co", { firstName: "Nueva", lastName: "Uno" });
    const veterano = await seedMember("vet@eafit.edu.co", { firstName: "Vete", lastName: "Rano" });
    await db()
      .update(membership)
      .set({ firstTermId: oldTermId })
      .where(eq(membership.personId, veterano));
    const committeeId = await seedCommittee("c1");
    await seedCommitteeMembership(nueva, committeeId, termId);
    const open = await seedOccasion(termId, { points: 10, title: "Abierta" });
    await checkInSelfAs({ personId: nueva, ip: null }, { publicId: open.publicId });
    await adjustPointsAs(
      { personId: admin, ip: null },
      { personId: veterano, termId, points: 25, reason: "bono" },
    );

    await expect(closeTermPointsAs({ personId: admin, ip: null }, termId)).rejects.toThrow(
      t("T-646", { n: 1 }),
    );
    await closeOccasionAs({ personId: admin, ip: null }, open.id);
    await drainOutbox();
    const summary = await closingSummary(termId);
    expect(summary).toEqual({
      openOccasions: 0,
      pendingCheckIns: 0,
      pendingParticipations: 0,
      reservedRewards: 0,
      membersWithPoints: 2,
      pointsAwarded: 35,
    });

    await closeTermPointsAs({ personId: admin, ip: null }, termId);
    expect((await termRow(termId)).pointsClosedAt).toBeInstanceOf(Date);
    const standing = await getTermStanding(termId);
    if (!standing) throw new Error("sin standing");
    expect(standing.topNew.map((item) => [item.rank, item.name, item.total])).toEqual([
      [1, "Nueva Uno", 10],
    ]);
    expect(standing.topVeteran.map((item) => [item.rank, item.name, item.total])).toEqual([
      [1, "Vete Rano", 25],
    ]);
    expect(standing.topCommittees.map((item) => item.committeeId)).toEqual([committeeId]);
    expect(standing.stats).toMatchObject({
      activeMembers: 3,
      newMembers: 2,
      occasions: 1,
      checkIns: 1,
      pointsAwarded: 35,
    });
    const events = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "term.points-closed"));
    expect(events).toHaveLength(1);

    await expect(closeTermPointsAs({ personId: admin, ip: null }, termId)).rejects.toThrow(
      t("T-629"),
    );
    await expect(
      adjustPointsAs(
        { personId: admin, ip: null },
        { personId: nueva, termId, points: 5, reason: "tarde" },
      ),
    ).rejects.toThrow(t("T-629"));
    const closedOccasion = await getOccasion(open.id);
    expect(closedOccasion?.status).toBe("CLOSED");

    // Al anonimizar, el nombre congelado pasa a "Egresado" por el handler de participation.
    await db().update(person).set({ anonymizedAt: new Date() }).where(eq(person.id, nueva));
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      ctx.emit(eventOf(personAnonymized, { actorId: null, personId: nueva })),
    );
    await drainOutbox();
    const scrubbed = await getTermStanding(termId);
    expect(scrubbed?.topNew[0]?.name).toBe(t("T-223"));
    expect(scrubbed?.topVeteran[0]?.name).toBe("Vete Rano");
  });

  it("los programados cierran solo las ocasiones vencidas y avisan una sola vez si falta el término siguiente", async () => {
    const termId = await seedTerm(currentTermCode());
    const stale = await seedOccasion(termId, {
      title: "Vencida",
      checkInOpensAt: new Date(Date.now() - 48 * 3_600_000),
      checkInClosesAt: new Date(Date.now() - 25 * 3_600_000),
    });
    const recent = await seedOccasion(termId, {
      title: "Recién cerrada",
      checkInOpensAt: new Date(Date.now() - 3 * 3_600_000),
      checkInClosesAt: new Date(Date.now() - 3_600_000),
    });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      ctx.emit({ type: "participation.auto-close", payload: {} }),
    );
    await drainOutbox();
    expect((await getOccasion(stale.id))?.status).toBe("CLOSED");
    expect((await getOccasion(recent.id))?.status).toBe("OPEN");

    // El término termina en diez días y no existe el siguiente: una sola tarea aunque corra dos veces.
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await db().update(term).set({ endsOn: soon }).where(eq(term.id, termId));
    for (let run = 0; run < 2; run += 1) {
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        ctx.emit({ type: "participation.term-check", payload: { run } }),
      );
      await drainOutbox();
    }
    const tasks = await db().select().from(task).where(eq(task.kind, "GENERAL"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toMatch(copyExact("T-666"));
    const [occasions] = await db().select({ n: count() }).from(occasion);
    expect(occasions?.n).toBe(2);
  });
});
