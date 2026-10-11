import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation, isUniqueViolation } from "@/db/errors";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { scoreRecompute } from "@/domain-events/participation";
import { permission } from "@/modules/identity/schema";
import {
  committee,
  committeeMembership,
  committeeRole,
  committeeRoleAssignment,
  membership,
  membershipTerm,
  person,
} from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { seedMembership, seedPermission, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

const db = () => getDb();

const createPerson = (email: string) => seedPerson(email);
const createTerm = () => seedTerm("2026-2", { startsOn: "2026-07-13", endsOn: "2026-12-05" });

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
    await seedMembership(personId, termId);
    await expect(
      db().insert(membership).values({ personId, firstTermId: termId }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "membership_person_unique"));
  });

  it("no duplica permisos globales ni por comité, y exige comité solo al líder", async () => {
    const personId = await createPerson("p@eafit.edu.co");
    const committeeId = await createCommittee("a3");
    await seedPermission(personId, "ADMIN");
    await expect(db().insert(permission).values({ personId, code: "ADMIN" })).rejects.toSatisfy(
      (error) => isUniqueViolation(error, "permission_global_unique"),
    );
    await seedPermission(personId, "COMMITTEE_LEADER", committeeId);
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

  it("admite un General titular y una codirección vivos por comité y término", async () => {
    const termId = await createTerm();
    const committeeId = await createCommittee("pixel");
    const first = await createPerson("g1@eafit.edu.co");
    const second = await createPerson("g2@eafit.edu.co");
    const third = await createPerson("g3@eafit.edu.co");
    // La pertenencia se conserva entre intentos: solo el cargo asignado choca con los índices.
    const assign = async (personId: string, coDirector: boolean) => {
      await db()
        .insert(committeeMembership)
        .values({ personId, committeeId, termId, roleCode: "GENERAL" })
        .onConflictDoNothing();
      const [row] = await db()
        .select({ id: committeeMembership.id })
        .from(committeeMembership)
        .where(eq(committeeMembership.personId, personId));
      if (!row) throw new Error("sin pertenencia");
      await db().insert(committeeRoleAssignment).values({
        membershipId: row.id,
        personId,
        committeeId,
        termId,
        roleCode: "GENERAL",
        coDirector,
      });
      return row.id;
    };
    const firstMembership = await assign(first, false);
    await assign(second, true);
    await expect(assign(third, false)).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "committee_role_assignment_titular_unique"),
    );
    // El mismo cargo no se repite en una pertenencia, ni siquiera como codirección.
    const logistics = {
      membershipId: firstMembership,
      personId: first,
      committeeId,
      termId,
      roleCode: "LOGISTICA",
    };
    await db()
      .insert(committeeRoleAssignment)
      .values({ ...logistics, coDirector: false });
    await expect(
      db()
        .insert(committeeRoleAssignment)
        .values({ ...logistics, coDirector: true }),
    ).rejects.toSatisfy((error) =>
      isUniqueViolation(error, "committee_role_assignment_membership_role_unique"),
    );

    await db()
      .update(committeeRoleAssignment)
      .set({ endedAt: new Date() })
      .where(eq(committeeRoleAssignment.personId, first));
    await db()
      .update(committeeMembership)
      .set({ leftAt: new Date() })
      .where(eq(committeeMembership.personId, first));
    await assign(third, false);
  });

  it("siembra el catálogo con la dirección, los obligatorios y las capacidades de ADR-058", async () => {
    const rows = await db().select().from(committeeRole);
    const byCode = new Map(rows.map((row) => [row.code, row]));
    expect(byCode.get("MERCADEO")?.label).toBe("Mercadeo");
    expect(byCode.get("GENERAL")?.required).toBe(true);
    expect(byCode.get("FINANCIERO")?.required).toBe(true);
    expect(byCode.get("MIEMBRO")?.isLeadership).toBe(false);
    expect(byCode.get("MIEMBRO")?.capabilities).toEqual([]);
    expect(byCode.get("GESTION_HUMANA")?.capabilities).toEqual(["ROSTER", "PERMANENCE"]);
    expect(byCode.get("GENERAL")?.capabilities).toContain("DIRECTION");
    for (const code of [
      "FINANCIERO",
      "PUBLICIDAD",
      "MERCADEO",
      "RELACIONES_PUBLICAS",
      "LOGISTICA",
      "GESTION_HUMANA",
    ]) {
      expect(byCode.get(code)?.isLeadership).toBe(true);
    }
    // Estatutos 2026 (ADR-060 regla 4): Publicidad retirado y reemplazado por Mercadeo; Logística con roster.
    expect(byCode.get("PUBLICIDAD")).toMatchObject({ retired: true, replacedByCode: "MERCADEO" });
    expect(byCode.get("MERCADEO")).toMatchObject({ retired: false, sortOrder: 3 });
    expect(byCode.get("LOGISTICA")?.capabilities).toEqual(["OCCASIONS", "EVENTS", "ROSTER"]);
    expect(
      rows
        .filter((row) => row.isLeadership && !row.retired)
        .map((row) => row.code)
        .sort(),
    ).toEqual([
      "FINANCIERO",
      "GENERAL",
      "GESTION_HUMANA",
      "LOGISTICA",
      "MERCADEO",
      "RELACIONES_PUBLICAS",
    ]);
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

  it("la condición del semestre es única por persona y término, y una por comité (ADR-060 regla 2)", async () => {
    const personId = await createPerson("condicion@eafit.edu.co");
    const termId = await createTerm();
    const a3 = await createCommittee("a3");
    await db().insert(membershipTerm).values({ personId, termId, probation: true });
    await expect(
      db().insert(membershipTerm).values({ personId, termId, probation: false }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "membership_term_person_term_unique"));
    await db()
      .insert(membershipTerm)
      .values({ personId, termId, committeeId: a3, probation: true });
    await expect(
      db().insert(membershipTerm).values({ personId, termId, committeeId: a3, probation: false }),
    ).rejects.toSatisfy((error) => isUniqueViolation(error, "membership_term_committee_unique"));
  });

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
        await ctx.emit(eventOf(scoreRecompute, { occasionId: "o1" }, { dedupeKey: "score:o1" }));
        await ctx.emit(eventOf(scoreRecompute, { occasionId: "o1" }, { dedupeKey: "score:o1" }));
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
