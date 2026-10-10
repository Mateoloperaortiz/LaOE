import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as subscribeToPush } from "@/app/api/push/subscribe/route";
import { revokeCarnetAction } from "@/app/app/carnet/actions";
import { closeDb, getDb } from "@/db/client";
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
// conserva a quien originó el evento y va sin IP. Lo que acá se afirma es lo que ya quedaba escrito en
// `audit_log` antes de que el tipo `Actor` exigiera la IP: el cambio de tipo no mueve ninguna fila.

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
// `after` solo existe dentro de un request de Next; lo que agenda no es de esta prueba.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

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
