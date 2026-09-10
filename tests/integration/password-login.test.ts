import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { findPasswordHash, signInWithPassword } from "@/modules/identity/domain/password";
import {
  hashPassword,
  LOGIN_MAX_PER_EMAIL,
  LOGIN_MAX_PER_IP,
} from "@/modules/identity/domain/pure";
import { resolveActor } from "@/modules/identity/domain/session";
import { credential, loginAttempt } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";

// Ingreso con la contraseña propia (ADR-051): la respuesta no distingue quién está en el roster.

const db = () => getDb();
const CLAVE = "trapecio verde 41";
const IP = "10.0.0.7";

async function seedMember(
  email: string,
  status: "ACTIVE" | "HONORARY" | "ON_LEAVE" | "INACTIVE" = "ACTIVE",
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
    .values({ email, firstName: "Persona", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db().insert(membership).values({ personId: who.id, status, firstTermId: current.id });
  return who.id;
}

async function withPassword(email: string, status?: "ACTIVE" | "INACTIVE"): Promise<string> {
  const personId = await seedMember(email, status);
  await db()
    .insert(credential)
    .values({ personId, passwordHash: await hashPassword(CLAVE) });
  return personId;
}

async function failuresFor(email: string): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(loginAttempt)
    .where(eq(loginAttempt.email, email));
  return row?.n ?? 0;
}

const entrar = (email: string, password: string, ip: string | null = IP) =>
  signInWithPassword({ email, password, ip, userAgent: "vitest", remember: false });

describe("signInWithPassword", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("abre sesión con la contraseña correcta y registra el intento como exitoso", async () => {
    const personId = await withPassword("entra@eafit.edu.co");

    const result = await entrar("Entra@EAFIT.edu.co", CLAVE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.personId).toBe(personId);
    const actor = await resolveActor(result.token);
    expect(actor?.personId).toBe(personId);
    const [attempt] = await db().select().from(loginAttempt);
    expect(attempt?.succeeded).toBe(true);
    expect(attempt?.email).toBe("entra@eafit.edu.co");
  });

  it("responde igual y deja el mismo rastro con contraseña mala, sin credencial y sin persona", async () => {
    await withPassword("con-clave@eafit.edu.co");
    await seedMember("sin-clave@eafit.edu.co");

    const mala = await entrar("con-clave@eafit.edu.co", "otra cosa larga");
    const sinCredencial = await entrar("sin-clave@eafit.edu.co", CLAVE);
    const inexistente = await entrar("nadie@eafit.edu.co", CLAVE);

    for (const result of [mala, sinCredencial, inexistente]) {
      expect(result).toEqual({ ok: false, reason: "INVALID" });
    }
    expect(await failuresFor("con-clave@eafit.edu.co")).toBe(1);
    expect(await failuresFor("sin-clave@eafit.edu.co")).toBe(1);
    expect(await failuresFor("nadie@eafit.edu.co")).toBe(1);
  });

  it("no deja entrar a quien no está elegible, aunque tenga contraseña", async () => {
    await withPassword("retirada@eafit.edu.co", "INACTIVE");

    expect(await entrar("retirada@eafit.edu.co", CLAVE)).toEqual({ ok: false, reason: "INVALID" });
  });

  it("bloquea por correo y deja de registrar intentos mientras dura el bloqueo", async () => {
    await withPassword("bloqueo@eafit.edu.co");
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL; i += 1) {
      await entrar("bloqueo@eafit.edu.co", `mala ${i} larga`);
    }

    const bloqueado = await entrar("bloqueo@eafit.edu.co", CLAVE);

    expect(bloqueado).toEqual({ ok: false, reason: "LOCKED" });
    // Insistir no alarga el bloqueo: si lo hiciera, cualquiera dejaría a otra persona afuera.
    expect(await failuresFor("bloqueo@eafit.edu.co")).toBe(LOGIN_MAX_PER_EMAIL);
  });

  it("bloquea por IP aunque los correos sean distintos", async () => {
    for (let i = 0; i < LOGIN_MAX_PER_IP; i += 1) {
      await entrar(`quemando-${i}@eafit.edu.co`, "una clave larga mala");
    }
    const personId = await withPassword("victima@eafit.edu.co");

    expect(await entrar("victima@eafit.edu.co", CLAVE)).toEqual({ ok: false, reason: "LOCKED" });
    // La misma persona entra desde otra IP: el bloqueo es de la red, no de la cuenta.
    const otraIp = await entrar("victima@eafit.edu.co", CLAVE, "10.0.0.8");
    expect(otraIp.ok).toBe(true);
    if (otraIp.ok) expect(otraIp.personId).toBe(personId);
  });

  it("un ingreso exitoso no cuenta para el límite", async () => {
    await withPassword("limpia@eafit.edu.co");
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL + 2; i += 1) {
      const result = await entrar("limpia@eafit.edu.co", CLAVE);
      expect(result.ok).toBe(true);
    }
  });

  it("findPasswordHash devuelve null cuando la persona todavía no eligió contraseña", async () => {
    const personId = await seedMember("nueva@eafit.edu.co");

    expect(await findPasswordHash(personId)).toBeNull();
  });
});
