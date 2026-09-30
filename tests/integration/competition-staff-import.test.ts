import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  assignStaffAs,
  type CompetitionActor,
  competitionRoles,
  createCompetitionAs,
  createTeamAs,
  declarePowerAs,
  generateDayScheduleAs,
  getLiveRotations,
  type ImportStaffResult,
  importStaffSheetAs,
  judgeView,
  listMyCompetitionRoles,
  listStaff,
  listStaffFor,
  listStandings,
  listSupport,
  recordResultAs,
  removeSupportAs,
  saveBaseAs,
  setCompetitionStatusAs,
  startMatchupAs,
  startRotationAs,
} from "@/modules/competition";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { addMacroeventDirector } from "@/modules/people/domain/appointments";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember, seedTerm, seedVeteran } from "./factories";

// El personal desde la hoja del GAP (ADR-101): revisar y guardar por jornada, reemplazar solo esa
// jornada, la huella de la revisión, los permisos y, sobre todo, que el apoyo de una base no dé
// ningún acceso. Todos los nombres son inventados.

const admin = (personId: string): CompetitionActor => ({ personId, isAdmin: true });
const member = (personId: string): CompetitionActor => ({ personId, isAdmin: false });

async function seedDiasEdition(): Promise<string> {
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "dias-eafit",
      name: "Días EAFIT",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-09-28T13:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return edicion.id;
}

/** Una competencia con 30 equipos y 15 bases por jornada: «Base 1» a «Base 15» el jueves y
 *  «Base 16» a «Base 30» el viernes, como en producción. */
async function seedGames() {
  const termId = await seedTerm();
  const editionId = await seedDiasEdition();
  const adminId = await seedMember("admin-personal@example.com");
  const { id } = await createCompetitionAs(admin(adminId), {
    editionId,
    slug: "the-games-2026",
    name: "The Games 2026",
  });
  for (let n = 1; n <= 30; n++) {
    await createTeamAs(admin(adminId), id, { number: n, name: `Equipo ${n}` });
  }
  const bases: Record<1 | 2, string[]> = { 1: [], 2: [] };
  for (const day of [1, 2] as const) {
    for (let i = 0; i < 15; i++) {
      const { id: baseId } = await saveBaseAs(admin(adminId), id, null, {
        day,
        orderIndex: i,
        name: `Base ${(day - 1) * 15 + i + 1}`,
        kind: "NORMAL",
      });
      bases[day].push(baseId);
    }
  }
  const people = {
    ana: await seedMember("ana.ensayo@example.com", {
      firstName: "Ana María",
      lastName: "de Ensayo Pérez",
    }),
    luis: await seedMember("luis.prueba@example.com", {
      firstName: "Luis Felipe",
      lastName: "Prueba Gómez",
    }),
    sara: await seedMember("sara.ensayo@example.com", {
      firstName: "Sara",
      lastName: "Ensayo Sánchez",
    }),
    tomas: await seedMember("tomas.prueba@example.com", { firstName: "Tomás", lastName: "Prueba" }),
    vale: await seedMember("valentina.muestra@example.com", {
      firstName: "Valentina",
      lastName: "Muestra Arango",
    }),
    nico: await seedMember("nico.muestra@example.com", {
      firstName: "Nicolás",
      lastName: "Muestra Ríos",
    }),
  };
  return { id, editionId, termId, adminId, bases, people };
}

const THURSDAY = [
  "PERSONA\tBASE\tFUNCION",
  "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER DE BASE",
  "LUIS PRUEBA GOMEZ\t\tCALIFICADOR",
  "SARA ENSAYO SANCHEZ\t\tVEEDORES",
  "TOMÁS PRUEBA\t2\tLIDER DE BASE ",
  "valentina.muestra@example.com\t\tVAR",
].join("\n");

async function load(
  actor: CompetitionActor,
  id: string,
  day: 1 | 2,
  text: string,
): Promise<ImportStaffResult> {
  const preview = await importStaffSheetAs(actor, id, { day, text });
  expect(preview.errors).toEqual([]);
  return importStaffSheetAs(actor, id, { day, text, fingerprint: preview.fingerprint });
}

async function importAudits() {
  return getDb().select().from(auditLog).where(eq(auditLog.action, "competition.staff.import"));
}

describe("personal desde la hoja del GAP", () => {
  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(() => closeDb());

  it("revisa sin guardar, guarda con la huella y reemplaza solo esa jornada", async () => {
    const { id, adminId, bases, people } = await seedGames();
    const operatorId = await seedMember("operador-personal@example.com");
    await assignStaffAs(admin(adminId), id, { personId: operatorId, role: "OPERATOR" });

    const preview = await importStaffSheetAs(admin(adminId), id, { day: 1, text: THURSDAY });
    expect(preview.saved).toBe(false);
    expect(preview.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.summary).toMatchObject({
      bases: 2,
      leaders: 2,
      graders: 1,
      overseers: 1,
      vars: 1,
      added: 5,
      removed: 0,
    });
    expect(preview.preview?.bases[0]).toMatchObject({
      name: "Base 1",
      leaders: ["Ana María de Ensayo Pérez"],
      graders: ["Luis Felipe Prueba Gómez"],
      overseers: ["Sara Ensayo Sánchez"],
      vars: [],
    });
    expect(preview.preview?.partial).toEqual([
      t("T-3133", { linea: 3, hoja: "LUIS PRUEBA GOMEZ", nombre: "Luis Felipe Prueba Gómez" }),
    ]);
    // Las bases 3 a 15 quedan sin líder: es un aviso, no un error.
    expect(preview.preview?.warnings).toContain(t("T-3136", { base: "Base 3" }));
    expect(await listSupport(id)).toEqual([]);

    const saved = await importStaffSheetAs(admin(adminId), id, {
      day: 1,
      text: THURSDAY,
      fingerprint: preview.fingerprint,
    });
    expect(saved).toMatchObject({ saved: true, unchanged: false });
    const staff = await listStaff(id);
    expect(
      staff
        .filter((row) => row.role === "JUDGE")
        .map((row) => [row.personId, row.baseId])
        .sort(),
    ).toEqual(
      [
        [people.ana, bases[1][0]],
        [people.tomas, bases[1][1]],
      ].sort(),
    );
    expect(staff.some((row) => row.role === "OPERATOR" && row.personId === operatorId)).toBe(true);
    const support = await listSupport(id);
    expect(support.map((row) => [row.personId, row.baseId, row.role]).sort()).toEqual(
      [
        [people.luis, bases[1][0], "GRADER"],
        [people.sara, bases[1][0], "OVERSEER"],
        [people.vale, bases[1][1], "VAR"],
      ].sort(),
    );

    // La auditoría lleva ids y conteos, nunca nombres.
    const [audit] = await importAudits();
    const logged = JSON.stringify(audit);
    expect(logged).toContain(people.ana);
    expect(logged).not.toContain("Ensayo");
    expect(logged).not.toContain("Prueba");

    // El viernes va aparte y no toca el jueves.
    await load(admin(adminId), id, 2, "NICOLÁS MUESTRA RÍOS;16;LIDER\nSARA ENSAYO SANCHEZ;;VAR");
    expect((await listSupport(id)).length).toBe(4);

    // Otra hoja del jueves: Tomás sale, Nicolás entra a la base 2 y lo demás sigue con su fila.
    const before = await listSupport(id);
    const graderRow = before.find((row) => row.personId === people.luis)?.id;
    const changed = THURSDAY.replace(
      "TOMÁS PRUEBA\t2\tLIDER DE BASE ",
      "NICOLAS MUESTRA RIOS\t2\tLIDER",
    );
    const second = await load(admin(adminId), id, 1, changed);
    expect(second.summary).toMatchObject({ added: 1, removed: 1, kept: 4 });
    const after = await listStaff(id);
    expect(after.some((row) => row.personId === people.tomas)).toBe(false);
    expect(
      after
        .filter((row) => row.personId === people.nico)
        .map((row) => row.baseId)
        .sort(),
    ).toEqual([bases[1][1], bases[2][0]].sort());
    expect((await listSupport(id)).find((row) => row.personId === people.luis)?.id).toBe(graderRow);
    expect(after.some((row) => row.role === "OPERATOR")).toBe(true);

    // La misma hoja otra vez no cambia nada ni se audita.
    const audits = (await importAudits()).length;
    const again = await load(admin(adminId), id, 1, changed);
    expect(again).toMatchObject({ saved: true, unchanged: true });
    expect((await importAudits()).length).toBe(audits);
  });

  it("una revisión vieja no guarda y devuelve la nueva", async () => {
    const { id, adminId, bases, people } = await seedGames();
    const preview = await importStaffSheetAs(admin(adminId), id, { day: 1, text: THURSDAY });
    await assignStaffAs(admin(adminId), id, {
      personId: people.nico,
      role: "JUDGE",
      baseId: bases[1][4],
    });
    const stale = await importStaffSheetAs(admin(adminId), id, {
      day: 1,
      text: THURSDAY,
      fingerprint: preview.fingerprint,
    });
    expect(stale).toMatchObject({ saved: false, stale: true });
    expect(stale.fingerprint).not.toBe(preview.fingerprint);
    expect(stale.preview?.removals).toEqual(["Nicolás Muestra Ríos · Líder · Base 5"]);
    expect(await listSupport(id)).toEqual([]);
  });

  it("con un error no guarda nada y dice la línea", async () => {
    const { id, adminId } = await seedGames();
    const text = `${THURSDAY}\nNADIE DE NINGUNA PARTE\t\tVAR\nSARA ENSAYO SANCHEZ\t20\tVEEDOR`;
    const result = await importStaffSheetAs(admin(adminId), id, { day: 1, text });
    expect(result.saved).toBe(false);
    expect(result.errors).toEqual([
      t("T-3147", { linea: 7, nombre: "NADIE DE NINGUNA PARTE" }),
      t("T-3145", { linea: 8, dia: "jueves", base: 20 }),
    ]);
    expect(await listSupport(id)).toEqual([]);
    expect((await listStaff(id)).length).toBe(0);
  });

  it("cargan ADMIN y la Dirección; un operador no, ni con la competencia cerrada", async () => {
    const { id, editionId, termId, adminId } = await seedGames();
    const operatorId = await seedMember("operador-sin-carga@example.com");
    await assignStaffAs(admin(adminId), id, { personId: operatorId, role: "OPERATOR" });
    await expect(
      importStaffSheetAs(member(operatorId), id, { day: 1, text: THURSDAY }),
    ).rejects.toThrow(t("T-2765"));

    const directorId = await seedVeteran("direccion-personal@example.com");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, {
        editionId,
        termId,
        personId: directorId,
        roleCode: "THE_GAMES",
      }),
    );
    const byDirector = await load(member(directorId), id, 1, THURSDAY);
    expect(byDirector.saved).toBe(true);

    const outsiderId = await seedMember("sin-rol-personal@example.com");
    await expect(
      importStaffSheetAs(member(outsiderId), id, { day: 1, text: THURSDAY }),
    ).rejects.toThrow(t("T-2764"));

    await setCompetitionStatusAs(admin(adminId), id, "LIVE");
    await setCompetitionStatusAs(admin(adminId), id, "FINISHED");
    await expect(
      importStaffSheetAs(admin(adminId), id, { day: 1, text: THURSDAY }),
    ).rejects.toThrow(t("T-2793"));
  });

  it("el apoyo no da ningún acceso; el líder registra y ve a su equipo", async () => {
    const { id, adminId, bases, people } = await seedGames();
    await load(admin(adminId), id, 1, THURSDAY);
    await generateDayScheduleAs(admin(adminId), id, { day: 1, rotations: 15, plannedMinutes: 20 });
    const pending = await getLiveRotations(id);
    if (!pending.next) throw new Error("sin calendario");
    await startRotationAs(admin(adminId), id, pending.next.id);
    const matchup = pending.next.matchups.find((item) => item.base.id === bases[1][0]);
    if (!matchup) throw new Error("sin enfrentamiento en la base 1");

    for (const helper of [people.luis, people.sara, people.vale]) {
      expect(await competitionRoles(member(helper), id)).toEqual({
        operator: false,
        judgeBaseIds: [],
      });
      expect(await listMyCompetitionRoles(member(helper))).toEqual([]);
    }
    await expect(
      recordResultAs(member(people.luis), id, { matchupId: matchup.id, outcome: "A_WIN" }),
    ).rejects.toThrow(t("T-2764"));
    await expect(startMatchupAs(member(people.sara), id, matchup.id)).rejects.toThrow(t("T-2764"));
    await expect(
      declarePowerAs(member(people.luis), id, {
        matchupId: matchup.id,
        teamId: matchup.teamA.id,
        power: "DOUBLE_POINTS",
      }),
    ).rejects.toThrow(t("T-2764"));

    const view = await judgeView(id, people.ana);
    expect(view.bases.map((base) => base.id)).toEqual([bases[1][0]]);
    expect(view.crew.get(bases[1][0] ?? "")).toEqual({
      GRADER: ["Luis Felipe Prueba Gómez"],
      OVERSEER: ["Sara Ensayo Sánchez"],
      VAR: [],
    });
    expect(view.crew.has(bases[1][1] ?? "")).toBe(false);
    expect((await judgeView(id, people.luis)).bases).toEqual([]);

    await recordResultAs(member(people.ana), id, { matchupId: matchup.id, outcome: "A_WIN" });
    const points = async () =>
      (await listStandings(id)).overall.find((row) => row.teamId === matchup.teamA.id)?.points;
    expect(await points()).toBe(1000);

    // Ana sale de la base 1 en plena rotación: la revisión lo avisa y ella deja de registrar ahí,
    // pero su resultado queda.
    const swap = THURSDAY.replace(
      "ANA MARIA DE ENSAYO PEREZ\t1\tLIDER DE BASE",
      "NICOLAS MUESTRA RIOS\t1\tLIDER",
    );
    const preview = await importStaffSheetAs(admin(adminId), id, { day: 1, text: swap });
    expect(preview.preview?.warnings).toContain(
      t("T-3135", { base: "Base 1", nombre: "Ana María de Ensayo Pérez" }),
    );
    await importStaffSheetAs(admin(adminId), id, {
      day: 1,
      text: swap,
      fingerprint: preview.fingerprint,
    });
    await expect(
      recordResultAs(member(people.ana), id, { matchupId: matchup.id, outcome: "DRAW" }),
    ).rejects.toThrow(t("T-2764"));
    expect(await points()).toBe(1000);
    await recordResultAs(member(people.nico), id, { matchupId: matchup.id, outcome: "DRAW" });
  });

  it("Mis datos incluye el apoyo, y cualquier operador quita a alguien del apoyo", async () => {
    const { id, adminId, people } = await seedGames();
    await load(admin(adminId), id, 1, THURSDAY);
    expect(await listStaffFor(people.luis)).toEqual([
      expect.objectContaining({ competition: "The Games 2026", role: "GRADER", base: "Base 1" }),
    ]);

    const operatorId = await seedMember("operador-quita@example.com");
    await assignStaffAs(admin(adminId), id, { personId: operatorId, role: "OPERATOR" });
    const row = (await listSupport(id)).find((item) => item.personId === people.sara);
    if (!row) throw new Error("sin veedora");
    await removeSupportAs(member(operatorId), id, row.id);
    expect((await listSupport(id)).some((item) => item.personId === people.sara)).toBe(false);
    const [removal] = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "competition.support.remove"));
    expect(removal?.entityId).toBe(row.id);
    await expect(removeSupportAs(member(operatorId), id, row.id)).rejects.toThrow(t("T-2764"));
    const outsiderId = await seedMember("sin-rol-quita@example.com");
    const other = (await listSupport(id))[0];
    if (!other) throw new Error("sin apoyo");
    await expect(removeSupportAs(member(outsiderId), id, other.id)).rejects.toThrow(t("T-2764"));
  });
});
