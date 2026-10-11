import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { grantPermissionAs } from "@/modules/identity";
import { consumeAccessGrant } from "@/modules/identity/domain/access-grant";
import { findPasswordHash } from "@/modules/identity/domain/password";
import { hashPassword, verifyPassword } from "@/modules/identity/domain/pure";
import { accessGrant, credential } from "@/modules/identity/schema";
import { auditLog } from "@/modules/system/schema";
import { BootstrapAccessError, bootstrapAccess } from "../../scripts/lib/bootstrap-access";
import { seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Arranque del acceso (ADR-051, regla 16): el único camino de vuelta cuando nadie puede entrar.

const db = () => getDb();

async function seedMember(
  email: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): Promise<string> {
  const termId = await seedTerm("2026-2", { startsOn: "2026-07-13", endsOn: "2026-12-05" });
  const personId = await seedPerson(email, { firstName: "Junta" });
  await seedMembership(personId, termId, status);
  return personId;
}

describe("bootstrapAccess", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("emite un enlace usable sin que nadie tenga sesión", async () => {
    const personId = await seedMember("arranque@eafit.edu.co");

    const result = await bootstrapAccess({ email: "Arranque@EAFIT.edu.co" });

    expect(result.personId).toBe(personId);
    expect(result.url).toContain("/activar/");
    const token = result.url.split("/activar/")[1] ?? "";
    const usado = await consumeAccessGrant({
      token,
      password: "caracol de tinta 91",
      ip: null,
      userAgent: null,
    });
    expect(usado.ok).toBe(true);
    expect(await findPasswordHash(personId)).not.toBeNull();
  });

  it("emite también para un ADMIN: es su camino de vuelta", async () => {
    const personId = await seedMember("arranque@eafit.edu.co");
    await grantPermissionAs(SYSTEM_ACTOR, { email: "arranque@eafit.edu.co", code: "ADMIN" });

    const result = await bootstrapAccess({ email: "arranque@eafit.edu.co", kind: "RECOVERY" });

    expect(result.personId).toBe(personId);
    const [fila] = await db().select().from(accessGrant);
    expect(fila).toMatchObject({ personId, issuedById: null, kind: "RECOVERY" });
  });

  it("queda auditado como emisión del sistema, sin emisor", async () => {
    await seedMember("arranque@eafit.edu.co");

    await bootstrapAccess({ email: "arranque@eafit.edu.co" });

    const [auditoria] = await db()
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(eq(auditLog.action, "access-grant.issued"));
    expect(auditoria?.actorId).toBeNull();
    const [fila] = await db().select().from(accessGrant);
    expect(fila?.issuedById).toBeNull();
    expect(fila?.kind).toBe("ACTIVATION");
  });

  it("acepta RECOVERY para quien ya tiene contraseña", async () => {
    const personId = await seedMember("arranque@eafit.edu.co");
    const previous = "caracol anterior 91";
    await db()
      .insert(credential)
      .values({ personId, passwordHash: await hashPassword(previous) });

    const result = await bootstrapAccess({ email: "arranque@eafit.edu.co", kind: "RECOVERY" });

    expect(result.url).toContain("/activar/");
    const [fila] = await db().select().from(accessGrant);
    expect(fila?.kind).toBe("RECOVERY");
    expect(
      await consumeAccessGrant({
        token: result.url.split("/activar/")[1] ?? "",
        password: "caracol renovado 92",
        ip: null,
        userAgent: null,
      }),
    ).toMatchObject({ ok: true });
    const stored = (await findPasswordHash(personId)) ?? "";
    expect(await verifyPassword(stored, "caracol renovado 92")).toBe(true);
    expect(await verifyPassword(stored, previous)).toBe(false);
  });

  it("rechaza un correo que no puede entrar y no deja rastro", async () => {
    await seedMember("retirada@eafit.edu.co", "INACTIVE");

    await expect(bootstrapAccess({ email: "retirada@eafit.edu.co" })).rejects.toThrow(
      BootstrapAccessError,
    );
    await expect(bootstrapAccess({ email: "nadie@eafit.edu.co" })).rejects.toThrow(
      BootstrapAccessError,
    );
    expect(await db().select().from(accessGrant)).toEqual([]);
  });

  it("rechaza una entrada mal formada sin decir por qué en detalle", async () => {
    await expect(bootstrapAccess({ email: "no-es-un-correo" })).rejects.toThrow(
      BootstrapAccessError,
    );
    await expect(bootstrapAccess({})).rejects.toThrow(BootstrapAccessError);
  });
});
