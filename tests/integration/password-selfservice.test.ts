import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { hasRecentStepUp } from "@/modules/identity/domain/guards";
import {
  findPasswordHash,
  setOwnPassword,
  signInWithPassword,
  verifyStepUpPassword,
} from "@/modules/identity/domain/password";
import {
  hashPassword,
  LOGIN_MAX_PER_EMAIL,
  LOGIN_MAX_PER_IP,
  PERSON_PASSWORD_MAX_FAILED,
  PERSON_PASSWORD_WINDOW_MS,
  personAttemptKey,
  verifyPassword,
} from "@/modules/identity/domain/pure";
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
    const stale = new Date(Date.now() - 60 * 60_000);
    const uno = await createSession(db(), {
      personId: conCredencial,
      remember: true,
      userAgent: null,
      ip: null,
      now: stale,
    });
    const otro = await createSession(db(), {
      personId: sinCredencial,
      remember: true,
      userAgent: null,
      ip: null,
      now: stale,
    });
    const before = await db().select().from(session).orderBy(session.id);

    expect(
      await verifyStepUpPassword({
        personId: conCredencial,
        password: "otra clave larga",
        sessionId: uno.sessionId,
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(
      await verifyStepUpPassword({
        personId: sinCredencial,
        password: CLAVE,
        sessionId: otro.sessionId,
        ip: null,
      }),
    ).toEqual({ ok: false, reason: "INVALID" });
    expect(await db().select().from(loginAttempt)).toHaveLength(2);
    expect(await db().select().from(session).orderBy(session.id)).toEqual(before);
    for (const token of [uno.token, otro.token]) {
      const actor = await resolveActor(token);
      expect(actor).not.toBeNull();
      expect(actor && hasRecentStepUp(actor)).toBe(false);
    }
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
      ip: null,
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
        ip: null,
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
      ip: null,
    });

    expect(result).toEqual({ ok: true, closed: 0 });
    expect(await verifyPassword((await findPasswordHash(personId)) ?? "", NUEVA)).toBe(true);
    // Sin contraseña actual no hay nada que adivinar: no se anota ningún intento.
    expect(await db().select().from(loginAttempt)).toHaveLength(0);
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
        ip: null,
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

// El contador de quien tiene sesión es de la persona y no del correo (ADR-114, regla 2).
describe("fallos de contraseña de quien tiene sesión", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  const RED = "203.0.113.20";
  const mala = (i: number) => `mala ${i} bien larga`;

  async function conSesion(): Promise<{ personId: string; sessionId: string }> {
    const personId = await conClave();
    const abierta = await createSession(db(), {
      personId,
      remember: true,
      userAgent: null,
      ip: null,
    });
    return { personId, sessionId: abierta.sessionId };
  }

  const paso = (quien: { personId: string; sessionId: string }, password: string, now?: Date) =>
    verifyStepUpPassword({ ...quien, password, ip: RED, ...(now ? { now } : {}) });

  const cambiar = (
    quien: { personId: string; sessionId: string },
    current: string,
    password = NUEVA,
  ) =>
    setOwnPassword({
      personId: quien.personId,
      email: EMAIL,
      names: ["Rosa", "Sintética"],
      current,
      password,
      keepSessionId: quien.sessionId,
      ip: RED,
    });

  const ingresar = (email: string, password: string) =>
    signInWithPassword({ email, password, ip: RED, userAgent: "vitest", remember: false });

  const fallos = () => db().select().from(loginAttempt).where(eq(loginAttempt.succeeded, false));

  it("diez ingresos fallidos sin sesión con su correo no le impiden pasar el paso de seguridad", async () => {
    const quien = await conSesion();
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL; i += 1) {
      await ingresar(EMAIL, mala(i));
    }
    // El ingreso sin sesión conserva su regla: ese correo queda bloqueado desde afuera.
    expect(await ingresar(EMAIL, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });

    expect(await paso(quien, CLAVE)).toEqual({ ok: true });
    expect(await cambiar(quien, CLAVE)).toEqual({ ok: true, closed: 0 });
  });

  it("treinta ingresos fallidos sin sesión desde su misma red tampoco", async () => {
    const quien = await conSesion();
    for (let i = 0; i < LOGIN_MAX_PER_IP; i += 1) {
      await ingresar(`quemando-${i}@eafit.edu.co`, "una clave larga mala");
    }
    expect(await ingresar(EMAIL, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });

    expect(await paso(quien, CLAVE)).toEqual({ ok: true });
  });

  it("escribir la clave del contador donde va el correo del ingreso no lo mueve", async () => {
    const quien = await conSesion();
    for (let i = 0; i < LOGIN_MAX_PER_EMAIL; i += 1) {
      await ingresar(personAttemptKey(quien.personId), mala(i));
    }

    expect(await paso(quien, CLAVE)).toEqual({ ok: true });
  });

  it("diez contraseñas equivocadas bloquean el paso de seguridad, e insistir no alarga el bloqueo", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      expect(await paso(quien, mala(i))).toEqual({ ok: false, reason: "INVALID" });
    }

    expect(await paso(quien, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });
    expect(await paso(quien, mala(99))).toEqual({ ok: false, reason: "LOCKED" });
    expect(await fallos()).toHaveLength(PERSON_PASSWORD_MAX_FAILED);
  });

  it("los fallos de quien tiene sesión no le cierran el ingreso sin sesión", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      await paso(quien, mala(i));
    }
    expect(await paso(quien, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });

    expect((await ingresar(EMAIL, CLAVE)).ok).toBe(true);
  });

  it("a los quince minutos vuelve a dejar probar", async () => {
    const quien = await conSesion();
    // Un reloj que no es el de la base: la ventana se mide con la hora que entra al comando.
    const inicio = new Date(Date.now() - 2 * 60 * 60_000);
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      await paso(quien, mala(i), inicio);
    }
    const antes = new Date(inicio.getTime() + PERSON_PASSWORD_WINDOW_MS - 60_000);
    const despues = new Date(inicio.getTime() + PERSON_PASSWORD_WINDOW_MS + 60_000);

    expect(await paso(quien, CLAVE, antes)).toEqual({ ok: false, reason: "LOCKED" });
    expect(await paso(quien, CLAVE, despues)).toEqual({ ok: true });
  });

  it("pasar el paso de seguridad no gasta intentos", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED + 2; i += 1) {
      expect(await paso(quien, CLAVE)).toEqual({ ok: true });
    }
    expect(await fallos()).toHaveLength(0);
  });

  it("con nueve fallos, veinte intentos a la vez prueban una sola contraseña más", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED - 1; i += 1) {
      await paso(quien, mala(i));
    }

    const juntos = await Promise.all(
      Array.from({ length: 20 }, (_, i) => paso(quien, mala(100 + i))),
    );

    expect(juntos.filter((r) => !r.ok && r.reason === "INVALID")).toHaveLength(1);
    expect(juntos.filter((r) => !r.ok && r.reason === "LOCKED")).toHaveLength(19);
    expect(await fallos()).toHaveLength(PERSON_PASSWORD_MAX_FAILED);
  });

  it("la contraseña actual se puede probar diez veces al cambiarla, y no más", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      expect(await cambiar(quien, mala(i))).toEqual({ ok: false, reason: "CURRENT" });
    }

    expect(await cambiar(quien, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });
    expect(await verifyPassword((await findPasswordHash(quien.personId)) ?? "", CLAVE)).toBe(true);
    expect(await fallos()).toHaveLength(PERSON_PASSWORD_MAX_FAILED);
  });

  it("el cambio de contraseña y el paso de seguridad gastan el mismo contador", async () => {
    const quien = await conSesion();
    for (let i = 0; i < 6; i += 1) {
      await paso(quien, mala(i));
    }
    for (let i = 6; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      await cambiar(quien, mala(i));
    }

    expect(await paso(quien, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });
    expect(await cambiar(quien, CLAVE)).toEqual({ ok: false, reason: "LOCKED" });
  });

  it("equivocarse dos veces no estorba, y una contraseña nueva rechazada no cuenta como fallo", async () => {
    const quien = await conSesion();
    expect(await cambiar(quien, mala(1))).toEqual({ ok: false, reason: "CURRENT" });
    expect(await cambiar(quien, mala(2))).toEqual({ ok: false, reason: "CURRENT" });
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED; i += 1) {
      expect(await cambiar(quien, CLAVE, "corta")).toEqual({
        ok: false,
        reason: "PASSWORD",
        problem: "SHORT",
      });
    }

    expect(await cambiar(quien, CLAVE)).toEqual({ ok: true, closed: 0 });
    expect(await fallos()).toHaveLength(2);
  });

  it("con nueve fallos, veinte cambios a la vez prueban la contraseña actual una sola vez", async () => {
    const quien = await conSesion();
    for (let i = 0; i < PERSON_PASSWORD_MAX_FAILED - 1; i += 1) {
      await cambiar(quien, mala(i));
    }

    const juntos = await Promise.all(
      Array.from({ length: 20 }, (_, i) => cambiar(quien, mala(100 + i))),
    );

    expect(juntos.filter((r) => !r.ok && r.reason === "CURRENT")).toHaveLength(1);
    expect(juntos.filter((r) => !r.ok && r.reason === "LOCKED")).toHaveLength(19);
    expect(await fallos()).toHaveLength(PERSON_PASSWORD_MAX_FAILED);
  });
});
