import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as unsubscribeInOneClick } from "@/app/api/baja/[token]/route";
import { POST as subscribeToPush } from "@/app/api/push/subscribe/route";
import { revokeCarnetAction } from "@/app/app/carnet/actions";
import NormativaDocumentPage from "@/app/app/normativa/[id]/page";
import { unsubscribeAction } from "@/app/baja/[token]/actions";
import { closeDb, getDb } from "@/db/client";
import { DEFAULT_PREFERENCES, getPreferences, updatePreferencesAs } from "@/modules/comms";
import { decideEntryAs } from "@/modules/crm";
import { getOrCreateCarnetToken } from "@/modules/identity";
import {
  groupJoinBlocker,
  listGroupIdsOf,
  listGroups,
  seedWorkCommitteesAs,
} from "@/modules/permanence";
import { auditLog } from "@/modules/system/schema";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedCall, seedCallEntry, seedMember, seedTerm } from "./factories";

// La IP del actor de un comando, puerta por puerta (ADR-121 regla 1): una action y una ruta la leen del
// request y la entregan con el actor; un trabajo del poller no tiene request, así que su auditoría
// conserva a quien originó el evento y va sin IP. Casi todo lo que acá se afirma es lo que ya quedaba
// escrito en `audit_log` antes de que el tipo `Actor` exigiera la IP: el cambio de tipo no movió ninguna
// fila. Lo que sí cambió después: la baja de campañas por el token del correo y la evidencia automática
// del onboarding que agenda una puerta, que tienen request y salían sin IP, ahora la reciben de sus
// puertas (ADR-123 reglas 2 y 3).

const session = vi.hoisted(() => ({ getActor: vi.fn() }));
const IP = "203.0.113.7";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Chrome/140 Android" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// `after` solo existe dentro de un request de Next: acá guarda lo que la puerta agenda, y lo corre a
// mano la prueba que lo mira.
const scheduled = vi.hoisted(() => ({ tasks: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    scheduled.tasks.push(task);
  },
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
  requireActor: session.getActor,
}));
// Del lector de normativa acá solo importa lo que agenda al abrir un documento: el documento lo pone
// la prueba, sin subir un PDF ni publicar nada.
vi.mock("@/modules/content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/content")>()),
  getPublishedDocumentWithArticles: async (id: string) => ({ document: { id }, articles: [] }),
}));
// La página devuelve el lector sin pintarlo, y pintarlo pide las fuentes de `next/font`.
vi.mock("@/modules/content/components/DocumentReader", () => ({ DocumentReader: () => null }));

/** A dónde redirige la action; si no redirige, lo que devolvió o el error con que falló. */
async function redirectOf(action: Promise<unknown>): Promise<unknown> {
  try {
    return await action;
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

function audits(action: string) {
  return getDb()
    .select({ actorId: auditLog.actorId, ip: auditLog.ip })
    .from(auditLog)
    .where(eq(auditLog.action, action));
}

/** Una persona con el token de baja del pie de sus correos: se lo da guardar sus preferencias. */
async function seedUnsubscribeToken(email: string): Promise<{ personId: string; token: string }> {
  const personId = await seedMember(email);
  await updatePreferencesAs({ personId, ip: null }, { ...DEFAULT_PREFERENCES });
  const token = (await getPreferences(personId)).unsubscribeToken;
  if (!token) throw new Error("la persona quedó sin token de baja");
  return { personId, token };
}

async function seedSession(email: string): Promise<string> {
  const personId = await seedMember(email);
  session.getActor.mockResolvedValue({
    personId,
    sessionId: "sesion-de-prueba",
    email,
    name: "Persona De Prueba",
    firstName: "Persona",
    membershipStatus: "ACTIVE",
    permissions: [],
    otpVerifiedAt: new Date(),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin: false,
  });
  return personId;
}

describe("la IP del actor de un comando llega a la auditoría según la puerta", () => {
  beforeEach(async () => {
    session.getActor.mockReset();
    scheduled.tasks.length = 0;
    await truncateAll();
  });
  afterAll(() => closeDb());

  it("una action audita con la IP del request: revocar el carnet propio", async () => {
    const personId = await seedSession("carnet.ip@eafit.edu.co");
    await getOrCreateCarnetToken(personId);
    const form = new FormData();
    form.set("confirm", "1");

    const revoked = revokeCarnetAction(form);

    expect(await redirectOf(revoked)).toBe("redirect:/app/carnet?guardado=carnet#billeteras");
    expect(await audits("carnet-token.rotated")).toEqual([{ actorId: personId, ip: IP }]);
  });

  it("una ruta audita con la IP del request: registrar un dispositivo para push", async () => {
    const personId = await seedSession("push.ip@eafit.edu.co");

    const response = await subscribeToPush(
      new Request("http://localhost/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/dispositivo-ip",
          keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await audits("push-subscription.created")).toEqual([{ actorId: personId, ip: IP }]);
  });

  it("la evidencia automática que agenda esa ruta audita a nombre de la persona y con la IP del request", async () => {
    const personId = await seedSession("push.evidencia@eafit.edu.co");

    const response = await subscribeToPush(
      new Request("http://localhost/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: "https://fcm.googleapis.com/fcm/send/dispositivo-evidencia",
          keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(scheduled.tasks).toHaveLength(1);
    await Promise.all(scheduled.tasks.map((task) => task()));

    // El mismo request deja dos filas, la del dispositivo y la del paso del onboarding, con la misma IP:
    // la ruta la lee antes de responder y se la entrega a lo que agenda (ADR-123 regla 3).
    expect(await audits("push-subscription.created")).toEqual([{ actorId: personId, ip: IP }]);
    expect(await audits("onboarding.step-done")).toEqual([{ actorId: personId, ip: IP }]);
  });

  it("la evidencia automática que agenda abrir un documento de la normativa audita con la IP del request", async () => {
    const personId = await seedSession("normativa.evidencia@eafit.edu.co");
    const id = "documento0de0prueba";

    await NormativaDocumentPage({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    });
    expect(scheduled.tasks).toHaveLength(1);
    await Promise.all(scheduled.tasks.map((task) => task()));

    expect(await audits("onboarding.step-done")).toEqual([{ actorId: personId, ip: IP }]);
  });

  it("la baja de campañas por el clic único del correo audita a nombre del dueño del token y con la IP del request", async () => {
    const { personId, token } = await seedUnsubscribeToken("baja.clic@eafit.edu.co");

    const response = await unsubscribeInOneClick(
      new Request(`http://localhost/api/baja/${token}`, { method: "POST" }),
      { params: Promise.resolve({ token }) },
    );

    expect(response.status).toBe(200);
    // Sin sesión: actúa el dueño del token, y la IP es la de quien pulsó la baja (ADR-123 regla 2).
    expect(await audits("notification-preference.unsubscribed")).toEqual([
      { actorId: personId, ip: IP },
    ]);
  });

  it("la baja de campañas confirmada en su página audita a nombre del dueño del token y con la IP del request", async () => {
    const { personId, token } = await seedUnsubscribeToken("baja.pagina@eafit.edu.co");
    const form = new FormData();
    form.set("token", token);

    const confirmed = unsubscribeAction(form);

    expect(await redirectOf(confirmed)).toBe(`redirect:/baja/${token}?estado=listo`);
    expect(await audits("notification-preference.unsubscribed")).toEqual([
      { actorId: personId, ip: IP },
    ]);
  });

  it("un trabajo audita a nombre de quien originó el evento y sin IP: la inscripción aceptada entra al grupo", async () => {
    const system = { personId: null, ip: null };
    const termId = await seedTerm();
    await seedWorkCommitteesAs(system, termId);
    const { rows } = await listGroups({
      q: "",
      termId,
      kind: "WORK_COMMITTEE",
      page: 1,
      pageSize: 20,
    });
    const groupId = rows[0]?.id;
    if (!groupId) throw new Error("faltan comités de trabajo");
    const adminId = await seedMember("acepta.ip@eafit.edu.co");
    const personId = await seedMember("entra.ip@eafit.edu.co");
    const callId = await seedCall(termId, groupId, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");

    // Aceptar es el comando del request: lleva la IP de quien aceptó.
    await decideEntryAs({ personId: adminId, ip: IP }, callId, entryId, "ACCEPTED", undefined, {
      joinBlocker: groupJoinBlocker,
    });
    await drainOutbox();

    expect(await listGroupIdsOf(personId)).toContain(groupId);
    const byAdmin = await getDb()
      .select({ action: auditLog.action, ip: auditLog.ip })
      .from(auditLog)
      .where(eq(auditLog.actorId, adminId));
    const added = byAdmin.filter((row) => row.action === "work-group.member-added");
    expect(added).toEqual([{ action: "work-group.member-added", ip: null }]);
    const inRequest = byAdmin.filter((row) => row.action !== "work-group.member-added");
    expect(inRequest.length).toBeGreaterThan(0);
    expect(new Set(inRequest.map((row) => row.ip))).toEqual(new Set([IP]));
  });
});
