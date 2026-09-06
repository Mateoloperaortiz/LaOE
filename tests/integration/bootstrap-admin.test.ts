import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { permission } from "@/modules/identity/schema";
import { findEligibleMemberByEmail } from "@/modules/people";
import { membership, person } from "@/modules/people/schema";
import { setConfig } from "@/modules/system";
import { auditLog, outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { type BootstrapAdminInput, bootstrapAdmin } from "../../scripts/lib/bootstrap-admin";
import { truncateAll } from "./db";
import { seedPerson } from "./factories";

const input: BootstrapAdminInput = {
  firstName: "Persona",
  lastName: "Sintética",
  email: "bootstrap.demo@eafit.edu.co",
  firstTerm: { code: "2040-1", startsOn: "2040-01-15", endsOn: "2040-06-15" },
};

beforeEach(truncateAll);

describe("bootstrap del primer ADMIN (ADR-039)", () => {
  it("habilita acceso con política pendiente sin consentimientos, comités ni bienvenida", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "privacy.policyVersion", "pendiente"));
    const result = await bootstrapAdmin(input);
    expect(result.status).toBe("created");
    const db = getDb();
    expect(await db.select().from(person)).toMatchObject([
      {
        id: result.personId,
        email: input.email,
        stage: "MEMBER",
        kind: "STUDENT",
        source: "BOOTSTRAP",
      },
    ]);
    expect(await db.select().from(membership)).toMatchObject([
      { personId: result.personId, status: "ACTIVE" },
    ]);
    expect(await db.select().from(permission)).toMatchObject([
      { personId: result.personId, code: "ADMIN", committeeId: null, grantedById: null },
    ]);
    expect(await db.select({ eventType: outbox.eventType }).from(outbox)).toEqual([
      { eventType: "permission.granted" },
    ]);
    const empty = await db.execute<{ total: string }>(sql`
      select (
        (select count(*) from consent) + (select count(*) from committee_membership) +
        (select count(*) from import_job) + (select count(*) from message) +
        (select count(*) from check_in) + (select count(*) from point_entry)
      )::text as total
    `);
    expect(empty.rows[0]?.total).toBe("0");
    const audit = await db
      .select({ action: auditLog.action, actor: auditLog.actorId })
      .from(auditLog);
    expect(audit).toEqual(
      expect.arrayContaining([
        { action: "term.created", actor: null },
        { action: "person.created", actor: null },
        { action: "membership.created", actor: null },
        { action: "permission.granted", actor: null },
      ]),
    );
    expect(await findEligibleMemberByEmail(input.email)).toMatchObject({ canSignIn: true });
    const session = await createSession(db, {
      personId: result.personId,
      remember: false,
      ip: null,
      userAgent: null,
    });
    expect(await resolveActor(session.token)).toMatchObject({
      personId: result.personId,
      isAdmin: true,
    });
  });

  it("repetir el correo normalizado no cambia los datos ni duplica auditoría", async () => {
    const first = await bootstrapAdmin(input);
    const before = await getDb().select().from(auditLog);
    const repeated = await bootstrapAdmin({
      ...input,
      firstName: "No reemplazar",
      email: input.email.toUpperCase(),
    });
    expect(repeated).toEqual({ status: "already-exists", personId: first.personId });
    expect(await getDb().select().from(person)).toMatchObject([{ firstName: input.firstName }]);
    expect(await getDb().select().from(auditLog)).toEqual(before);
    expect(await getDb().select().from(permission)).toHaveLength(1);
  });

  it("rechaza otro ADMIN y una persona existente sin conceder permisos", async () => {
    await seedPerson(input.email);
    await expect(bootstrapAdmin(input)).rejects.toThrow("persona sin ADMIN");
    expect(await getDb().select().from(permission)).toHaveLength(0);
    expect(await getDb().select().from(term)).toHaveLength(0);
    await bootstrapAdmin({ ...input, email: "first-admin.demo@eafit.edu.co" });
    await expect(
      bootstrapAdmin({ ...input, email: "second-admin.demo@eafit.edu.co" }),
    ).rejects.toThrow("Ya existe un ADMIN");
    expect(await getDb().select().from(permission)).toHaveLength(1);
    expect(await getDb().select().from(person)).toHaveLength(2);
  });

  it("no modifica un término existente con fechas distintas", async () => {
    await getDb()
      .insert(term)
      .values({ ...input.firstTerm, semester: 1, startsOn: "2040-01-01" });
    await expect(bootstrapAdmin(input)).rejects.toThrow("otras fechas");
    expect(await getDb().select().from(person)).toHaveLength(0);
    expect(await getDb().select().from(term)).toMatchObject([{ startsOn: "2040-01-01" }]);
  });

  it("dos bootstraps concurrentes no conceden dos permisos ADMIN", async () => {
    const results = await Promise.allSettled([
      bootstrapAdmin(input),
      bootstrapAdmin({ ...input, email: "concurrent-admin.demo@eafit.edu.co" }),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect(await getDb().select().from(person)).toHaveLength(1);
    expect(await getDb().select().from(permission)).toHaveLength(1);
  });

  it("revierte todo si falla la auditoría final del permiso", async () => {
    const db = getDb();
    await db.execute(sql`
      create function reject_bootstrap_grant() returns trigger language plpgsql as $$
      begin
        if NEW.action = 'permission.granted' then raise exception 'fallo simulado del bootstrap'; end if;
        return NEW;
      end $$;
      create trigger reject_bootstrap_grant before insert on audit_log
      for each row execute function reject_bootstrap_grant();
    `);
    try {
      await expect(bootstrapAdmin(input)).rejects.toThrow();
      for (const table of [person, membership, permission, term, auditLog, outbox]) {
        expect(await db.select().from(table)).toHaveLength(0);
      }
    } finally {
      await db.execute(
        sql`drop trigger reject_bootstrap_grant on audit_log; drop function reject_bootstrap_grant()`,
      );
    }
  });

  it("valida identidad y fechas antes de escribir", async () => {
    await expect(bootstrapAdmin({ ...input, email: "demo@example.org" })).rejects.toThrow(
      "institucional",
    );
    await expect(
      bootstrapAdmin({ ...input, firstTerm: { ...input.firstTerm, endsOn: "2039-01-01" } }),
    ).rejects.toThrow();
    expect(await getDb().select().from(person)).toHaveLength(0);
    expect(await getDb().select().from(term)).toHaveLength(0);
    expect(
      await getDb().select().from(auditLog).where(eq(auditLog.action, "person.created")),
    ).toHaveLength(0);
  });
});
