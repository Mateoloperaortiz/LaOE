import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { peopleResource } from "@/modules/people/admin";
import { listDirectory, listInternalRoster } from "@/modules/people/domain/directory";
import { anonymizePerson } from "@/modules/people/domain/membership";
import {
  collectPersonalData,
  ownContactSchema,
  requestDeletion,
  updateOwnContact,
} from "@/modules/people/domain/own-data";
import {
  createPerson,
  getPersonRecord,
  listPeople,
  personInputSchema,
  updatePerson,
} from "@/modules/people/domain/persons";
import { person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedCommittee, seedCommitteeMembership, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

const details = {
  documentType: "CC" as const,
  documentNumber: "0012345678",
  epikId: "00087654",
  birthDate: "2004-03-21",
};
const basics = {
  firstName: "Persona",
  lastName: "Sintética",
  email: "datos.sinteticos@eafit.edu.co",
  kind: "STUDENT" as const,
};

describe("datos privados del integrante", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("conserva campos omitidos al editar, actualiza uno y permite el borrado explícito", async () => {
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createPerson(ctx, { ...basics, ...details }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePerson(ctx, id, { ...basics, program: "Derecho" }),
    );
    expect(await getPersonRecord(id)).toMatchObject({ ...details, program: "Derecho" });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePerson(ctx, id, { ...basics, epikId: "00012345" }),
    );
    expect(await getPersonRecord(id)).toMatchObject({ ...details, epikId: "00012345" });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePerson(
        ctx,
        id,
        personInputSchema.parse({
          ...basics,
          documentType: "",
          documentNumber: "",
          epikId: "",
          birthDate: "",
        }),
      ),
    );
    expect(await getPersonRecord(id)).toMatchObject({
      documentType: null,
      documentNumber: null,
      epikId: null,
      birthDate: null,
    });
  });

  it("incluye datos en el export propio y ADMIN, conserva los datos al editar contacto y no los filtra al directorio", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("privado");
    const id = await seedMember(basics.email, basics);
    await seedCommitteeMembership(id, committeeId, termId);
    await runCommand(SYSTEM_ACTOR, (ctx) => updatePerson(ctx, id, { ...basics, ...details }));
    await runCommand({ personId: id, ip: null }, (ctx) =>
      updateOwnContact(
        ctx,
        id,
        ownContactSchema.parse({
          cardUid: "00 11 22 33",
          phone: "3001234567",
          personalEmail: "sintetica@example.com",
          documentNumber: "NO-DEBE-CAMBIAR",
          documentType: "CE",
          epikId: "NO-DEBE-CAMBIAR",
          birthDate: "1990-01-01",
        }),
      ),
    );
    expect((await collectPersonalData(id))?.person).toMatchObject(details);
    const admin = await listPeople({ q: "", personIds: [id], page: 1, pageSize: 1 });
    expect(admin.rows[0]).toMatchObject(details);
    const row = admin.rows[0];
    expect(row).toBeDefined();
    if (!row) throw new Error("No se encontró la persona sintética");
    expect(peopleResource.exportRow(row)).toMatchObject({
      [t("T-2010")]: "CC",
      [t("T-2011")]: "0012345678",
      [t("T-2012")]: "00087654",
      [t("T-2013")]: "2004-03-21",
    });
    const directory = await listDirectory({ q: "", committeeId: null, page: 1, pageSize: 10 });
    const roster = await listInternalRoster("privado");
    for (const publicView of [directory, roster]) {
      const serialized = JSON.stringify(publicView);
      for (const key of Object.keys(details)) expect(serialized).not.toContain(key);
      for (const value of [details.documentNumber, details.epikId, details.birthDate]) {
        expect(serialized).not.toContain(value);
      }
    }
  });

  it("anonimiza los cuatro campos y elimina su contenido de la auditoría", async () => {
    const id = await seedMember(basics.email, basics);
    await runCommand(SYSTEM_ACTOR, (ctx) => updatePerson(ctx, id, { ...basics, ...details }));
    await runCommand({ personId: id, ip: null }, (ctx) => requestDeletion(ctx, id));
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, id));
    const [row] = await getDb().select().from(person).where(eq(person.id, id));
    expect(row).toMatchObject({
      documentType: null,
      documentNumber: null,
      epikId: null,
      birthDate: null,
    });
    const audits = await getDb().select().from(auditLog).where(eq(auditLog.entityId, id));
    const serialized = JSON.stringify(audits);
    for (const value of [details.documentNumber, details.epikId, details.birthDate]) {
      expect(serialized).not.toContain(value);
    }
    expect((await collectPersonalData(id))?.person).toMatchObject({
      documentType: null,
      documentNumber: null,
      epikId: null,
      birthDate: null,
    });
  });
});
