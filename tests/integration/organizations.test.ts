import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  addContactAs,
  addOrganizationNoteAs,
  createExternalContactAs,
  createOrganizationAs,
  createTaskAs,
  getOrganization,
  listContacts,
  listOrganizationInteractions,
  listOrganizationsOfPerson,
  listTasks,
  removeContactAs,
  searchOrganizations,
  setOrganizationTagsAs,
  setPrimaryContactAs,
  updateOrganizationAs,
} from "@/modules/crm";
import { person, tag } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember, seedOrganization, seedPerson } from "./factories";

// Organizaciones y contactos (ADR-037 regla 6): nombre único sin mayúsculas, contactos solo externos,
// un principal por organización, notas y tareas con sujeto organización, etiquetas y búsqueda.

const admin = { personId: null, ip: null };

describe("organizaciones", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea y edita con nombre único sin distinguir mayúsculas", async () => {
    const created = await createOrganizationAs(admin, {
      name: "Bienestar Universitario",
      kind: "EAFIT_UNIT",
      notes: "Apoya las integraciones.",
    });
    await expect(
      createOrganizationAs(admin, { name: "bienestar universitario", kind: "OTHER", notes: "" }),
    ).rejects.toThrow(t("T-950"));
    await updateOrganizationAs(admin, created.id, {
      name: "Bienestar Universitario",
      kind: "EAFIT_UNIT",
      website: "https://www.eafit.edu.co/bienestar",
      notes: "",
    });
    const row = await getOrganization(created.id);
    expect(row).toMatchObject({ website: "https://www.eafit.edu.co/bienestar", contactCount: 0 });
    expect((await searchOrganizations("bienest"))[0]?.id).toBe(created.id);
  });

  it("los contactos son personas externas, uno solo es el principal y se pueden quitar", async () => {
    const organizationId = await seedOrganization("Bancolombia");
    const member = await seedMember("miembro@eafit.edu.co");
    await expect(
      addContactAs(admin, organizationId, { personId: member, isPrimary: false }),
    ).rejects.toThrow(t("T-956"));
    const first = await createExternalContactAs(admin, organizationId, {
      firstName: "Clara",
      lastName: "Ruiz",
      email: "clara@bancolombia.test",
      phone: "3001234567",
      role: "Gerente de marca",
      isPrimary: true,
    });
    const [who] = await getDb().select().from(person).where(eq(person.id, first.personId));
    expect(who).toMatchObject({ kind: "EXTERNAL", stage: "PROSPECT", phone: "+573001234567" });
    const external = await seedPerson("otro@bancolombia.test", { kind: "EXTERNAL" });
    await addContactAs(admin, organizationId, { personId: external, isPrimary: true });
    await expect(
      addContactAs(admin, organizationId, { personId: external, isPrimary: false }),
    ).rejects.toThrow(t("T-957"));
    let contacts = await listContacts(organizationId);
    expect(contacts.map((item) => [item.personId, item.isPrimary])).toEqual([
      [external, true],
      [first.personId, false],
    ]);
    await setPrimaryContactAs(admin, organizationId, first.personId);
    contacts = await listContacts(organizationId);
    expect(contacts.find((item) => item.isPrimary)?.personId).toBe(first.personId);
    expect((await listOrganizationsOfPerson(first.personId))[0]).toMatchObject({
      name: "Bancolombia",
      isPrimary: true,
    });
    expect(await removeContactAs(admin, organizationId, external)).toBe(true);
    expect(await removeContactAs(admin, organizationId, external)).toBe(false);
    expect((await getOrganization(organizationId))?.contactCount).toBe(1);
  });

  it("guarda notas y tareas sobre la organización y etiquetas", async () => {
    const organizationId = await seedOrganization("Postobón");
    const admin2 = await seedMember("admin@eafit.edu.co");
    const actor = { personId: admin2, ip: null };
    await addOrganizationNoteAs(actor, organizationId, "Reunión el martes con la gerencia.");
    const timeline = await listOrganizationInteractions(organizationId);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      kind: "NOTE",
      summary: "Reunión el martes con la gerencia.",
    });
    await createTaskAs(actor, { title: "Enviar propuesta", kind: "GENERAL", organizationId });
    const tasks = await listTasks({ q: "", organizationId, page: 1, pageSize: 10 });
    expect(tasks.rows[0]).toMatchObject({ organizationId, organizationName: "Postobón" });
    const [a] = await getDb().insert(tag).values({ name: "Patrocinador" }).returning();
    if (!a) throw new Error("tag");
    await setOrganizationTagsAs(actor, organizationId, [a.id]);
    expect((await getOrganization(organizationId))?.tagNames).toEqual(["Patrocinador"]);
    await setOrganizationTagsAs(actor, organizationId, []);
    expect((await getOrganization(organizationId))?.tagNames).toEqual([]);
  });
});
