import { randomUUID } from "node:crypto";
import { count, desc, eq, sum } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { getEnv } from "@/env";
import { setMailTransportsForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { pruneIdentity } from "@/modules/identity/domain/maintenance";
import {
  requestOtp,
  type VerifyOtpResult,
  verifyOtp,
  verifyStepUp,
} from "@/modules/identity/domain/otp";
import { signInWithPassword } from "@/modules/identity/domain/password";
import {
  emailLogDigest,
  hashCode,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_FAILED_PER_EMAIL,
  OTP_MAX_PER_EMAIL,
  OTP_MAX_PER_IP,
  otpAttemptBudget,
} from "@/modules/identity/domain/pure";
import {
  destroySessionsFor,
  listSessionsFor,
  resolveActor,
} from "@/modules/identity/domain/session";
import { otpChallenge, permission, session } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import {
  type MailMessage,
  type MailTransport,
  type MailTransports,
  QuotaExceededError,
} from "@/shared/adapters/mail";
import { tList } from "@/shared/copy";
import { captureLogs, expectNoEmail, recordsOf } from "../helpers/logs";
import { truncateAll } from "./db";

const db = () => getDb();
const CODE = process.env.OTP_FIXED_CODE ?? "123456";
const sent: MailMessage[] = [];

async function seedMember(
  email: string,
  status: "ACTIVE" | "HONORARY" | "ON_LEAVE" | "INACTIVE" = "ACTIVE",
) {
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

async function challengesFor(email: string) {
  const [row] = await db()
    .select({ n: count() })
    .from(otpChallenge)
    .where(eq(otpChallenge.email, email));
  return row?.n ?? 0;
}

/** Lo que el correo lleva fallado: la suma de los intentos de sus retos. */
async function failedAttemptsFor(email: string) {
  const [row] = await db()
    .select({ n: sum(otpChallenge.attempts) })
    .from(otpChallenge)
    .where(eq(otpChallenge.email, email));
  return Number(row?.n ?? 0);
}

function captureMail() {
  sent.length = 0;
  setMailTransportsForTests({
    primary: {
      name: "console",
      async send(message) {
        sent.push(message);
        return { id: null };
      },
    },
    overflow: null,
  });
}

/** Un transporte que no logra enviar: lanza el error que le den. */
function failing(name: MailTransport["name"], error: Error): MailTransport {
  return {
    name,
    async send() {
      throw error;
    },
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const WRONG = "000000";

function attempt(email: string, code: string, now = new Date()): Promise<VerifyOtpResult> {
  return verifyOtp({ email, code, ip: null, userAgent: null, remember: false, now });
}

describe("requestOtp", () => {
  beforeEach(async () => {
    await truncateAll();
    sent.length = 0;
    setMailTransportsForTests({
      primary: {
        name: "console",
        async send(message) {
          sent.push(message);
          return { id: null };
        },
      },
      overflow: null,
    });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("deja un reto señuelo y no envía correo si el correo no está en el roster", async () => {
    await requestOtp({ email: "nadie@eafit.edu.co", ip: "1.1.1.1" });
    expect(await challengesFor("nadie@eafit.edu.co")).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("permite OTP en licencia y mantiene fuera a las personas retiradas", async () => {
    await seedMember("licencia@eafit.edu.co", "ON_LEAVE");
    await seedMember("retirada@eafit.edu.co", "INACTIVE");
    await requestOtp({ email: "licencia@eafit.edu.co", ip: "1.1.1.1" });
    await requestOtp({ email: "retirada@eafit.edu.co", ip: "1.1.1.1" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("licencia@eafit.edu.co");
    expect(await attempt("retirada@eafit.edu.co", CODE)).toMatchObject({ ok: false });
    expect(await attempt("licencia@eafit.edu.co", CODE)).toMatchObject({ ok: true });
  });

  it("crea el reto y manda el código a un miembro activo, normalizando el correo", async () => {
    await seedMember("activa@eafit.edu.co");
    await requestOtp({ email: "  Activa@EAFIT.edu.co ", ip: "1.1.1.1" });
    expect(await challengesFor("activa@eafit.edu.co")).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("activa@eafit.edu.co");
    expect(sent[0]?.text).toContain(CODE);
    expect(sent[0]?.text).toContain("Persona");
    expect(sent[0]?.text).not.toContain("**");
  });

  // ADR-050: el asunto se guarda en `message` y se ve en la administración y en el proveedor.
  it("nunca pone el código en el asunto, ni en el mensaje ni en la fila de `message`", async () => {
    const personId = await seedMember("secreto@eafit.edu.co");
    await requestOtp({ email: "secreto@eafit.edu.co", ip: "1.1.1.1" });
    const asunto = sent[0]?.subject ?? "";
    expect(asunto).not.toContain(CODE);
    expect(asunto).not.toMatch(/\d{6}/);
    const [fila] = await db()
      .select({ subject: message.subject })
      .from(message)
      .where(eq(message.personId, personId));
    expect(fila?.subject).toBe(asunto);
    expect(fila?.subject ?? "").not.toMatch(/\d{6}/);
  });

  it("manda un documento HTML completo, con pie transaccional y cabeceras de correo automático", async () => {
    await seedMember("forma@eafit.edu.co");
    await requestOtp({ email: "forma@eafit.edu.co", ip: "1.1.1.1" });
    const correo = sent[0];
    expect(correo?.html ?? "").toContain("<!doctype html>");
    expect(correo?.html ?? "").toContain(CODE);
    // El pie de campañas invita a darse de baja: en un transaccional lo clasifica como masivo.
    expect(correo?.text ?? "").not.toContain(
      tList("T-208")[3].replace("{enlace de baja si aplica}", "").trim(),
    );
    expect(correo?.text ?? "").toContain(tList("T-2092")[3]);
    expect(correo?.headers).toMatchObject({
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
    });
  });

  it("limita a cinco solicitudes por correo en quince minutos", async () => {
    await seedMember("limite@eafit.edu.co");
    for (let i = 0; i < OTP_MAX_PER_EMAIL + 2; i += 1) {
      await requestOtp({ email: "limite@eafit.edu.co", ip: "1.1.1.1" });
    }
    expect(await challengesFor("limite@eafit.edu.co")).toBe(OTP_MAX_PER_EMAIL);
    expect(sent).toHaveLength(OTP_MAX_PER_EMAIL);
  });

  it("limita a doce solicitudes por IP en quince minutos", async () => {
    const emails = ["a", "b", "c", "d"].map((letter) => `${letter}@eafit.edu.co`);
    for (const email of emails) await seedMember(email);
    let total = 0;
    for (const email of emails) {
      for (let i = 0; i < 4; i += 1) {
        await requestOtp({ email, ip: "9.9.9.9" });
        total += 1;
      }
    }
    expect(total).toBe(16);
    expect(sent).toHaveLength(OTP_MAX_PER_IP);
  });
});

describe("verifyOtp y sesiones", () => {
  beforeEach(async () => {
    await truncateAll();
    setMailTransportsForTests({
      primary: {
        name: "console",
        async send() {
          return { id: null };
        },
      },
      overflow: null,
    });
  });

  it("rechaza sin reto vivo, cuenta intentos y bloquea al quinto error", async () => {
    await seedMember("v@eafit.edu.co");
    const base = { email: "v@eafit.edu.co", ip: null, userAgent: null, remember: false };
    expect(await verifyOtp({ ...base, code: CODE })).toMatchObject({
      ok: false,
      reason: "EXPIRED",
    });

    await requestOtp({ email: "v@eafit.edu.co", ip: null });
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await verifyOtp({ ...base, code: "000000" })).toEqual({
        ok: false,
        reason: "INVALID",
        attemptsLeft: 5 - attempt,
      });
    }
    expect(await verifyOtp({ ...base, code: "000000" })).toEqual({
      ok: false,
      reason: "LOCKED",
      attemptsLeft: 0,
    });
    expect(await verifyOtp({ ...base, code: CODE })).toMatchObject({ ok: false, reason: "LOCKED" });
  });

  it("un reto vencido no sirve", async () => {
    const personId = await seedMember("vencido@eafit.edu.co");
    expect(personId).toBeTruthy();
    await db()
      .insert(otpChallenge)
      .values({
        email: "vencido@eafit.edu.co",
        codeHash: hashCode(process.env.SESSION_SECRET ?? "", "vencido@eafit.edu.co", CODE),
        expiresAt: new Date(Date.now() - 1_000),
      });
    expect(
      await verifyOtp({
        email: "vencido@eafit.edu.co",
        code: CODE,
        ip: null,
        userAgent: null,
        remember: false,
      }),
    ).toMatchObject({ ok: false, reason: "EXPIRED" });
  });

  it("con el código correcto consume el reto, abre la sesión y resuelve el actor con sus permisos", async () => {
    const personId = await seedMember("ok@eafit.edu.co", "HONORARY");
    await db().insert(permission).values({ personId, code: "ADMIN" });
    await requestOtp({ email: "ok@eafit.edu.co", ip: "2.2.2.2" });
    const result = await verifyOtp({
      email: "ok@eafit.edu.co",
      code: CODE,
      ip: "2.2.2.2",
      userAgent: "Mozilla/5.0 (Macintosh) Chrome/128.0 Safari/537.36",
      remember: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const days = (result.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);

    const [challenge] = await db().select().from(otpChallenge);
    expect(challenge?.consumedAt).toBeInstanceOf(Date);

    const actor = await resolveActor(result.token);
    expect(actor).toMatchObject({
      personId,
      isAdmin: true,
      membershipStatus: "HONORARY",
      name: "Persona",
    });
    expect(actor?.permissions).toEqual([{ code: "ADMIN", committeeId: null }]);

    expect(await resolveActor("token-inventado")).toBeNull();
  });

  it("cambiar el estado de la membresía deja el actor sin acceso y destruir sesiones las borra", async () => {
    const personId = await seedMember("estado@eafit.edu.co");
    await requestOtp({ email: "estado@eafit.edu.co", ip: null });
    const first = await verifyOtp({
      email: "estado@eafit.edu.co",
      code: CODE,
      ip: null,
      userAgent: null,
      remember: false,
    });
    await requestOtp({ email: "estado@eafit.edu.co", ip: null });
    const second = await verifyOtp({
      email: "estado@eafit.edu.co",
      code: CODE,
      ip: null,
      userAgent: null,
      remember: false,
    });
    if (!first.ok || !second.ok) throw new Error("login");
    expect(await listSessionsFor(personId)).toHaveLength(2);

    await db()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, personId));
    expect(await resolveActor(first.token)).toMatchObject({
      membershipStatus: "ON_LEAVE",
      permissions: [],
      isAdmin: false,
    });

    expect(await destroySessionsFor(db(), personId, second.sessionId)).toBe(1);
    const [remaining] = await db().select({ n: count() }).from(session);
    expect(remaining?.n).toBe(1);
    expect(await destroySessionsFor(db(), personId)).toBe(1);
  });
});

// ADR-113, regla 2: pedir y probar un código responde igual para un correo del roster y para uno
// de afuera. El de afuera deja un reto señuelo, que nadie puede cumplir y no envía nada.
describe("reto señuelo del ingreso por código (ADR-113)", () => {
  beforeEach(async () => {
    await truncateAll();
    captureMail();
  });

  it("probar un código equivocado responde igual para un correo del roster y para uno de afuera, y afuera no llega nada", async () => {
    await seedMember("adentro@eafit.edu.co");
    const recorridos: VerifyOtpResult[][] = [];
    for (const email of ["adentro@eafit.edu.co", "afuera@eafit.edu.co"]) {
      await requestOtp({ email, ip: "3.3.3.3" });
      const respuestas: VerifyOtpResult[] = [];
      for (let i = 0; i < 6; i += 1) {
        respuestas.push(await attempt(email, WRONG));
      }
      recorridos.push(respuestas);
    }
    const [adentro, afuera] = recorridos;

    expect(adentro?.[0]).toEqual({ ok: false, reason: "INVALID", attemptsLeft: 4 });
    expect(adentro?.[5]).toEqual({ ok: false, reason: "LOCKED", attemptsLeft: 0 });
    expect(afuera).toEqual(adentro);
    expect(sent.map((mail) => mail.to)).toEqual(["adentro@eafit.edu.co"]);
  });

  it("el reto señuelo no abre sesión ni con el código fijo del entorno, tampoco para quien ya se retiró", async () => {
    await seedMember("retirada@eafit.edu.co", "INACTIVE");
    for (const email of ["afuera@eafit.edu.co", "retirada@eafit.edu.co"]) {
      await requestOtp({ email, ip: null });
      expect(await attempt(email, CODE)).toEqual({
        ok: false,
        reason: "INVALID",
        attemptsLeft: 4,
      });
    }
    expect(sent).toHaveLength(0);
    const [sesiones] = await db().select({ n: count() }).from(session);
    expect(sesiones?.n).toBe(0);
  });

  it("un correo de afuera gasta el mismo límite de solicitudes por correo", async () => {
    for (let i = 0; i < OTP_MAX_PER_EMAIL + 2; i += 1) {
      await requestOtp({ email: "afuera@eafit.edu.co", ip: "4.4.4.4" });
    }
    expect(await challengesFor("afuera@eafit.edu.co")).toBe(OTP_MAX_PER_EMAIL);
    expect(sent).toHaveLength(0);
  });

  it("las solicitudes de correos de afuera gastan el límite por IP igual que las de un miembro", async () => {
    await seedMember("vecina@eafit.edu.co");
    for (let i = 0; i < OTP_MAX_PER_IP; i += 1) {
      await requestOtp({ email: `afuera-${i}@eafit.edu.co`, ip: "5.5.5.5" });
    }
    await requestOtp({ email: "vecina@eafit.edu.co", ip: "5.5.5.5" });
    expect(sent).toHaveLength(0);
  });

  it("un miembro que se equivoca dos veces y acierta a la tercera entra", async () => {
    const personId = await seedMember("tercera@eafit.edu.co");
    await requestOtp({ email: "tercera@eafit.edu.co", ip: null });
    expect(await attempt("tercera@eafit.edu.co", WRONG)).toMatchObject({ attemptsLeft: 4 });
    expect(await attempt("tercera@eafit.edu.co", WRONG)).toMatchObject({ attemptsLeft: 3 });
    expect(await attempt("tercera@eafit.edu.co", CODE)).toMatchObject({ ok: true, personId });
  });
});

// ADR-113, regla 3: quince códigos equivocados en veinticuatro horas dejan al correo sin códigos
// nuevos hasta que la ventana corra. Pedir responde lo de siempre.
describe("tope acumulado del ingreso por código (ADR-113)", () => {
  beforeEach(async () => {
    await truncateAll();
    captureMail();
  });

  async function failRounds(email: string, rounds: number, perRound: number) {
    const respuestas: VerifyOtpResult[] = [];
    for (let round = 0; round < rounds; round += 1) {
      await expect(requestOtp({ email, ip: null })).resolves.toBeUndefined();
      for (let i = 0; i < perRound; i += 1) {
        respuestas.push(await attempt(email, WRONG));
      }
    }
    return respuestas;
  }

  it("tras quince códigos equivocados en un día deja de emitir códigos para ese correo", async () => {
    await seedMember("tope@eafit.edu.co");
    // Cinco solicitudes caben en el límite de quince minutos: sin tope son veinticinco intentos.
    await failRounds("tope@eafit.edu.co", OTP_MAX_PER_EMAIL, 5);
    expect(await failedAttemptsFor("tope@eafit.edu.co")).toBe(15);
    expect(sent).toHaveLength(3);
  });

  it("el código que llega cerca del tope trae solo los intentos que le quedan al correo", async () => {
    await seedMember("cerca@eafit.edu.co");
    await failRounds("cerca@eafit.edu.co", 3, 4);
    expect(await failedAttemptsFor("cerca@eafit.edu.co")).toBe(12);

    await requestOtp({ email: "cerca@eafit.edu.co", ip: null });
    expect(await attempt("cerca@eafit.edu.co", WRONG)).toEqual({
      ok: false,
      reason: "INVALID",
      attemptsLeft: 2,
    });
    expect(await attempt("cerca@eafit.edu.co", WRONG)).toMatchObject({ attemptsLeft: 1 });
    expect(await attempt("cerca@eafit.edu.co", WRONG)).toEqual({
      ok: false,
      reason: "LOCKED",
      attemptsLeft: 0,
    });
    expect(await attempt("cerca@eafit.edu.co", CODE)).toMatchObject({ ok: false });

    // La quinta solicitud cabe en el límite de quince minutos, pero el tope ya no deja emitir.
    await requestOtp({ email: "cerca@eafit.edu.co", ip: null });
    expect(sent).toHaveLength(4);
    expect(await failedAttemptsFor("cerca@eafit.edu.co")).toBe(15);
  });

  it("cerca del tope el código correcto sigue abriendo la sesión", async () => {
    const personId = await seedMember("justo@eafit.edu.co");
    await failRounds("justo@eafit.edu.co", 3, 4);
    await requestOtp({ email: "justo@eafit.edu.co", ip: null });
    expect(await attempt("justo@eafit.edu.co", WRONG)).toMatchObject({ attemptsLeft: 2 });
    expect(await attempt("justo@eafit.edu.co", CODE)).toMatchObject({ ok: true, personId });
  });

  it("el tope corre con la ventana y responde igual para un correo del roster y para uno de afuera", async () => {
    await seedMember("adentro@eafit.edu.co");
    const recorridos: VerifyOtpResult[][] = [];
    for (const email of ["adentro@eafit.edu.co", "afuera@eafit.edu.co"]) {
      const start = Date.now();
      const respuestas = await failRounds(email, 3, 5);
      // Casi un día después el tope sigue: no hay reto nuevo y el último ya venció.
      const casi = new Date(start + 24 * HOUR - 5 * MINUTE);
      await requestOtp({ email, ip: null, now: casi });
      respuestas.push(await attempt(email, WRONG, casi));
      // Corrida la ventana, el correo vuelve a recibir códigos con sus cinco intentos.
      const despues = new Date(start + 24 * HOUR + 5 * MINUTE);
      await requestOtp({ email, ip: null, now: despues });
      respuestas.push(await attempt(email, WRONG, despues));
      recorridos.push(respuestas);
    }
    const [adentro, afuera] = recorridos;

    expect(adentro?.at(-2)).toEqual({ ok: false, reason: "EXPIRED", attemptsLeft: 0 });
    expect(adentro?.at(-1)).toEqual({ ok: false, reason: "INVALID", attemptsLeft: 4 });
    expect(afuera).toEqual(adentro);
    expect(sent.map((mail) => mail.to)).toEqual(Array(4).fill("adentro@eafit.edu.co"));
  });

  it("la depuración diaria no levanta el tope antes de que corra la ventana", async () => {
    await seedMember("depurada@eafit.edu.co");
    const start = Date.now();
    await failRounds("depurada@eafit.edu.co", 3, 5);
    const casi = new Date(start + 24 * HOUR - 5 * MINUTE);

    await pruneIdentity(casi);
    await requestOtp({ email: "depurada@eafit.edu.co", ip: null, now: casi });

    expect(sent).toHaveLength(3);
  });

  it("el tope no toca el paso de seguridad: sus códigos se siguen emitiendo y sus fallos no suman al ingreso", async () => {
    const stepUp = (email: string) => verifyStepUp({ email, code: WRONG, sessionId: randomUUID() });

    // Con el ingreso frenado, el paso de seguridad recibe su código.
    await seedMember("frenada@eafit.edu.co");
    await failRounds("frenada@eafit.edu.co", 3, 5);
    await requestOtp({ email: "frenada@eafit.edu.co", ip: null, purpose: "STEP_UP" });
    expect(sent).toHaveLength(4);
    expect(await stepUp("frenada@eafit.edu.co")).toEqual({
      ok: false,
      reason: "INVALID",
      attemptsLeft: 4,
    });

    // Quince fallos del paso de seguridad no lo frenan ni le quitan intentos al ingreso.
    await seedMember("segura@eafit.edu.co");
    for (let round = 0; round < 3; round += 1) {
      await requestOtp({ email: "segura@eafit.edu.co", ip: null, purpose: "STEP_UP" });
      for (let i = 0; i < 5; i += 1) {
        await stepUp("segura@eafit.edu.co");
      }
    }
    await requestOtp({ email: "segura@eafit.edu.co", ip: null, purpose: "STEP_UP" });
    expect(await stepUp("segura@eafit.edu.co")).toMatchObject({
      reason: "INVALID",
      attemptsLeft: 4,
    });
    await requestOtp({ email: "segura@eafit.edu.co", ip: null });
    expect(await attempt("segura@eafit.edu.co", WRONG)).toMatchObject({ attemptsLeft: 4 });
  });

  it("los fallos de un correo no le quitan códigos a otro", async () => {
    await seedMember("atacada@eafit.edu.co");
    await seedMember("tranquila@eafit.edu.co");
    await failRounds("atacada@eafit.edu.co", 3, 5);

    await requestOtp({ email: "tranquila@eafit.edu.co", ip: null });
    expect(await attempt("tranquila@eafit.edu.co", CODE)).toMatchObject({ ok: true });
  });

  it("una solicitud que entra a la vez que los códigos equivocados no deja pasar del tope, ni en el roster ni afuera", async () => {
    await seedMember("carrera@eafit.edu.co");
    for (const email of ["carrera@eafit.edu.co", "carrera-afuera@eafit.edu.co"]) {
      await failRounds(email, 2, 5);
      await requestOtp({ email, ip: null });
      // Con diez fallos, el código vivo guarda los cinco intentos que le quedan al correo: se gastan
      // mientras entra otra solicitud.
      await Promise.all([
        requestOtp({ email, ip: null }),
        ...Array.from({ length: 5 }, () => attempt(email, WRONG)),
      ]);

      const [last, ...previous] = await db()
        .select({ attempts: otpChallenge.attempts, maxAttempts: otpChallenge.maxAttempts })
        .from(otpChallenge)
        .where(eq(otpChallenge.email, email))
        .orderBy(desc(otpChallenge.createdAt));

      // Lo que haya quedado vivo se prueba hasta agotarlo: el correo no pasa de quince.
      for (let i = 0; i < 6; i += 1) {
        await attempt(email, WRONG);
      }
      expect(await failedAttemptsFor(email)).toBe(15);
      // Y el código más reciente salió con lo que le quedaba al correo al guardarse, no al contarse.
      const failedBefore = previous.reduce((total, challenge) => total + challenge.attempts, 0);
      expect(last?.maxAttempts).toBe(otpAttemptBudget(failedBefore));
    }
  });

  it("usar un código no revive los intentos de uno anterior: llegado el tope, ni el código correcto entra", async () => {
    const email = "revivida@eafit.edu.co";
    await seedMember(email);
    await failRounds(email, 2, 5);
    // Dos códigos pedidos con diez fallos traen cinco intentos cada uno, y verificar mira el último.
    await requestOtp({ email, ip: null });
    await requestOtp({ email, ip: null });
    for (let i = 0; i < 4; i += 1) {
      await attempt(email, WRONG);
    }
    expect(await attempt(email, CODE)).toMatchObject({ ok: true });

    // El código anterior vuelve a ser el vivo, con cinco intentos sin gastar; al correo le queda uno.
    const locked = { ok: false, reason: "LOCKED", attemptsLeft: 0 };
    expect(await attempt(email, WRONG)).toEqual(locked);
    expect(await attempt(email, WRONG)).toEqual(locked);
    expect(await attempt(email, CODE)).toEqual(locked);
    expect(await failedAttemptsFor(email)).toBe(15);
  });
});

// Lo que alguien teclea sin sesión no queda en los registros (ADR-114, regla 5): se miran las líneas
// tal como salen del proceso.
describe("registros del ingreso por código", () => {
  beforeEach(async () => {
    await truncateAll();
    captureMail();
  });

  const resumen = (email: string) => emailLogDigest(getEnv().SESSION_SECRET, email);

  it("pedir un código con un correo de afuera deja su resumen y nunca el correo", async () => {
    const { lines } = await captureLogs(() =>
      requestOtp({ email: " Afuera.Z9W4@Correo.Example", ip: "10.0.0.7" }),
    );

    expectNoEmail(lines, "afuera.z9w4@correo.example");
    expect(recordsOf(lines, "otp: correo fuera del roster")).toEqual([
      expect.objectContaining({ emailDigest: resumen("afuera.z9w4@correo.example") }),
    ]);
  });

  it("saltar el límite de solicitudes por correo deja el resumen y nunca el correo", async () => {
    const email = "insistente.k7q2@eafit.edu.co";
    await seedMember(email);
    for (let i = 0; i < OTP_MAX_PER_EMAIL; i += 1) {
      await requestOtp({ email, ip: null });
    }

    const { lines } = await captureLogs(() => requestOtp({ email, ip: null }));

    expectNoEmail(lines, email);
    expect(recordsOf(lines, "otp: límite por correo")).toEqual([
      expect.objectContaining({ emailDigest: resumen(email) }),
    ]);
    expect(await challengesFor(email)).toBe(OTP_MAX_PER_EMAIL);
  });

  it("llegar al tope de códigos equivocados deja el resumen y nunca el correo", async () => {
    const email = "topada.m3x8@correo.example";
    for (let round = 0; round < OTP_MAX_FAILED_PER_EMAIL / OTP_MAX_ATTEMPTS; round += 1) {
      await requestOtp({ email, ip: null });
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
        await attempt(email, WRONG);
      }
    }
    expect(await failedAttemptsFor(email)).toBe(OTP_MAX_FAILED_PER_EMAIL);

    const { lines } = await captureLogs(() => requestOtp({ email, ip: null }));

    expectNoEmail(lines, email);
    expect(recordsOf(lines, "otp: tope acumulado de códigos equivocados")).toEqual([
      expect.objectContaining({ emailDigest: resumen(email) }),
    ]);
  });

  // El aviso de un correo que no salió es de `comms`, y también lo dispara quien pide un código sin
  // sesión con el correo de un miembro: nombra a la persona por su id, no por su dirección.
  it.each<[string, MailTransports, string]>([
    [
      "el proveedor está caído",
      { primary: failing("resend", new Error("proveedor caído")), overflow: null },
      "resend",
    ],
    [
      "la cuota se agotó y el respaldo también falla",
      {
        primary: failing("resend", new QuotaExceededError("daily_quota_exceeded")),
        overflow: failing("ses", new Error("respaldo caído")),
      },
      "ses",
    ],
  ])("si el correo del código no sale porque %s, el registro nombra a la persona y nunca el correo", async (_caso, transports, provider) => {
    const email = "sinsalida.h5t1@eafit.edu.co";
    const personId = await seedMember(email);
    setMailTransportsForTests(transports);

    const { lines } = await captureLogs(() =>
      requestOtp({ email: " SinSalida.H5T1@Eafit.Edu.Co", ip: null }),
    );

    expectNoEmail(lines, email);
    const avisos = recordsOf(lines, "correo no enviado");
    expect(avisos).toEqual([expect.objectContaining({ personId, provider })]);
    expect(avisos[0]).not.toHaveProperty("to");
    expect(recordsOf(lines, "otp: correo del código")).toEqual([
      expect.objectContaining({ personId, status: "FAILED", provider }),
    ]);
  });

  it("el ingreso por código y el de contraseña resumen igual un mismo correo", async () => {
    const email = "afuera.z9w4@correo.example";

    const codigo = await captureLogs(() => requestOtp({ email, ip: null }));
    const clave = await captureLogs(() =>
      signInWithPassword({
        email: email.toUpperCase(),
        password: "una clave larga mala",
        ip: null,
        userAgent: null,
        remember: false,
      }),
    );

    const delCodigo = recordsOf(codigo.lines, "otp: correo fuera del roster")[0]?.emailDigest;
    expect(delCodigo).toBe(resumen(email));
    expect(recordsOf(clave.lines, "ingreso: credenciales incorrectas")[0]?.emailDigest).toBe(
      delCodigo,
    );
  });
});
