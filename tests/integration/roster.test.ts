import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { listPeople } from "@/modules/people/domain/persons";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
  remapRosterPreviewAs,
} from "@/modules/people/domain/roster";
import { committeeRole, consent, person } from "@/modules/people/schema";
import { PrivacyPolicyPendingError } from "@/modules/system";
import { appConfig, auditLog, importJob } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";
import { currentTermCode, seedCommittee, seedMember, seedTerm } from "./factories";

const db = () => getDb();
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
    ]);
    const first = await preview(adminId, termId, bytes);
    expect(first.counts).toEqual({ NEW: 4, CHANGED: 0, UNCHANGED: 0, ERROR: 0 });
    expect(first.missingTerms).toEqual(["2021-2", "2023-1", "2024-2"]);
    expect(first.proposals).toEqual([
      expect.objectContaining({ email: "prueba.mateo@eafit.edu.co", committeeName: "A3" }),
    ]);

    const summary = await applyRosterImportAs({ personId: adminId }, first.jobId);
    expect(summary).toMatchObject({ created: 4, updated: 0, unchanged: 0, skipped: 0 });
    expect(summary.termsCreated).toEqual(["2021-2", "2023-1", "2024-2"]);
    const [created] = await db().select().from(term).where(eq(term.code, "2024-2"));
    expect(created).toMatchObject({ startsOn: "2024-07-01", endsOn: "2024-12-31", semester: 2 });

    const listed = await listPeople({ q: "prueba.", page: 1, pageSize: 10 });
    expect(listed.total).toBe(4);
    const mateo = listed.rows.find((row) => row.email === "prueba.mateo@eafit.edu.co");
    expect(mateo).toMatchObject({
      stage: "MEMBER",
      membershipStatus: "ACTIVE",
      firstTermCode: "2024-2",
      committees: ["A3 · General", "PIXEL · Miembro"],
    });
    const juan = listed.rows.find((row) => row.email === "prueba.juan@eafit.edu.co");
    expect(juan).toMatchObject({ membershipStatus: "ON_LEAVE", committees: ["A3 · Financiero"] });
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
    expect(imported?.n).toBe(4);

    const second = await preview(adminId, termId, bytes);
    expect(second.counts).toEqual({ NEW: 0, CHANGED: 0, UNCHANGED: 4, ERROR: 0 });
    const again = await applyRosterImportAs({ personId: adminId }, second.jobId);
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 4 });
    const [people] = await db().select({ n: count() }).from(person);
    expect(people?.n).toBe(5);
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
    expect(data?.committeesByTerm[0]?.items[0]?.leftAt).not.toBeNull();
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
    expect(wrong.rows[2]?.errors[0]).toContain("no existe");
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
