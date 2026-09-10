import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { hasRecentStepUp } from "@/modules/identity/domain/guards";
import {
  findPasswordHash,
  setOwnPassword,
  verifyStepUpPassword,
} from "@/modules/identity/domain/password";
import { hashPassword, LOGIN_MAX_PER_EMAIL, verifyPassword } from "@/modules/identity/domain/pure";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { credential, loginAttempt, session } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";

// Step-up con la contraseña propia y contraseña desde Ajustes (ADR-051, reglas 7 y 8).

const db = () => getDb();
const CLAVE = "trapecio verde 41";
const NUEVA = "bulevar de tinta 88";
const EMAIL = "propia@eafit.edu.co";

async function seedMember(email: string): Promise<string> {
  let [current] = await db().select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!current) {
    [current] = await db()
      .insert(term)
      .values({ code: "2026-2", semester: 2, startsOn: "2026-07-13", endsOn: "2026-12-05" })
      .returning({ id: term.id });
  }
  const [who] = await db()
    .insert(person)
    .values({ email, firstName: "Rosa", lastName: "Sintética", stage: "MEMBER" })
    .returning({ id: person.id });
  if (!who || !current) throw new Error("seed");
  await db()
    .insert(membership)
    .values({ personId: who.id, status: "ACTIVE", firstTermId: current.id });
  return who.id;
}

async function conClave(email = EMAIL): Promise<string> {
  const personId = await seedMember(email);
  await db()
    .insert(credential)
    .values({ personId, passwordHash: await hashPassword(CLAVE) });
  return personId;
}

describe("verifyStepUpPassword", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("estampa la marca de step-up con la contraseña correcta", async () => {
    const personId = await conClave();
    // Una sesión vieja, con la marca fuera de la ventana de 15 minutos.
    const hace1h = new Date(Date.now() - 60 * 60_000);
    const abierta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
      now: hace1h,
    });
    expect(hasRecentStepUp((await resolveActor(abierta.token)) ?? ({} as never))).toBe(false);

    const result = await verifyStepUpPassword({
      personId,
      email: EMAIL,
      password: CLAVE,
      sessionId: abierta.sessionId,
      ip: "10.0.0.4",
    });

    expect(result).toEqual({ ok: true });
    const actor = await resolveActor(abierta.token);
    expect(actor && hasRecentStepUp(actor)).toBe(true);
  });

  it("no estampa nada con la contraseña equivocada ni sin credencial", async () => {
    const conCredencial = await conClave();
    const sinCredencial = await seedMember("sin-clave@eafit.edu.co");
    const uno = await createSession(db(), {
      personId: conCredencial,
      remember: true,
      userAgent: null,
      ip: null,
    });
    const otro = await createSession(db(), {
      personId: sinCredencial,
      remember: true,
      userAgent: null,
      ip: null,
    });

    expect(
      await verifyStepUpPassword({
        personId: conCredencial,
        email: EMAIL,
        password: "otra clave larga",
        sessionId: uno.sessionId,
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(
      await verifyStepUpPassword({
        personId: sinCredencial,
        email: "sin-clave@eafit.edu.co",
        password: CLAVE,
        sessionId: otro.sessionId,
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(await db().select().from(loginAttempt)).toHaveLength(2);
  });

  it("respeta el mismo límite que el ingreso", async () => {
    const personId = await conClave();
    const abierta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL; i += 1) {
      await verifyStepUpPassword({
        personId,
        email: EMAIL,
        password: `mala ${i} larga`,
        sessionId: abierta.sessionId,
        ip: null,
      });
    }

    expect(
      await verifyStepUpPassword({
        personId,
        email: EMAIL,
        password: CLAVE,
        sessionId: abierta.sessionId,
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "LOCKED" });
  });
});

describe("setOwnPassword", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("cambia la contraseña, conserva esta sesión y cierra las demás", async () => {
    const personId = await conClave();
    const esta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: "esta",
      ip: null,
    });
    const otra = await createSession(db(), {
      personId,
      remember: true,
      userAgent: "otra",
      ip: null,
    });

    const result = await setOwnPassword({
      personId,
      email: EMAIL,
      names: ["Rosa", "Sintética"],
      current: CLAVE,
      password: NUEVA,
      keepSessionId: esta.sessionId,
    });

    expect(result).toEqual({ ok: true, closed: 1 });
    expect((await resolveActor(esta.token))?.personId).toBe(personId);
    expect(await resolveActor(otra.token)).toBeNull();
    expect(await db().select().from(session)).toHaveLength(1);
    const guardado = (await findPasswordHash(personId)) ?? "";
    expect(await verifyPassword(guardado, NUEVA)).toBe(true);
    expect(await verifyPassword(guardado, CLAVE)).toBe(false);
  });

  it("exige la contraseña actual cuando ya hay una", async () => {
    const personId = await conClave();
    const esta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });

    expect(
      await setOwnPassword({
        personId,
        email: EMAIL,
        names: ["Rosa"],
        current: "la equivocada larga",
        password: NUEVA,
        keepSessionId: esta.sessionId,
      }),
    ).toEqual({ ok: false, reason: "CURRENT" });
    expect(await verifyPassword((await findPasswordHash(personId)) ?? "", CLAVE)).toBe(true);
  });

  it("crea la primera sin pedir la actual: quien no tiene ninguna llega con step-up", async () => {
    const personId = await seedMember(EMAIL);
    const esta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });

    const result = await setOwnPassword({
      personId,
      email: EMAIL,
      names: ["Rosa"],
      current: "",
      password: NUEVA,
      keepSessionId: esta.sessionId,
    });

    expect(result).toEqual({ ok: true, closed: 0 });
    expect(await verifyPassword((await findPasswordHash(personId)) ?? "", NUEVA)).toBe(true);
  });

  it("aplica las mismas reglas de contraseña que la activación", async () => {
    const personId = await conClave();
    const esta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });
    const cambiar = (password: string) =>
      setOwnPassword({
        personId,
        email: EMAIL,
        names: ["Rosa", "Sintética"],
        current: CLAVE,
        password,
        keepSessionId: esta.sessionId,
      });

    expect(await cambiar("corta")).toEqual({ ok: false, reason: "PASSWORD", problem: "SHORT" });
    expect(await cambiar("qwertyuiop")).toEqual({
      ok: false,
      reason: "PASSWORD",
      problem: "COMMON",
    });
    expect(await cambiar("rosa y su clave")).toEqual({
      ok: false,
      reason: "PASSWORD",
      problem: "PERSONAL",
    });
    expect(await verifyPassword((await findPasswordHash(personId)) ?? "", CLAVE)).toBe(true);
  });
});
