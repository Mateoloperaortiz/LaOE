import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { setMailTransportsForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { requestOtp, verifyOtp } from "@/modules/identity/domain/otp";
import { hashCode, OTP_MAX_PER_EMAIL, OTP_MAX_PER_IP } from "@/modules/identity/domain/pure";
import {
  destroySessionsFor,
  listSessionsFor,
  resolveActor,
} from "@/modules/identity/domain/session";
import { otpChallenge, permission, session } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import type { MailMessage } from "@/shared/adapters/mail";
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

  it("no crea reto ni envía correo si el correo no está en el roster", async () => {
    await requestOtp({ email: "nadie@eafit.edu.co", ip: "1.1.1.1" });
    expect(await challengesFor("nadie@eafit.edu.co")).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("permite OTP en licencia y mantiene fuera a las personas retiradas", async () => {
    await seedMember("licencia@eafit.edu.co", "ON_LEAVE");
    await seedMember("retirada@eafit.edu.co", "INACTIVE");
    await requestOtp({ email: "licencia@eafit.edu.co", ip: "1.1.1.1" });
    await requestOtp({ email: "retirada@eafit.edu.co", ip: "1.1.1.1" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("licencia@eafit.edu.co");
    expect(await challengesFor("retirada@eafit.edu.co")).toBe(0);
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
    expect(correo?.text ?? "").not.toContain("roster de la OE");
    expect(correo?.text ?? "").toContain("mensaje automático de seguridad");
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
