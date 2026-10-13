import { and, count, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { personImported } from "@/domain-events/people";
import {
  endMembershipAs,
  lockMembershipCycle,
  recordSanctionAs,
  setProbationAs,
} from "@/modules/people";
import { changeMembershipStatus } from "@/modules/people/domain/membership";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { listPeople } from "@/modules/people/domain/persons";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
  remapRosterPreviewAs,
} from "@/modules/people/domain/roster";
import {
  committee,
  committeeMembership,
  committeeRole,
  consent,
  membership,
  membershipTerm,
  person,
} from "@/modules/people/schema";
import { PrivacyPolicyPendingError } from "@/modules/system";
import { appConfig, auditLog, importJob, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedMembershipTerm,
  seedPerson,
  seedTerm,
} from "../factories";
import { copyPattern, itemPattern } from "../helpers/copy";
import { holdTransaction, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";

const db = () => getDb();

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */
const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";

function csv(lines: string[], header = HEADER): Uint8Array {
  return new TextEncoder().encode(`﻿${[header, ...lines].join("\r\n")}\r\n`);
}

async function preview(
  actorId: string,
  termId: string,
  bytes: Uint8Array,
  filename = "roster.csv",
) {
  const { jobId } = await createRosterPreviewAs(
    { personId: actorId, ip: null },
    { filename, contentType: "text/csv", bytes, termId },
  );
  const result = await getRosterPreview(jobId);
  if (!result) throw new Error("sin vista previa");
  return result;
}

describe("importación del roster", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("importa A–L, conserva vacíos opcionales e historia y repite sin duplicar", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin.campos@eafit.edu.co");
    const header =
      "NOMBRE;APELLIDO;TIPO DE DOCUMENTO;DOCUMENTO;CORREO;ID EPIK;CELULAR;FECHA DE NACIMIENTO;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO";
    const bytes = csv(
      [
        `Persona;Sintética;TI;00123;roster.campos@eafit.edu.co;00045;;2004-02-29;Derecho;A3;${code};PERÍODO DE PRUEBA`,
      ],
      header,
    );
    const draft = await preview(adminId, termId, bytes);
    expect(draft.rows[0]).toMatchObject({
      documentType: "TI",
      documentNumber: "00123",
      epikId: "00045",
      birthDate: "2004-02-29",
      probation: true,
    });
    await applyRosterImportAs({ personId: adminId, ip: null }, draft.jobId);
    const [created] = await db()
      .select()
      .from(person)
      .where(eq(person.email, "roster.campos@eafit.edu.co"));
    expect(created).toMatchObject({
      documentType: "TI",
      documentNumber: "00123",
      epikId: "00045",
      birthDate: "2004-02-29",
    });
    const update = await preview(
      adminId,
      termId,
      csv(
        ["roster.campos@eafit.edu.co;CC;;;;Ingeniería"],
        "CORREO;TIPO DE DOCUMENTO;DOCUMENTO;ID EPIK;FECHA DE NACIMIENTO;PREGRADO",
      ),
    );
    expect(update.rows[0]).toMatchObject({ group: "CHANGED" });
    expect(update.rows[0]?.changes).toContain("documentType");
    await applyRosterImportAs({ personId: adminId, ip: null }, update.jobId);
    const [updated] = await db()
      .select()
      .from(person)
      .where(eq(person.id, created?.id ?? ""));
    expect(updated).toMatchObject({
      documentType: "CC",
      documentNumber: "00123",
      epikId: "00045",
      birthDate: "2004-02-29",
    });
    const conflicting = await preview(
      adminId,
      termId,
      csv(["roster.campos@eafit.edu.co;2018-1"], "CORREO;ENTRADA A LA OE"),
    );
    expect(conflicting.counts.ERROR).toBe(1);
    expect(
      (await applyRosterImportAs({ personId: adminId, ip: null }, conflicting.jobId)).skipped,
    ).toBe(1);
    expect(await db().select().from(term).where(eq(term.code, "2018-1"))).toHaveLength(0);
    expect((await getPerson360(created?.id ?? ""))?.membership?.firstTermCode).toBe(code);
    const repeat = await preview(
      adminId,
      termId,
      csv(
        ["roster.campos@eafit.edu.co;CC;00123;00045;2004-02-29"],
        "CORREO;TIPO DE DOCUMENTO;DOCUMENTO;ID EPIK;FECHA DE NACIMIENTO",
      ),
    );
    expect(repeat.counts.UNCHANGED).toBe(1);
    await applyRosterImportAs({ personId: adminId, ip: null }, repeat.jobId);
    expect(
      await db().select().from(person).where(eq(person.email, "roster.campos@eafit.edu.co")),
    ).toHaveLength(1);
  });

  it("permite preparar el roster, pero la política pendiente impide aplicarlo sin efectos parciales", async () => {
    const termId = await seedTerm();
    await seedCommittee("a3");
    const adminId = await seedMember("admin.politica@eafit.edu.co");
    const draft = await preview(
      adminId,
      termId,
      csv(["Persona;Sintética;roster.politica@eafit.edu.co;;Derecho;A3;2024-2;Activo;"]),
    );
    await db()
      .update(appConfig)
      .set({ value: "pendiente" })
      .where(eq(appConfig.key, "privacy.policyVersion"));
    await expect(
      applyRosterImportAs({ personId: adminId, ip: null }, draft.jobId),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);
    expect(await db().select().from(person)).toHaveLength(1);
    expect(await db().select().from(consent)).toHaveLength(0);
    expect(await db().select().from(term).where(eq(term.code, "2024-2"))).toHaveLength(0);
    expect((await getRosterPreview(draft.jobId))?.status).toBe("PREVIEW");
  });

  it("crea personas, pertenencias con cargo y consentimientos; subirlo dos veces no duplica", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await Promise.all(["a3", "pixel", "ius"].map((slug) => seedCommittee(slug)));
    const adminId = await seedMember("admin@eafit.edu.co");
    const bytes = csv([
      "Mateo;Prueba;prueba.mateo@eafit.edu.co;3001234567;Ingeniería de Sistemas;A3, PIXEL;2024-2;Activo;General de A3",
      `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;IUS;${code};Activo;`,
      "Juan;Gómez;prueba.juan@eafit.edu.co;3109876543;Economía;A3;2023-1;Licencia;Financiero",
      "Sofía;Retirada;prueba.sofia@eafit.edu.co;;Diseño;;2021-2;Retirado;",
      // ADR-058: varios cargos en el mismo comité y codirección de General, que también recibe propuesta.
      "Cora;Codi;prueba.cora@eafit.edu.co;;Diseño;A3;2024-2;Activo;Codirección de General de A3, Logística de A3",
    ]);
    const first = await preview(adminId, termId, bytes);
    expect(first.counts).toEqual({ NEW: 5, CHANGED: 0, UNCHANGED: 0, ERROR: 0 });
    expect(first.missingTerms).toEqual(["2021-2", "2023-1", "2024-2"]);
    expect(first.proposals).toEqual([
      expect.objectContaining({
        email: "prueba.mateo@eafit.edu.co",
        committeeName: "A3",
        coDirector: false,
      }),
      expect.objectContaining({
        email: "prueba.cora@eafit.edu.co",
        committeeName: "A3",
        coDirector: true,
      }),
    ]);

    const summary = await applyRosterImportAs({ personId: adminId, ip: null }, first.jobId);
    expect(summary).toMatchObject({ created: 5, updated: 0, unchanged: 0, skipped: 0 });
    expect(summary.termsCreated).toEqual(["2021-2", "2023-1", "2024-2"]);
    const [created] = await db().select().from(term).where(eq(term.code, "2024-2"));
    expect(created).toMatchObject({ startsOn: "2024-07-01", endsOn: "2024-12-31", semester: 2 });

    const listed = await listPeople({ q: "prueba.", page: 1, pageSize: 10 });
    expect(listed.total).toBe(5);
    const mateo = listed.rows.find((row) => row.email === "prueba.mateo@eafit.edu.co");
    expect(mateo).toMatchObject({
      stage: "MEMBER",
      membershipStatus: "ACTIVE",
      firstTermCode: "2024-2",
      committees: ["A3 · General", "PIXEL · Miembro"],
    });
    const juan = listed.rows.find((row) => row.email === "prueba.juan@eafit.edu.co");
    expect(juan).toMatchObject({ membershipStatus: "ON_LEAVE", committees: ["A3 · Financiero"] });
    const cora = listed.rows.find((row) => row.email === "prueba.cora@eafit.edu.co");
    expect(cora).toMatchObject({ committees: ["A3 · Codirección de General y Logística"] });
    const sofia = listed.rows.find((row) => row.email === "prueba.sofia@eafit.edu.co");
    expect(sofia).toMatchObject({ stage: "ALUMNI", membershipStatus: "INACTIVE", committees: [] });
    // ADR-048: la importación no registra autorizaciones; cada persona autoriza en su primer ingreso.
    const [consents] = await db()
      .select({ n: count() })
      .from(consent)
      .where(eq(consent.purpose, "MEMBERSHIP"));
    expect(consents?.n).toBe(0);
    const [imported] = await db()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.action, "person.imported"));
    expect(imported?.n).toBe(5);

    const second = await preview(adminId, termId, bytes);
    expect(second.counts).toEqual({ NEW: 0, CHANGED: 0, UNCHANGED: 5, ERROR: 0 });
    const again = await applyRosterImportAs({ personId: adminId, ip: null }, second.jobId);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 5 });
    const [people] = await db().select({ n: count() }).from(person);
    expect(people?.n).toBe(6);
  });

  it("actualiza por correo solo las columnas presentes, da de baja por Retirado y crea cargos nuevos", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await Promise.all(["a3", "pixel"].map((slug) => seedCommittee(slug)));
    const adminId = await seedMember("admin@eafit.edu.co");
    const base = await preview(
      adminId,
      termId,
      csv([
        `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3, PIXEL;${code};Activo;`,
        `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Activo;`,
      ]),
    );
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);

    const update = await preview(
      adminId,
      termId,
      csv(
        ["prueba.ana@eafit.edu.co;Tesorería de A3", "prueba.nadie@eafit.edu.co;General de PIXEL"],
        "CORREO;CARGO",
      ),
      "cargos.csv",
    );
    expect(update.updateMode).toBe(true);
    expect(update.counts).toEqual({ NEW: 0, CHANGED: 1, UNCHANGED: 0, ERROR: 1 });
    expect(update.unknownRoles).toEqual(["Tesorería"]);
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, update.jobId);
    expect(applied).toMatchObject({ updated: 1, skipped: 1, rolesCreated: ["Tesorería"] });
    const [role] = await db()
      .select()
      .from(committeeRole)
      .where(eq(committeeRole.code, "TESORERIA"));
    expect(role?.label).toBe("Tesorería");
    const ana = (await listPeople({ q: "prueba.ana", page: 1, pageSize: 5 })).rows[0];
    expect(ana?.committees).toEqual(["A3 · Tesorería", "PIXEL · Miembro"]);
    expect(ana?.firstName).toBe("Ana");

    const retiro = await preview(
      adminId,
      termId,
      csv([`Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Retirado;`]),
    );
    expect(retiro.rows[0]).toMatchObject({ group: "CHANGED", changes: ["status"] });
    await applyRosterImportAs({ personId: adminId, ip: null }, retiro.jobId);
    const juan = (await listPeople({ q: "prueba.juan", page: 1, pageSize: 5 })).rows[0];
    const data = await getPerson360(juan?.id ?? "");
    expect(data?.person.stage).toBe("ALUMNI");
    expect(data?.membership?.status).toBe("INACTIVE");
    expect(data?.committeesByTerm[0]?.items[0]?.leftAt).toBeInstanceOf(Date);
  });

  // ADR-118 regla 11 por el roster: los comités se cambian solo a quien queda con membresía vigente.
  // La fila de alguien de baja conserva su estado y el resto del archivo se aplica.
  async function rosterConBaja(endReason: "EXPULSION" | "RESIGNATION") {
    const termId = await seedTerm();
    const code = currentTermCode();
    await Promise.all(["a3", "pixel"].map((slug) => seedCommittee(slug)));
    const adminId = await seedMember("admin@eafit.edu.co");
    const base = await preview(
      adminId,
      termId,
      csv([
        `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3;${code};Activo;`,
        `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Activo;`,
      ]),
    );
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
    const idOf = async (email: string) => {
      const [row] = await db()
        .select({ id: person.id })
        .from(person)
        .where(eq(person.email, email));
      return row?.id ?? "";
    };
    const ana = await idOf("prueba.ana@eafit.edu.co");
    const juan = await idOf("prueba.juan@eafit.edu.co");
    await endMembershipAs({ personId: adminId, ip: null }, juan, {
      endReason,
      memorialConsent: false,
      contactConsent: false,
    });
    return { termId, code, adminId, ana, juan };
  }

  /** Lo que una importación le dejó a una persona: su auditoría y su evento `person.imported`. */
  async function importacionesDe(personId: string, jobId: string) {
    const audits = await db()
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "person.imported"),
          eq(auditLog.entityId, personId),
          sql`${auditLog.after}->>'jobId' = ${jobId}`,
        ),
      );
    const events = await db()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(
        and(
          eq(outbox.eventType, personImported.type),
          sql`${outbox.payload}->>'personId' = ${personId}`,
          sql`${outbox.payload}->>'jobId' = ${jobId}`,
        ),
      );
    return { audits: audits.map((row) => row.after), events: events.map((row) => row.payload) };
  }

  async function estadoYComites(personId: string) {
    const [fila] = await db()
      .select({ status: membership.status, endReason: membership.endReason })
      .from(membership)
      .where(eq(membership.personId, personId));
    const vivas = await db()
      .select({ slug: committee.slug })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
    return { ...fila, comites: vivas.map((row) => row.slug).sort() };
  }

  it("a quien fue expulsado y figura como activo no le cambia los comités ni lo cuenta como actualizado, y el resto del archivo se aplica", async () => {
    const { termId, code, adminId, ana, juan } = await rosterConBaja("EXPULSION");

    const otra = await preview(
      adminId,
      termId,
      csv([
        `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3, PIXEL;${code};Activo;`,
        `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Activo;`,
      ]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    // Solo cambió una persona: la fila de quien sigue de baja no cuenta como actualizada (DT-249).
    expect(applied).toMatchObject({ updated: 1, unchanged: 1, skipped: 0 });
    expect(await estadoYComites(juan)).toEqual({
      status: "INACTIVE",
      endReason: "EXPULSION",
      comites: [],
    });
    expect((await estadoYComites(ana)).comites).toEqual(["a3", "pixel"]);
    // La vista previa ya lo había dicho con su aviso, y no anuncia cambios: ni el estado ni los
    // comités se van a cambiar.
    const fila = otra.rows.find((row) => row.email === "prueba.juan@eafit.edu.co");
    expect(fila?.warnings).toEqual([
      expect.stringMatching(copyPattern("T-2208", { nombre: "Juan Gómez" })),
    ]);
    expect(fila).toMatchObject({ group: "UNCHANGED", changes: [] });
    // Y como no le cambió nada, esa importación no le deja auditoría ni evento (ADR-120 regla 2).
    expect(await importacionesDe(juan, otra.jobId)).toEqual({ audits: [], events: [] });
    expect((await importacionesDe(ana, otra.jobId)).audits).toEqual([
      expect.objectContaining({ outcome: "updated", changes: ["committees"] }),
    ]);
  });

  // De la revisión del ciclo 15 (ADR-127 regla 1): la propuesta de líder sale de la fila que se aplica.
  // A quien sigue de baja el roster no le cambia los comités (ADR-118 regla 11), y su fila proponía
  // igual el permiso: la acción se lo concedía después del commit a quien no quedó en el comité.
  it.each([
    ["fue expulsado", "Activo", "EXPULSION", []],
    ["fue expulsado", "Honorario", "EXPULSION", []],
    ["renunció", "Activo", "RESIGNATION", ["pixel"]],
  ] as const)("a quien %s y figura como %s y General de un comité se le propone el permiso de líder solo si el roster lo deja en ese comité", async (_left, listedAs, endReason, stays) => {
    const { termId, code, adminId, juan } = await rosterConBaja(endReason);

    const next = await preview(
      adminId,
      termId,
      csv([
        `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3;${code};Activo;General de A3`,
        `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};${listedAs};General de PIXEL`,
      ]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, next.jobId);

    const proposed = ["prueba.ana@eafit.edu.co", ...stays.map(() => "prueba.juan@eafit.edu.co")];
    expect(next.proposals.map((proposal) => proposal.email)).toEqual(proposed);
    expect(applied.proposals.map((proposal) => proposal.email)).toEqual(proposed);
    expect((await estadoYComites(juan)).comites).toEqual(stays);
  });

  // A quién le deja escritos los comités una fila, por cómo está hoy la persona y cómo figura en el
  // archivo (ADR-118 regla 11): solo a quien la fila deja con membresía vigente. Es la caracterización
  // de lo que la aplicación escribe y de lo que el diff anuncia, fijada antes de que los dos lean la
  // misma función (`committeesToWrite`, ADR-127 regla 1), y de esa misma lista sale la propuesta de
  // líder. La persona figura siempre en A3 y de General de A3; quien hoy tiene membresía vigente ya
  // está en A3, sin cargo.
  type Left = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE" | "ROW_IN_ERROR";
  type Today =
    | "NOBODY"
    | "NO_MEMBERSHIP"
    | "ACTIVE"
    | "ON_LEAVE"
    | "HONORARY"
    | "GRADUATION"
    | "RESIGNATION"
    | "PERMANENCE"
    | "STUDENT_STATUS_LOST"
    | "OTHER"
    | "EXPULSION";
  /** Cómo figura en el archivo: la palabra de la columna ESTADO, o `null` si el archivo no la trae. */
  const LISTED = [
    ["en un archivo sin ESTADO", null],
    ["como Activo", "Activo"],
    ["en Licencia", "Licencia"],
    ["como Honorario", "Honorario"],
    ["como Retirado", "Retirado"],
  ] as const;
  type Listed = (typeof LISTED)[number][0];
  const leaves = (
    noColumn: Left,
    active: Left,
    onLeave: Left,
    honorary: Left,
    retired: Left,
  ): Record<Listed, Left> => ({
    "en un archivo sin ESTADO": noColumn,
    "como Activo": active,
    "en Licencia": onLeave,
    "como Honorario": honorary,
    "como Retirado": retired,
  });
  // El estado que el archivo trae es el que queda, salvo para quien está de baja: sin ESTADO o como
  // retirado sigue de baja, y a quien fue expulsado no lo reactiva ningún estado (ADR-060 regla 3).
  const fileDecides = (noColumn: Left) =>
    leaves(noColumn, "ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE");
  const LEFT_BY_ROW: Array<[who: string, today: Today, left: Record<Listed, Left>]> = [
    // Sin ESTADO el archivo no trae las columnas de una persona nueva: su fila queda en error.
    ["no existe", "NOBODY", fileDecides("ROW_IN_ERROR")],
    ["existe sin membresía", "NO_MEMBERSHIP", fileDecides("ACTIVE")],
    ["está activo", "ACTIVE", fileDecides("ACTIVE")],
    ["está en licencia", "ON_LEAVE", fileDecides("ON_LEAVE")],
    ["es honorario", "HONORARY", fileDecides("HONORARY")],
    ["se graduó", "GRADUATION", fileDecides("INACTIVE")],
    ["renunció", "RESIGNATION", fileDecides("INACTIVE")],
    ["salió por permanencia", "PERMANENCE", fileDecides("INACTIVE")],
    ["perdió la calidad de estudiante", "STUDENT_STATUS_LOST", fileDecides("INACTIVE")],
    ["salió por otro motivo", "OTHER", fileDecides("INACTIVE")],
    [
      "fue expulsado",
      "EXPULSION",
      leaves("INACTIVE", "INACTIVE", "INACTIVE", "INACTIVE", "INACTIVE"),
    ],
  ];
  const IN_FORCE: readonly Today[] = ["ACTIVE", "ON_LEAVE", "HONORARY"];

  /** Cómo quedó la persona de un correo: su estado y, de cada pertenencia viva, el comité y el cargo. */
  async function leftAs(email: string) {
    const [row] = await db()
      .select({ id: person.id, status: membership.status })
      .from(person)
      .leftJoin(membership, eq(membership.personId, person.id))
      .where(eq(person.email, email));
    if (!row) {
      return null;
    }
    const open = await db()
      .select({ slug: committee.slug, roleCode: committeeMembership.roleCode })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .where(and(eq(committeeMembership.personId, row.id), isNull(committeeMembership.leftAt)));
    return { status: row.status, committees: open.map((item) => `${item.slug}:${item.roleCode}`) };
  }

  it.each(
    LEFT_BY_ROW.flatMap(([who, today, left]) =>
      LISTED.map(([listedAs, word]) => [who, listedAs, today, word, left[listedAs]] as const),
    ),
  )("a quien %s y figura %s y General de su comité, la fila le escribe los comités y le propone el permiso de líder solo si lo deja con membresía vigente", async (_who, _listedAs, today, word, left) => {
    const termId = await seedTerm();
    const code = currentTermCode();
    const a3 = await seedCommittee("a3");
    const adminId = await seedMember("admin@eafit.edu.co");
    const email = "prueba.juan@eafit.edu.co";
    if (today !== "NOBODY") {
      const hasMembership = today !== "NO_MEMBERSHIP";
      const inForce = IN_FORCE.includes(today);
      const juan = await seedPerson(email, {
        firstName: "Juan",
        lastName: "Gómez",
        program: "Economía",
        stage: !hasMembership ? "APPLICANT" : inForce ? "MEMBER" : "ALUMNI",
      });
      if (today === "ACTIVE" || today === "ON_LEAVE" || today === "HONORARY") {
        await seedMembership(juan, termId, today);
        await seedCommitteeMembership(juan, a3, termId);
      } else if (today !== "NO_MEMBERSHIP") {
        await seedMembership(juan, termId, "INACTIVE", today);
      }
    }

    const shown = await preview(
      adminId,
      termId,
      word === null
        ? csv(
            [`Juan;Gómez;${email};;Economía;A3;${code};General de A3`],
            HEADER.replace(";ESTADO", ""),
          )
        : csv([`Juan;Gómez;${email};;Economía;A3;${code};${word};General de A3`]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, shown.jobId);

    const row = shown.rows.find((item) => item.email === email);
    if (left === "ROW_IN_ERROR") {
      expect(row?.group).toBe("ERROR");
      expect(applied).toMatchObject({ created: 0, updated: 0, skipped: 1, proposals: [] });
      expect(shown.proposals).toEqual([]);
      expect(await leftAs(email)).toBeNull();
      return;
    }
    expect(applied.skipped).toBe(0);
    const written = left !== "INACTIVE";
    expect(await leftAs(email)).toEqual({
      status: left,
      committees: written ? ["a3:GENERAL"] : [],
    });
    // La propuesta de líder sale de los comités que la fila deja escritos: la acción le concede el
    // permiso, después del commit, a quien el resumen nombre. Quien queda en licencia o como
    // honorario queda en el comité con su cargo y por eso se le propone, como siempre: si conserva
    // esa dirección es la decisión abierta 7, y si sigue de representante, la 45.
    const proposed = written ? [email] : [];
    expect(shown.proposals.map((proposal) => proposal.email)).toEqual(proposed);
    expect(applied.proposals.map((proposal) => proposal.email)).toEqual(proposed);
    // El diff anuncia el cambio de comités donde la aplicación los escribe, y solo ahí. De una
    // persona nueva no anuncia columnas, y de quien sigue de baja no anuncia nada.
    if (today === "NOBODY") {
      expect(row).toMatchObject({ group: "NEW", changes: [] });
      return;
    }
    const statusChanges = IN_FORCE.includes(today)
      ? left !== today
      : today === "NO_MEMBERSHIP" || written;
    const changes = [...(statusChanges ? ["status"] : []), ...(written ? ["committees"] : [])];
    expect(row).toMatchObject({ group: changes.length > 0 ? "CHANGED" : "UNCHANGED", changes });
  });

  // ADR-120 regla 2: la auditoría y el evento `person.imported` dicen que la importación le cambió
  // algo a la persona. Una fila que queda igual no los deja (DT-288).
  it("una fila que no cambia nada no audita ni emite la importación, y la que sí cambia las sigue dejando", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin@eafit.edu.co");
    const filas = (programaDeAna: string) =>
      csv([
        `Ana;Pérez;prueba.ana@eafit.edu.co;;${programaDeAna};A3;${code};Activo;`,
        `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;A3;${code};Activo;`,
      ]);
    const base = await preview(adminId, termId, filas("Derecho"));
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
    const idOf = async (email: string) =>
      (await db().select({ id: person.id }).from(person).where(eq(person.email, email)))[0]?.id ??
      "";
    const ana = await idOf("prueba.ana@eafit.edu.co");
    const juan = await idOf("prueba.juan@eafit.edu.co");
    // Quien nace con la importación sí la lleva en su historial.
    expect(await importacionesDe(juan, base.jobId)).toEqual({
      audits: [expect.objectContaining({ outcome: "created" })],
      events: [expect.objectContaining({ outcome: "created" })],
    });

    const otra = await preview(adminId, termId, filas("Ingeniería"));
    expect(otra.counts).toEqual({ NEW: 0, CHANGED: 1, UNCHANGED: 1, ERROR: 0 });
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(applied).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    expect(await importacionesDe(juan, otra.jobId)).toEqual({ audits: [], events: [] });
    expect(await importacionesDe(ana, otra.jobId)).toEqual({
      audits: [expect.objectContaining({ outcome: "updated", changes: ["program"] })],
      events: [expect.objectContaining({ outcome: "updated", changes: ["program"] })],
    });
  });

  // ADR-120 regla 2, la precisión: «sin cambios» es no haber escrito nada. A quien ya existe sin
  // membresía el roster se la crea aunque el archivo no traiga ESTADO: esa fila cambia a la persona,
  // así que la vista previa la cuenta y la importación la audita y la emite.
  it("a quien existe sin membresía una fila sin ESTADO le crea la membresía, y eso cuenta como cambio, audita y emite", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("admin@eafit.edu.co", { program: "Derecho" });
    const entra = await seedPerson("prueba.entra@eafit.edu.co", {
      stage: "APPLICANT",
      program: "Economía",
    });
    const sinEstado = await preview(
      adminId,
      termId,
      csv(["admin@eafit.edu.co;Derecho", "prueba.entra@eafit.edu.co;Economía"], "CORREO;PREGRADO"),
    );
    expect(sinEstado.counts).toEqual({ NEW: 0, CHANGED: 1, UNCHANGED: 1, ERROR: 0 });

    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, sinEstado.jobId);

    expect(applied).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    expect(
      await db()
        .select({ status: membership.status, stage: person.stage })
        .from(membership)
        .innerJoin(person, eq(person.id, membership.personId))
        .where(eq(membership.personId, entra)),
    ).toEqual([{ status: "ACTIVE", stage: "MEMBER" }]);
    expect(await importacionesDe(entra, sinEstado.jobId)).toEqual({
      audits: [expect.objectContaining({ outcome: "updated", changes: ["status"] })],
      events: [expect.objectContaining({ outcome: "updated", changes: ["status"] })],
    });
    // Quien importa también figura en el archivo, y su fila no cambia nada: no deja rastro.
    expect(await importacionesDe(adminId, sinEstado.jobId)).toEqual({ audits: [], events: [] });
  });

  async function personaDe(email: string): Promise<string> {
    const [row] = await db().select({ id: person.id }).from(person).where(eq(person.email, email));
    return row?.id ?? "";
  }

  /** Cuánto hay escrito a nombre de una persona: su auditoría, con cualquier acción, y sus eventos. */
  async function rastroDe(personId: string) {
    const [audits] = await db()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.entityId, personId));
    const [events] = await db()
      .select({ n: count() })
      .from(outbox)
      .where(sql`${outbox.payload}->>'personId' = ${personId}`);
    return { audits: audits?.n ?? 0, events: events?.n ?? 0 };
  }

  // ADR-120 regla 2: «sin cambios» es no haber escrito nada, y vale también para los comités. La fila
  // que repite las pertenencias que la persona ya tiene no deja `committee-membership.set` ni
  // `committee-membership.changed`, que es lo que alimenta su línea de tiempo y el recálculo.
  it("reimportar un archivo ya aplicado no le deja a nadie auditoría ni evento, tampoco los de sus comités", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    await seedCommittee("pixel");
    const adminId = await seedMember("admin@eafit.edu.co");
    const filas = csv([
      `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3, PIXEL;${code};Activo;`,
      `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;A3;${code};Periodo de prueba;`,
    ]);
    const base = await preview(adminId, termId, filas);
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
    const ana = await personaDe("prueba.ana@eafit.edu.co");
    const juan = await personaDe("prueba.juan@eafit.edu.co");
    const antes = { ana: await rastroDe(ana), juan: await rastroDe(juan) };
    expect(antes.ana.audits).toBeGreaterThan(0);
    expect(antes.ana.events).toBeGreaterThan(0);

    const otra = await preview(adminId, termId, filas);
    expect(otra.counts).toEqual({ NEW: 0, CHANGED: 0, UNCHANGED: 2, ERROR: 0 });
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(applied).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect({ ana: await rastroDe(ana), juan: await rastroDe(juan) }).toEqual(antes);
    expect((await estadoYComites(ana)).comites).toEqual(["a3", "pixel"]);
  });

  // DT-297 sigue abierta: a quien tiene membresía el roster le reescribe el motivo de la fila del
  // término aunque la prueba no cambie (qué se le escribe a quien vuelve es la decisión abierta 29).
  // Lo que ADR-120 regla 2 cierra es el rastro: la fila que escribe se cuenta, audita y emite.
  it("la fila que le reescribe a alguien el motivo de su prueba cuenta como actualizada, audita y emite", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin@eafit.edu.co");
    const fila = (estado: string) =>
      csv([`Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3;${code};${estado};`]);
    const base = await preview(adminId, termId, fila("Activo"));
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
    const ana = await personaDe("prueba.ana@eafit.edu.co");
    await setProbationAs({ personId: adminId, ip: null }, ana, termId, {
      probation: true,
      reason: "La decidió GH con su motivo",
    });
    expect(await filaDelTermino(ana, termId)).toEqual([
      { probation: true, reason: "La decidió GH con su motivo" },
    ]);

    const otra = await preview(adminId, termId, fila("Periodo de prueba"));
    expect(otra.rows[0]).toMatchObject({ group: "UNCHANGED", changes: [] });
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(await filaDelTermino(ana, termId)).toEqual([
      { probation: true, reason: `roster ${code}` },
    ]);
    expect(applied).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    expect(await importacionesDe(ana, otra.jobId)).toEqual({
      audits: [expect.objectContaining({ outcome: "updated", changes: [] })],
      events: [expect.objectContaining({ outcome: "updated", changes: [] })],
    });

    // Repetido, ya no hay nada que escribir: ni la prueba ni el motivo cambian.
    const tercera = await preview(adminId, termId, fila("Periodo de prueba"));
    const again = await applyRosterImportAs({ personId: adminId, ip: null }, tercera.jobId);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(await importacionesDe(ana, tercera.jobId)).toEqual({ audits: [], events: [] });
  });

  // ADR-120 regla 2, por lo escrito: el diff se calcula antes de tomar a cada persona. Si alguien la
  // edita en ese rato, el roster le escribe lo que dice el archivo, como siempre, y esa escritura no
  // tiene otra auditoría que la de la importación.
  it("si alguien edita a la persona entre el diff y su fila, el roster escribe lo del archivo y la cuenta como actualizada", async () => {
    const termId = await seedTerm();
    const adminId = await seedMember("admin@eafit.edu.co");
    const ana = await seedMember("prueba.ana@eafit.edu.co", { program: "Derecho" });
    const draft = await preview(
      adminId,
      termId,
      csv(["prueba.ana@eafit.edu.co;Derecho"], "CORREO;PREGRADO"),
    );
    expect(draft.counts).toEqual({ NEW: 0, CHANGED: 0, UNCHANGED: 1, ERROR: 0 });
    // Otra transacción tiene el candado del ciclo de Ana y le cambió el programa, sin confirmar: el
    // roster calcula su diff con el programa viejo y hace cola por ese candado.
    const held = await holdTransaction(async (tx) => {
      await lockMembershipCycle(tx, ana);
      await tx.update(person).set({ program: "Economía" }).where(eq(person.id, ana));
    });
    let applied: Awaited<ReturnType<typeof applyRosterImportAs>>;
    try {
      const importing = applyRosterImportAs({ personId: adminId, ip: null }, draft.jobId);
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      held.release();
      applied = await importing;
    } finally {
      held.release();
      await held.done;
    }

    expect(applied).toMatchObject({ created: 0, updated: 1, unchanged: 0 });
    const [quedo] = await db()
      .select({ program: person.program })
      .from(person)
      .where(eq(person.id, ana));
    expect(quedo?.program).toBe("Derecho");
    expect(await importacionesDe(ana, draft.jobId)).toEqual({
      audits: [expect.objectContaining({ outcome: "updated" })],
      events: [expect.objectContaining({ outcome: "updated" })],
    });
  });

  async function filaDelTermino(personId: string, termId: string) {
    return db()
      .select({ probation: membershipTerm.probation, reason: membershipTerm.reason })
      .from(membershipTerm)
      .where(
        and(
          eq(membershipTerm.personId, personId),
          eq(membershipTerm.termId, termId),
          isNull(membershipTerm.committeeId),
        ),
      );
  }

  // ADR-120 regla 1: a quien sigue de baja el roster no le toca la fila del término, igual que no le
  // toca el estado ni los comités (DT-286). Antes le escribía la prueba que decía el archivo.
  it("a quien fue expulsado y figura en periodo de prueba no le escribe la prueba del término ni lo cuenta como actualizado", async () => {
    const { termId, code, adminId, juan } = await rosterConBaja("EXPULSION");
    const antes = await filaDelTermino(juan, termId);
    expect(antes).toEqual([{ probation: false, reason: `roster ${code}` }]);

    const otra = await preview(
      adminId,
      termId,
      csv([`Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Periodo de prueba;`]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(await filaDelTermino(juan, termId)).toEqual(antes);
    expect(await estadoYComites(juan)).toEqual({
      status: "INACTIVE",
      endReason: "EXPULSION",
      comites: [],
    });
    // La vista previa tampoco anuncia un cambio que no se va a escribir, y la fila conserva su aviso.
    expect(otra.rows[0]).toMatchObject({ group: "UNCHANGED", changes: [] });
    expect(otra.rows[0]?.warnings).toEqual([
      expect.stringMatching(copyPattern("T-2208", { nombre: "Juan Gómez" })),
    ]);
    expect(applied).toMatchObject({ updated: 0, unchanged: 1, skipped: 0 });
  });

  it("a quien renunció y sigue figurando como retirado no le reescribe la prueba ni el motivo que tenía en el término", async () => {
    const { termId, code, adminId, juan } = await rosterConBaja("RESIGNATION");
    await setProbationAs({ personId: adminId, ip: null }, juan, termId, {
      probation: true,
      reason: "Quedó en prueba antes de irse",
    });
    const antes = await filaDelTermino(juan, termId);
    expect(antes).toEqual([{ probation: true, reason: "Quedó en prueba antes de irse" }]);

    const otra = await preview(
      adminId,
      termId,
      csv([`Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Retirado;`]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(await filaDelTermino(juan, termId)).toEqual(antes);
    expect(otra.rows[0]).toMatchObject({ group: "UNCHANGED", changes: [] });
    expect(applied).toMatchObject({ updated: 0, unchanged: 1, skipped: 0 });
  });

  // El límite de la regla: «sigue de baja» no es «queda de baja». A quien el roster da de baja en
  // esta misma fila se le sigue escribiendo la fila del término, como antes de ADR-120.
  it("a quien el roster da de baja en esa fila sí le escribe la fila del término: deja de figurar en prueba", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("pixel");
    const adminId = await seedMember("admin@eafit.edu.co");
    const fila = (estado: string) =>
      csv([`Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};${estado};`]);
    const base = await preview(adminId, termId, fila("Periodo de prueba"));
    await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
    const [juan] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "prueba.juan@eafit.edu.co"));
    expect(await filaDelTermino(juan?.id ?? "", termId)).toEqual([
      { probation: true, reason: `roster ${code}` },
    ]);

    const retiro = await preview(adminId, termId, fila("Retirado"));
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, retiro.jobId);

    expect(retiro.rows[0]).toMatchObject({ group: "CHANGED", changes: ["status"] });
    expect(applied).toMatchObject({ updated: 1, unchanged: 0 });
    expect((await estadoYComites(juan?.id ?? "")).status).toBe("INACTIVE");
    expect(await filaDelTermino(juan?.id ?? "", termId)).toEqual([
      { probation: false, reason: `roster ${code}` },
    ]);
  });

  it("quien renunció y figura como activo sí vuelve, y su fila cuenta el estado como cambio", async () => {
    const { termId, code, adminId, juan } = await rosterConBaja("RESIGNATION");

    const otra = await preview(
      adminId,
      termId,
      csv([`Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Activo;`]),
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, otra.jobId);

    expect(otra.rows[0]?.changes).toContain("status");
    expect(applied).toMatchObject({ updated: 1, unchanged: 0 });
    expect((await estadoYComites(juan)).status).toBe("ACTIVE");
  });

  // ADR-123 regla 5: el paso a honorario de quien está en prueba o con los derechos suspendidos lo
  // rechaza el comando (T-2331; ADR-061 regla 2 y ADR-120 regla 4). El roster lo dice en la vista
  // previa como error de esa fila, con el nombre, y el resto del archivo se aplica (DT-300).
  describe("la fila que pasa a honorario a quien no puede serlo", () => {
    /** Ana y Juan activos en A3 y PIXEL; después, un archivo que le suma PIXEL a Ana y trae a Juan como honorario. */
    async function rosterWithHonorary(block: (juan: string, adminId: string) => Promise<void>) {
      const termId = await seedTerm();
      const code = currentTermCode();
      await Promise.all(["a3", "pixel"].map((slug) => seedCommittee(slug)));
      const adminId = await seedMember("admin@eafit.edu.co");
      const base = await preview(
        adminId,
        termId,
        csv([
          `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3;${code};Activo;`,
          `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Activo;`,
        ]),
      );
      await applyRosterImportAs({ personId: adminId, ip: null }, base.jobId);
      const ana = await personaDe("prueba.ana@eafit.edu.co");
      const juan = await personaDe("prueba.juan@eafit.edu.co");
      await block(juan, adminId);
      const before = await estadoYComites(juan);
      const second = await preview(
        adminId,
        termId,
        csv([
          `Ana;Pérez;prueba.ana@eafit.edu.co;;Derecho;A3, PIXEL;${code};Activo;`,
          `Juan;Gómez;prueba.juan@eafit.edu.co;;Economía;PIXEL;${code};Honorario;`,
        ]),
      );
      const applied = await applyRosterImportAs({ personId: adminId, ip: null }, second.jobId);
      const target = second.rows.find((row) => row.email === "prueba.juan@eafit.edu.co");
      return { adminId, ana, juan, before, second, applied, target };
    }

    const expectRowError = async (result: Awaited<ReturnType<typeof rosterWithHonorary>>) => {
      const { ana, juan, before, second, applied, target } = result;
      // La vista previa nombra la fila y a la persona; no anuncia ningún cambio para ella.
      expect(target).toMatchObject({ group: "ERROR", changes: [] });
      expect(target?.errors).toEqual([
        expect.stringMatching(copyPattern("T-3265", { nombre: "Juan Gómez" })),
      ]);
      expect(second.counts).toMatchObject({ ERROR: 1, CHANGED: 1 });
      // Al aplicar, esa fila se salta y la otra entra: a Juan no se le escribe nada.
      expect(applied).toMatchObject({ updated: 1, skipped: 1 });
      expect(await estadoYComites(juan)).toEqual(before);
      expect((await estadoYComites(ana)).comites).toEqual(["a3", "pixel"]);
      expect(await importacionesDe(juan, second.jobId)).toEqual({ audits: [], events: [] });
    };

    it("en periodo de prueba en el semestre vigente: es un error de esa fila y el resto del archivo se aplica", async () => {
      const result = await rosterWithHonorary(async (juan, adminId) => {
        const termId = await seedTerm();
        await setProbationAs({ personId: adminId, ip: null }, juan, termId, {
          probation: true,
          reason: "Bajo desempeño el semestre pasado",
        });
      });

      await expectRowError(result);
      expect(result.before.status).toBe("ACTIVE");
    });

    it("en licencia con la prueba guardada de un semestre anterior: es un error de esa fila y el resto del archivo se aplica", async () => {
      const result = await rosterWithHonorary(async (juan) => {
        // Sale a licencia en 2026-1 con la prueba de ese semestre: en el vigente no tiene fila y la
        // prueba vive solo en la condición guardada (ADR-120 regla 4). El reloj se le pasa al comando.
        const previous = await seedTerm("2026-1");
        await seedMembershipTerm(juan, previous, true);
        await runCommand(SYSTEM_ACTOR, (ctx) =>
          changeMembershipStatus(
            ctx,
            juan,
            { to: "ON_LEAVE", reason: "Intercambio", leaveUntil: "2027-06-01" },
            new Date("2026-06-01T15:00:00Z"),
          ),
        );
      });

      await expectRowError(result);
      expect(result.before.status).toBe("ON_LEAVE");
    });

    it("con los derechos suspendidos por una sanción: es un error de esa fila y el resto del archivo se aplica", async () => {
      const result = await rosterWithHonorary(async (juan, adminId) => {
        const termId = await seedTerm();
        await recordSanctionAs(
          { personId: adminId, ip: null },
          juan,
          {
            termId,
            kind: "SUSPENSION",
            cause: "Uso indebido de la oficina, con descargos",
            occurredOn: todayKey(),
            suspendedUntil: todayKey(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)),
          },
          { by: "ADMIN" },
        );
      });

      await expectRowError(result);
    });

    it("de baja por renuncia y en prueba en el semestre vigente: es un error de esa fila y el roster no la reactiva", async () => {
      const result = await rosterWithHonorary(async (juan, adminId) => {
        const termId = await seedTerm();
        await setProbationAs({ personId: adminId, ip: null }, juan, termId, {
          probation: true,
          reason: "Bajo desempeño el semestre pasado",
        });
        await endMembershipAs({ personId: adminId, ip: null }, juan, {
          endReason: "RESIGNATION",
          memorialConsent: false,
          contactConsent: false,
        });
      });

      await expectRowError(result);
      expect(result.before).toMatchObject({ status: "INACTIVE", endReason: "RESIGNATION" });
    });

    it("a quien fue expulsado y figura como honorario le sigue avisando que no vuelve, sin error: esa fila no pasa por el cambio de estado", async () => {
      const result = await rosterWithHonorary(async (juan, adminId) => {
        const termId = await seedTerm();
        await setProbationAs({ personId: adminId, ip: null }, juan, termId, {
          probation: true,
          reason: "Bajo desempeño el semestre pasado",
        });
        await endMembershipAs({ personId: adminId, ip: null }, juan, {
          endReason: "EXPULSION",
          memorialConsent: false,
          contactConsent: false,
        });
      });

      expect(result.target).toMatchObject({ group: "UNCHANGED", errors: [] });
      expect(result.target?.warnings).toEqual([
        expect.stringMatching(copyPattern("T-2208", { nombre: "Juan Gómez" })),
      ]);
      expect(result.applied).toMatchObject({ updated: 1, unchanged: 1, skipped: 0 });
      expect(await estadoYComites(result.juan)).toEqual(result.before);
    });

    it("quien no está en prueba ni suspendido pasa a honorario por el roster, como siempre", async () => {
      const result = await rosterWithHonorary(async () => {});

      expect(result.target).toMatchObject({ group: "CHANGED", errors: [] });
      expect(result.applied).toMatchObject({ updated: 2, skipped: 0 });
      expect((await estadoYComites(result.juan)).status).toBe("HONORARY");
    });
  });

  it("un archivo sin ESTADO avisa de quien está de baja y no le cambia los comités ni lo reactiva", async () => {
    const { termId, adminId, ana, juan } = await rosterConBaja("RESIGNATION");

    const comites = await preview(
      adminId,
      termId,
      csv(["prueba.ana@eafit.edu.co;A3, PIXEL", "prueba.juan@eafit.edu.co;A3"], "CORREO;COMITES"),
      "comites.csv",
    );
    const applied = await applyRosterImportAs({ personId: adminId, ip: null }, comites.jobId);

    expect(applied).toMatchObject({ updated: 1, skipped: 0 });
    expect(await estadoYComites(juan)).toEqual({
      status: "INACTIVE",
      endReason: "RESIGNATION",
      comites: [],
    });
    expect((await estadoYComites(ana)).comites).toEqual(["a3", "pixel"]);
    // Y la vista previa lo avisa: la fila no trae ningún cambio que se vaya a aplicar.
    const fila = comites.rows.find((row) => row.email === "prueba.juan@eafit.edu.co");
    expect(fila?.warnings).toEqual([
      expect.stringMatching(copyPattern("T-3247", { nombre: "Juan Gómez" })),
    ]);
    expect(fila).toMatchObject({ group: "UNCHANGED", changes: [] });
  });

  it("bloquea siglas inexistentes y dos Generales, permite corregir el mapeo y descartar", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin@eafit.edu.co");
    const wrong = await preview(
      adminId,
      termId,
      csv([
        `Uno;Uno;prueba.uno@eafit.edu.co;;Derecho;A3;${code};Activo;General de A3`,
        `Dos;Dos;prueba.dos@eafit.edu.co;;Derecho;A3;${code};Activo;General de A3`,
        `Tres;Tres;prueba.tres@eafit.edu.co;;Derecho;PIXL;${code};Activo;`,
      ]),
    );
    expect(wrong.counts.ERROR).toBe(3);
    expect(wrong.rows[2]?.errors[0]).toMatch(
      itemPattern(fillCopy(tList("T-165")[2], { sigla: "PIXL" })),
    );
    expect(wrong.proposals).toEqual([]);

    // Un archivo con otra cabecera: el admin la mapea a mano.
    const odd = await preview(
      adminId,
      termId,
      csv([`Cuatro;Cuatro;prueba.cuatro@eafit.edu.co;A3;${code};Activo`], "N;A;MAIL;C;E;S"),
    );
    expect(odd.mapping).toEqual([null, null, null, null, null, null]);
    await remapRosterPreviewAs({ personId: adminId, ip: null }, odd.jobId, [
      "firstName",
      "lastName",
      "email",
      "committees",
      "entry",
      "status",
    ]);
    const remapped = await getRosterPreview(odd.jobId);
    expect(remapped?.counts).toEqual({ NEW: 1, CHANGED: 0, UNCHANGED: 0, ERROR: 0 });

    await discardRosterImportAs({ personId: adminId, ip: null }, odd.jobId);
    const [job] = await db().select().from(importJob).where(eq(importJob.id, odd.jobId));
    expect(job?.status).toBe("DISCARDED");
    await expect(
      applyRosterImportAs({ personId: adminId, ip: null }, odd.jobId),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      createRosterPreviewAs(
        { personId: adminId, ip: null },
        {
          filename: "foto.png",
          contentType: "image/png",
          bytes: new Uint8Array([1, 2, 3]),
          termId,
        },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
