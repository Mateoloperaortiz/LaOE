import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { permission } from "@/modules/identity/schema";
import { term } from "@/modules/participation/schema";
import { committee, committeeMembership, membership, person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";

const db = () => getDb();

async function createPerson(email: string) {
  const [row] = await db()
    .insert(person)
    .values({ email, firstName: "Persona", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!row) throw new Error("sin persona");
  return row.id;
}

async function createTerm(code = "2026-2") {
  const [row] = await db()
    .insert(term)
    .values({ code, semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
    .returning({ id: term.id });
  if (!row) throw new Error("sin término");
  return row.id;
}

async function createCommittee(slug: string) {
  const [row] = await db()
    .insert(committee)
    .values({ slug, name: slug.toUpperCase() })
    .returning({ id: committee.id });
  if (!row) throw new Error("sin comité");
  return row.id;
}

describe("restricciones que no negocia el esquema", () => {
  beforeEach(truncateAll);

  it("exige el correo en minúsculas y único", async () => {
    await expect(createPerson("Mayusculas@eafit.edu.co")).rejects.toSatisfy((error) =>
      isCheckViolation(error, "person_email_lowercase"),
    );
    await createPerson("una@eafit.edu.co");
    await expect(createPerson("una@eafit.edu.co")).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "person_email_unique"),
    );
  });

  it("permite una sola membresía por persona", async () => {
    const personId = await createPerson("m@eafit.edu.co");
    const termId = await createTerm();
    await db().insert(membership).values({ personId, firstTermId: termId });
    await expect(
      db().insert(membership).values({ personId, firstTermId: termId }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "membership_person_unique"));
  });

  it("no duplica permisos globales ni por comité, y exige comité solo al líder", async () => {
    const personId = await createPerson("p@eafit.edu.co");
    const committeeId = await createCommittee("a3");
    await db().insert(permission).values({ personId, code: "ADMIN" });
    await expect(db().insert(permission).values({ personId, code: "ADMIN" })).rejects.toSatisfy(
      (error) => isUniqueViolation(error, "permission_global_unique"),
    );
    await db().insert(permission).values({ personId, code: "COMMITTEE_LEADER", committeeId });
    await expect(
      db().insert(permission).values({ personId, code: "COMMITTEE_LEADER", committeeId }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "permission_committee_unique"));
    await expect(
      db().insert(permission).values({ personId, code: "COMMITTEE_LEADER" }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "permission_committee_scope"));
    await expect(
      db().insert(permission).values({ personId, code: "ADMIN", committeeId }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "permission_committee_scope"));
  });

  it("admite un solo General vivo por comité y término", async () => {
    const termId = await createTerm();
    const committeeId = await createCommittee("pixel");
    const first = await createPerson("g1@eafit.edu.co");
    const second = await createPerson("g2@eafit.edu.co");
    await db()
      .insert(committeeMembership)
      .values({ personId: first, committeeId, termId, roleCode: "GENERAL" });
    await expect(
      db()
        .insert(committeeMembership)
        .values({ personId: second, committeeId, termId, roleCode: "GENERAL" }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "committee_membership_one_general"));

    await db()
      .update(committeeMembership)
      .set({ leftAt: new Date() })
      .where(eq(committeeMembership.personId, first));
    await db()
      .insert(committeeMembership)
      .values({ personId: second, committeeId, termId, roleCode: "GENERAL" });
  });

  it("rechaza un cargo que no está en el catálogo", async () => {
    const termId = await createTerm();
    const committeeId = await createCommittee("cigma");
    const personId = await createPerson("c@eafit.edu.co");
    await expect(
      db().insert(committeeMembership).values({ personId, committeeId, termId, roleCode: "REY" }),
    ).rejects.toThrow();
  });
});

describe("runCommand", () => {
  beforeEach(truncateAll);

  it("escribe mutación, auditoría y evento en la misma transacción", async () => {
    const personId = await runCommand(SYSTEM_ACTOR, async (ctx) => {
      const [row] = await ctx.tx
        .insert(person)
        .values({ email: "cmd@eafit.edu.co", firstName: "Ana", lastName: "Pérez" })
        .returning({ id: person.id });
      if (!row) throw new Error("sin fila");
      await ctx.audit({ action: "person.created", entityType: "person", entityId: row.id });
      await ctx.emit({ type: "person.created", payload: { personId: row.id } });
      return row.id;
    });
    const [audits] = await db().select({ n: count() }).from(auditLog);
    const [events] = await db().select({ n: count() }).from(outbox);
    expect(audits?.n).toBe(1);
    expect(events?.n).toBe(1);
    const [stored] = await db().select().from(person).where(eq(person.id, personId));
    expect(stored?.fullName).toBe("Ana Pérez");
  });

  it("si el comando falla no queda mutación ni auditoría", async () => {
    await expect(
      runCommand(SYSTEM_ACTOR, async (ctx) => {
        const [row] = await ctx.tx
          .insert(person)
          .values({ email: "falla@eafit.edu.co", firstName: "X", lastName: "Y" })
          .returning({ id: person.id });
        if (!row) throw new Error("sin fila");
        await ctx.audit({ action: "person.created", entityType: "person", entityId: row.id });
        throw new Error("algo salió mal después de auditar");
      }),
    ).rejects.toThrow(/algo salió mal/);
    const [people] = await db().select({ n: count() }).from(person);
    const [audits] = await db().select({ n: count() }).from(auditLog);
    expect(people?.n).toBe(0);
    expect(audits?.n).toBe(0);
  });

  it("colapsa eventos pendientes con la misma clave y admite otro cuando el anterior se procesó", async () => {
    const emitTwice = () =>
      runCommand(SYSTEM_ACTOR, async (ctx) => {
        await ctx.emit({
          type: "score.recompute",
          payload: { occasionId: "o1" },
          dedupeKey: "score:o1",
        });
        await ctx.emit({
          type: "score.recompute",
          payload: { occasionId: "o1" },
          dedupeKey: "score:o1",
        });
      });
    await emitTwice();
    let [pending] = await db().select({ n: count() }).from(outbox);
    expect(pending?.n).toBe(1);

    await db().update(outbox).set({ processedAt: new Date() });
    await emitTwice();
    [pending] = await db().select({ n: count() }).from(outbox);
    expect(pending?.n).toBe(2);
  });
});

// Vitest reutiliza el proceso: cerrar el pool evita que el runner se quede colgado.
process.on("beforeExit", () => {
  void closeDb();
});
