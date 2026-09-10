import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  consumeAccessGrant,
  issueAccessGrantAs,
  resolveAccessGrant,
} from "@/modules/identity/domain/access-grant";
import { findPasswordHash, signInWithPassword } from "@/modules/identity/domain/password";
import { hashPassword, hashToken, verifyPassword } from "@/modules/identity/domain/pure";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { accessGrant, credential, session } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";

// Enlace de un solo uso que emite la junta (ADR-051).

const db = () => getDb();
const CLAVE = "trapecio verde 41";

async function seedMember(
  email: string,
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): Promise<string> {
  let [current] = await db().select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db()
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  const [who] = await db()
    .insert(person)
    .values({ email, firstName: "Camila", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db().insert(membership).values({ personId: who.id, status, firstTermId: current.id });
  return who.id;
}

describe("enlace de acceso", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("emite, audita y consume el enlace anterior de esa persona", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");

    const primero = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );
    const segundo = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    expect(await resolveAccessGrant(primero.token)).toBeNull();
    expect(await resolveAccessGrant(segundo.token)).toMatchObject({
      personId: destino,
      kind: "RECOVERY",
      name: "Camila",
    });
    const auditorias = await db()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.action, "access-grant.issued"));
    expect(auditorias).toHaveLength(2);
  });

  it("nunca guarda el token en claro", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");

    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    const filas = await db().select().from(accessGrant);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(filas)).not.toContain(token);
  });

  it("no deja emitir para uno mismo ni para quien no puede entrar", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const retirada = await seedMember("retirada@eafit.edu.co", "INACTIVE");

    await expect(
      issueAccessGrantAs({ personId: emisor }, { personId: emisor, kind: "RECOVERY" }),
    ).rejects.toThrow();
    await expect(
      issueAccessGrantAs({ personId: emisor }, { personId: retirada, kind: "ACTIVATION" }),
    ).rejects.toThrow();
    expect(await db().select().from(accessGrant)).toHaveLength(0);
  });

  it("fija la contraseña, cierra las sesiones viejas y deja una sesión que sí resuelve", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    // Una sesión anterior, como la de un celular perdido.
    const vieja = await createSession(db(), {
      personId: destino,
      remember: true,
      userAgent: "viejo",
      ip: null,
    });
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    const result = await consumeAccessGrant({
      token,
      password: CLAVE,
      ip: "10.0.0.9",
      userAgent: "vitest",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // La regresión que motivó la corrección de la regla 5: la sesión nueva tiene que resolver.
    expect((await resolveActor(result.token))?.personId).toBe(destino);
    expect(await resolveActor(vieja.token)).toBeNull();
    const sesiones = await db().select().from(session).where(eq(session.personId, destino));
    expect(sesiones).toHaveLength(1);
    const guardado = await findPasswordHash(destino);
    expect(guardado).not.toBeNull();
    expect(await verifyPassword(guardado ?? "", CLAVE)).toBe(true);
    const [fila] = await db().select().from(accessGrant);
    expect(fila?.consumedAt).not.toBeNull();
    expect(fila?.consumedIp).toBe("10.0.0.9");
  });

  it("la contraseña nueva sirve para entrar por el ingreso normal", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    await seedMember("destino@eafit.edu.co");
    const [destino] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, "destino@eafit.edu.co"));
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino?.id ?? "", kind: "ACTIVATION" },
    );
    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const entrada = await signInWithPassword({
      email: "destino@eafit.edu.co",
      password: CLAVE,
      ip: null,
      userAgent: null,
      remember: false,
    });

    expect(entrada.ok).toBe(true);
  });

  it("sirve una sola vez", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );
    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const otraVez = await consumeAccessGrant({
      token,
      password: "otra clave larga distinta",
      ip: null,
      userAgent: null,
    });

    expect(otraVez).toEqual({ ok: false, reason: "INVALID" });
    // La segunda no pisó la primera contraseña.
    expect(await verifyPassword((await findPasswordHash(destino)) ?? "", CLAVE)).toBe(true);
  });

  it("una contraseña que no pasa las reglas deja el enlace vivo", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    expect(
      await consumeAccessGrant({ token, password: "corta", ip: null, userAgent: null }),
    ).toEqual({
      ok: false,
      reason: "PASSWORD",
      problem: "SHORT",
    });
    expect(
      await consumeAccessGrant({ token, password: "camila y su clave", ip: null, userAgent: null }),
    ).toEqual({ ok: false, reason: "PASSWORD", problem: "PERSONAL" });

    expect(await resolveAccessGrant(token)).not.toBeNull();
    expect(await findPasswordHash(destino)).toBeNull();
  });

  it("un enlace vencido, desconocido o de persona retirada no resuelve", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "ACTIVATION" },
    );

    const enDosHoras = new Date(Date.now() + 2 * 60 * 60_000);
    expect(await resolveAccessGrant(token, enDosHoras)).toBeNull();
    expect(await resolveAccessGrant("un-token-inventado")).toBeNull();

    await db()
      .update(membership)
      .set({ status: "INACTIVE" })
      .where(eq(membership.personId, destino));
    expect(await resolveAccessGrant(token)).toBeNull();
  });

  it("reemplaza la contraseña anterior cuando es una recuperación", async () => {
    const emisor = await seedMember("junta@eafit.edu.co");
    const destino = await seedMember("destino@eafit.edu.co");
    await db()
      .insert(credential)
      .values({ personId: destino, passwordHash: await hashPassword("la vieja larga") });
    const { token } = await issueAccessGrantAs(
      { personId: emisor },
      { personId: destino, kind: "RECOVERY" },
    );

    await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });

    const guardado = (await findPasswordHash(destino)) ?? "";
    expect(await verifyPassword(guardado, CLAVE)).toBe(true);
    expect(await verifyPassword(guardado, "la vieja larga")).toBe(false);
    expect(await db().select().from(credential)).toHaveLength(1);
  });
});
