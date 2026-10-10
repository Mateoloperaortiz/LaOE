import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { endMembershipAs, setProbationAs } from "@/modules/people";
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
import { appConfig, auditLog, importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { DomainError } from "@/shared/lib/errors";
import { copyPattern, itemPattern } from "../helpers/copy";
import { truncateAll } from "./db";
import { currentTermCode, seedCommittee, seedMember, seedTerm } from "./factories";

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
    { personId: actorId },
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
    await applyRosterImportAs({ personId: adminId }, draft.jobId);
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
    await applyRosterImportAs({ personId: adminId }, update.jobId);
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
    expect((await applyRosterImportAs({ personId: adminId }, conflicting.jobId)).skipped).toBe(1);
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
    await applyRosterImportAs({ personId: adminId }, repeat.jobId);
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
    await expect(applyRosterImportAs({ personId: adminId }, draft.jobId)).rejects.toBeInstanceOf(
      PrivacyPolicyPendingError,
    );
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

    const summary = await applyRosterImportAs({ personId: adminId }, first.jobId);
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
    const again = await applyRosterImportAs({ personId: adminId }, second.jobId);
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
    await applyRosterImportAs({ personId: adminId }, base.jobId);

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
    const applied = await applyRosterImportAs({ personId: adminId }, update.jobId);
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
    await applyRosterImportAs({ personId: adminId }, retiro.jobId);
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
    await applyRosterImportAs({ personId: adminId }, base.jobId);
    const idOf = async (email: string) => {
      const [row] = await db()
        .select({ id: person.id })
        .from(person)
        .where(eq(person.email, email));
      return row?.id ?? "";
    };
    const ana = await idOf("prueba.ana@eafit.edu.co");
    const juan = await idOf("prueba.juan@eafit.edu.co");
    await endMembershipAs({ personId: adminId }, juan, {
      endReason,
      memorialConsent: false,
      contactConsent: false,
    });
    return { termId, code, adminId, ana, juan };
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
    const applied = await applyRosterImportAs({ personId: adminId }, otra.jobId);

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
    // Y la auditoría de esa fila tampoco dice que cambió el estado.
    const auditorias = await db()
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(and(eq(auditLog.action, "person.imported"), eq(auditLog.entityId, juan)));
    expect(auditorias.map((row) => row.after)).toContainEqual(
      expect.objectContaining({ jobId: otra.jobId, outcome: "unchanged", changes: [] }),
    );
    expect(auditorias.map((row) => row.after)).not.toContainEqual(
      expect.objectContaining({ jobId: otra.jobId, changes: ["status"] }),
    );
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
    const applied = await applyRosterImportAs({ personId: adminId }, otra.jobId);

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
    await setProbationAs({ personId: adminId }, juan, termId, {
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
    const applied = await applyRosterImportAs({ personId: adminId }, otra.jobId);

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
    await applyRosterImportAs({ personId: adminId }, base.jobId);
    const [juan] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "prueba.juan@eafit.edu.co"));
    expect(await filaDelTermino(juan?.id ?? "", termId)).toEqual([
      { probation: true, reason: `roster ${code}` },
    ]);

    const retiro = await preview(adminId, termId, fila("Retirado"));
    const applied = await applyRosterImportAs({ personId: adminId }, retiro.jobId);

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
    const applied = await applyRosterImportAs({ personId: adminId }, otra.jobId);

    expect(otra.rows[0]?.changes).toContain("status");
    expect(applied).toMatchObject({ updated: 1, unchanged: 0 });
    expect((await estadoYComites(juan)).status).toBe("ACTIVE");
  });

  it("un archivo sin ESTADO avisa de quien está de baja y no le cambia los comités ni lo reactiva", async () => {
    const { termId, adminId, ana, juan } = await rosterConBaja("RESIGNATION");

    const comites = await preview(
      adminId,
      termId,
      csv(["prueba.ana@eafit.edu.co;A3, PIXEL", "prueba.juan@eafit.edu.co;A3"], "CORREO;COMITES"),
      "comites.csv",
    );
    const applied = await applyRosterImportAs({ personId: adminId }, comites.jobId);

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
    await remapRosterPreviewAs({ personId: adminId }, odd.jobId, [
      "firstName",
      "lastName",
      "email",
      "committees",
      "entry",
      "status",
    ]);
    const remapped = await getRosterPreview(odd.jobId);
    expect(remapped?.counts).toEqual({ NEW: 1, CHANGED: 0, UNCHANGED: 0, ERROR: 0 });

    await discardRosterImportAs({ personId: adminId }, odd.jobId);
    const [job] = await db().select().from(importJob).where(eq(importJob.id, odd.jobId));
    expect(job?.status).toBe("DISCARDED");
    await expect(applyRosterImportAs({ personId: adminId }, odd.jobId)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      createRosterPreviewAs(
        { personId: adminId },
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
