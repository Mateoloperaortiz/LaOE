import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  grantPermission,
  listPermissions,
  revokePermission,
} from "@/modules/identity/domain/permissions";
import { permission } from "@/modules/identity/schema";
import { createTerm, findTermContaining, updateTerm } from "@/modules/participation/domain/terms";
import { term } from "@/modules/participation/schema";
import {
  createCommittee,
  getPublishedCommittee,
  listCommittees,
  listPublishedCommittees,
  searchCommittees,
  updateCommittee,
} from "@/modules/people/domain/committees";
import { searchPeople } from "@/modules/people/domain/people-reads";
import { membership, person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";

const db = () => getDb();

async function seedMember(email: string, firstName = "Persona", lastName = "Sintética") {
  let [current] = await db().select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db()
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  const [who] = await db()
    .insert(person)
    .values({ email, firstName, lastName, stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db().insert(membership).values({ personId: who.id, firstTermId: current.id });
  return who.id;
}

describe("comités", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea, audita, rechaza la sigla repetida y actualiza sin cambiar la sigla", async () => {
    const created = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "pixel",
        name: "Pixel",
        status: "ACTIVE",
        publicationStatus: "DRAFT",
      }),
    );
    expect(created.id).toBeTruthy();
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createCommittee(ctx, {
          slug: "pixel",
          name: "Otro",
          status: "ACTIVE",
          publicationStatus: "DRAFT",
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateCommittee(ctx, created.id, {
        slug: "cambiada",
        name: "Pixel Lab",
        status: "ACTIVE",
        publicationStatus: "PUBLISHED",
      }),
    );
    const { rows, total } = await listCommittees({ q: "lab", page: 1, pageSize: 10 });
    expect(total).toBe(1);
    expect(rows[0]).toMatchObject({
      slug: "pixel",
      name: "Pixel Lab",
      publicationStatus: "PUBLISHED",
    });
    const [audits] = await db().select({ n: count() }).from(auditLog);
    expect(audits?.n).toBe(2);
    expect(await searchCommittees("pixl")).toHaveLength(1);

    // Ficha pública: solo activos y publicados, sin nada del roster.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "borrador",
        name: "En borrador",
        status: "ACTIVE",
        publicationStatus: "DRAFT",
      }),
    );
    expect((await listPublishedCommittees()).map((item) => item.slug)).toEqual(["pixel"]);
    expect(await getPublishedCommittee("pixel")).toMatchObject({
      name: "Pixel Lab",
      slug: "pixel",
    });
    expect(await getPublishedCommittee("borrador")).toBeNull();
  });
});

describe("términos", () => {
  beforeEach(truncateAll);

  it("deriva el semestre, rechaza el código repetido y encuentra el término de una fecha", async () => {
    const created = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createTerm(ctx, {
        code: "2026-1",
        startsOn: "2026-01-20",
        endsOn: "2026-06-06",
        requiredOrdinaryAssemblies: 1,
        permanenceGeneralNominal: 50,
        permanenceCommitteeNominal: 60,
      }),
    );
    const [row] = await db().select().from(term).where(eq(term.id, created.id));
    expect(row?.semester).toBe(1);
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createTerm(ctx, {
          code: "2026-1",
          startsOn: "2026-01-20",
          endsOn: "2026-06-06",
          requiredOrdinaryAssemblies: 1,
          permanenceGeneralNominal: 50,
          permanenceCommitteeNominal: 60,
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateTerm(ctx, created.id, {
        code: "2026-1",
        startsOn: "2026-01-19",
        endsOn: "2026-06-06",
        requiredOrdinaryAssemblies: 2,
        permanenceGeneralNominal: 50,
        permanenceCommitteeNominal: 60,
      }),
    );
    expect((await findTermContaining("2026-03-01"))?.code).toBe("2026-1");
    expect(await findTermContaining("2026-07-01")).toBeNull();
  });
});

describe("permisos", () => {
  beforeEach(truncateAll);

  it("otorga por correo del roster, rechaza duplicados y correos ajenos, y protege al último ADMIN", async () => {
    const adminId = await seedMember("admin@eafit.edu.co", "Ada", "Admin");
    const otherId = await seedMember("otra@eafit.edu.co", "Otra", "Persona");
    const actor = { personId: adminId };
    const first = await runCommand(actor, (ctx) =>
      grantPermission(ctx, { email: "Admin@eafit.edu.co", code: "ADMIN" }),
    );
    await expect(
      runCommand(actor, (ctx) =>
        grantPermission(ctx, { email: "admin@eafit.edu.co", code: "ADMIN" }),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("Ya tiene") });
    await expect(
      runCommand(actor, (ctx) =>
        grantPermission(ctx, { email: "nadie@eafit.edu.co", code: "BOARD" }),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("roster") });

    await expect(runCommand(actor, (ctx) => revokePermission(ctx, first.id))).rejects.toMatchObject(
      {
        message: expect.stringContaining("último ADMIN"),
      },
    );
    const second = await runCommand(actor, (ctx) =>
      grantPermission(ctx, { email: "otra@eafit.edu.co", code: "ADMIN" }),
    );
    await runCommand(actor, (ctx) => revokePermission(ctx, first.id));
    const [remaining] = await db().select({ n: count() }).from(permission);
    expect(remaining?.n).toBe(1);

    const listed = await listPermissions({ q: "otra", page: 1, pageSize: 10 });
    expect(listed.total).toBe(1);
    expect(listed.rows[0]).toMatchObject({
      id: second.id,
      personId: otherId,
      personEmail: "otra@eafit.edu.co",
      grantedByName: "Ada Admin",
    });
    expect((await listPermissions({ q: "zzz", page: 1, pageSize: 10 })).total).toBe(0);
    expect((await searchPeople("ada")).map((item) => item.email)).toContain("admin@eafit.edu.co");
  });
});
