import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { interaction } from "@/modules/crm/schema";
import {
  adjustPointsAs,
  checkInSelfAs,
  closeOccasionAs,
  reverseEntryAs,
} from "@/modules/participation/domain/commands";
import {
  balanceFor,
  listEntriesForPerson,
  listLedger,
} from "@/modules/participation/domain/ledger";
import { peopleBoards, rankCommittees } from "@/modules/participation/domain/rankings";
import { membership } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { DomainError } from "@/shared/lib/errors";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const db = () => getDb();

describe("tableros y ledger manual", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("separa nuevos y veteranos por el primer término, solo activos, con empates 1, 1, 3, 3 y puesto propio", async () => {
    const termId = await seedTerm(currentTermCode());
    const oldTermId = await seedTerm("2019-1");
    const nueva = await seedMember("nueva@eafit.edu.co", { firstName: "Nueva", lastName: "Uno" });
    const nuevo2 = await seedMember("nuevo2@eafit.edu.co", { firstName: "Nuevo", lastName: "Dos" });
    const sinPuntos = await seedMember("sin@eafit.edu.co", {
      firstName: "Sin",
      lastName: "Puntos",
    });
    const veterana = await seedMember("vet@eafit.edu.co", { firstName: "Vete", lastName: "Rana" });
    const licencia = await seedMember("lic@eafit.edu.co", {
      firstName: "En",
      lastName: "Licencia",
    });
    await db()
      .update(membership)
      .set({ firstTermId: oldTermId })
      .where(eq(membership.personId, veterana));
    await db()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, licencia));
    const admin = await seedMember("admin@eafit.edu.co");
    await adjustPointsAs(
      { personId: admin, ip: null },
      { personId: nueva, termId, points: 30, reason: "bono" },
    );
    await adjustPointsAs(
      { personId: admin, ip: null },
      { personId: nuevo2, termId, points: 30, reason: "bono" },
    );
    await adjustPointsAs(
      { personId: admin, ip: null },
      { personId: veterana, termId, points: 50, reason: "bono" },
    );
    await adjustPointsAs(
      { personId: admin, ip: null },
      { personId: licencia, termId, points: 99, reason: "bono" },
    );

    const nuevos = await peopleBoards(termId).rank("NEW");
    expect(nuevos.map((item) => [item.rank, item.row.name, item.total])).toEqual([
      [1, "Nueva Uno", 30],
      [1, "Nuevo Dos", 30],
      [3, "Persona Sintética", 0],
      [3, "Sin Puntos", 0],
    ]);
    const veteranos = await peopleBoards(termId).rank("VETERAN");
    expect(veteranos.map((item) => item.row.name)).toEqual(["Vete Rana"]);
    const mine = await peopleBoards(termId).position(sinPuntos, termId);
    expect(mine).toEqual({ board: "NEW", rank: null, total: 0, of: 2 });
    const hers = await peopleBoards(termId).position(nueva, termId);
    expect(hers.rank).toBe(1);
  });

  it("ajusta con motivo, revierte una sola vez, no revierte asistencias ni con el término cerrado", async () => {
    const termId = await seedTerm(currentTermCode());
    const admin = await seedMember("admin@eafit.edu.co");
    const personId = await seedMember("socia@eafit.edu.co");
    await expect(
      adjustPointsAs({ personId: admin, ip: null }, { personId, termId, points: 0, reason: "x" }),
    ).rejects.toThrow(t("T-627"));
    await expect(
      adjustPointsAs({ personId: admin, ip: null }, { personId, termId, points: 5, reason: "  " }),
    ).rejects.toThrow(t("T-628"));
    const adjustment = await adjustPointsAs(
      { personId: admin, ip: null },
      { personId, termId, points: -5, reason: "penalización" },
    );
    expect(await balanceFor(personId, termId)).toBe(-5);
    const { publicId } = await seedOccasion(termId, { points: 10 });
    await checkInSelfAs({ personId, ip: null }, { publicId });
    const entries = await listEntriesForPerson(personId);
    const checkInEntry = entries.find((entry) => entry.kind === "CHECKIN");
    if (!checkInEntry) throw new Error("sin crédito");
    await expect(
      reverseEntryAs({ personId: admin, ip: null }, checkInEntry.id, "no"),
    ).rejects.toThrow(t("T-632"));
    await reverseEntryAs({ personId: admin, ip: null }, adjustment.id, "fue un error");
    expect(await balanceFor(personId, termId)).toBe(10);
    await expect(
      reverseEntryAs({ personId: admin, ip: null }, adjustment.id, "otra vez"),
    ).rejects.toThrow(t("T-633"));
    const ledger = await listLedger({ personId, page: 1, pageSize: 10 });
    expect(ledger.total).toBe(3);
    expect(ledger.rows.find((row) => row.id === adjustment.id)?.reversedById).toBeTruthy();
    await drainOutbox();
    const timeline = await db()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(summaries).toContain(fillCopy(tList("T-667")[4], { n: -5, motivo: "penalización" }));
    expect(summaries).toContain(fillCopy(tList("T-667")[5], { n: -5, motivo: "fue un error" }));
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));
    await expect(
      adjustPointsAs(
        { personId: admin, ip: null },
        { personId, termId, points: 5, reason: "tarde" },
      ),
    ).rejects.toThrow(t("T-629"));
    await expect(
      reverseEntryAs({ personId: admin, ip: null }, adjustment.id, "tarde"),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("el ranking de comités promedia la tasa suavizada solo de las ocasiones cerradas con puntos", async () => {
    const termId = await seedTerm(currentTermCode());
    const c1 = await seedCommittee("c1");
    const c2 = await seedCommittee("c2");
    const a = await seedMember("a@eafit.edu.co");
    const b = await seedMember("b@eafit.edu.co");
    const c = await seedMember("c@eafit.edu.co");
    await seedCommitteeMembership(a, c1, termId);
    await seedCommitteeMembership(b, c1, termId);
    await seedCommitteeMembership(c, c2, termId);
    const closed = await seedOccasion(termId, { points: 10 });
    const open = await seedOccasion(termId, { points: 10 });
    await checkInSelfAs({ personId: a, ip: null }, { publicId: closed.publicId });
    await checkInSelfAs({ personId: c, ip: null }, { publicId: closed.publicId });
    await checkInSelfAs({ personId: c, ip: null }, { publicId: open.publicId });
    await closeOccasionAs({ personId: a, ip: null }, closed.id);
    await drainOutbox();
    const ranking = await rankCommittees(termId);
    expect(ranking.map((item) => [item.rank, item.row.committeeId, item.row.occasions])).toEqual([
      [1, c2, 1],
      [2, c1, 1],
    ]);
    expect(ranking[0]?.row.rawScore).toBe(1);
    expect(ranking[1]?.row.rawScore).toBe(0.5);
    expect(ranking[0]?.row.score).toBeGreaterThan(ranking[1]?.row.score ?? 0);
  });
});
