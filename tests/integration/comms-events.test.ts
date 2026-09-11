import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import { saveSubscriptionAs, setPushSenderForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  createAnnouncement,
  getAnnouncement,
  publishAndPushAnnouncement,
  requestAnnouncementPush,
} from "@/modules/content";
import { grantRecognitionAs, setCallStatusAs } from "@/modules/crm";
import { createCall } from "@/modules/crm/domain/calls";
import { checkInSelfAs } from "@/modules/participation";
import { recordConsentAs } from "@/modules/people";
import { membership } from "@/modules/people/schema";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
  seedWorkGroup,
} from "./factories";

// Push por evento (ADR-038 reglas 6 y 7): anuncio con audiencia por comité, puntos solo con puntos,
// convocatoria abierta y reconocimiento publicado. El envío real se reemplaza por un contador.

const db = () => getDb();
const keys = () => ({ p256dh: "p".repeat(32), auth: "a".repeat(16) });

async function subscribe(personId: string, endpoint: string) {
  await saveSubscriptionAs({ personId }, { endpoint, keys: keys() }, null);
}

async function messagesOf(personId: string) {
  return db().select().from(message).where(eq(message.personId, personId));
}

describe("push por evento", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    await truncateAll();
    delivered.length = 0;
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("un anuncio de comité llega solo a sus miembros del término y estampa el envío", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-pixel", "Pixel");
    const dentro = await seedMember("dentro@eafit.edu.co");
    const fuera = await seedMember("fuera@eafit.edu.co");
    await seedCommitteeMembership(dentro, committeeId, termId);
    await subscribe(dentro, "https://push.example/dentro");
    await subscribe(fuera, "https://push.example/fuera");

    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createAnnouncement(ctx, {
        title: "Destacado de Pixel",
        body: "Primera línea del anuncio.\n\nSegunda.",
        audience: "MEMBERS",
        pinned: false,
        committeeId,
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAndPushAnnouncement(ctx, id));
    let row = await getAnnouncement(id);
    expect(row?.publishedAt).toBeInstanceOf(Date);
    expect(row?.pushRequestedAt).toBeInstanceOf(Date);
    expect(row?.pushSentAt).toBeNull();

    const result = await drain(20);
    expect(result.failed).toBe(0);
    expect(delivered).toEqual(["https://push.example/dentro"]);
    row = await getAnnouncement(id);
    expect(row?.pushSentAt).toBeInstanceOf(Date);
    expect(row?.pushCount).toBe(1);
    const [sent] = await messagesOf(dentro);
    expect(sent).toMatchObject({
      channel: "PUSH",
      kind: "ANNOUNCEMENT",
      subject: "Destacado de Pixel",
      dedupeKey: `announcement:${id}`,
    });
    expect(await messagesOf(fuera)).toHaveLength(0);

    // Pedirlo otra vez no hace nada: una sola vez por anuncio.
    await runCommand(SYSTEM_ACTOR, (ctx) => requestAnnouncementPush(ctx, id));
    await drain(20);
    expect(delivered).toHaveLength(1);
  });

  it("un anuncio general llega a activos y honorarios, no a quien está en licencia", async () => {
    const termId = await seedTerm();
    const activo = await seedMember("activo@eafit.edu.co");
    const honorario = await seedMember("honorario@eafit.edu.co");
    const licencia = await seedMember("licencia@eafit.edu.co");
    await db()
      .update(membership)
      .set({ status: "HONORARY" })
      .where(eq(membership.personId, honorario));
    await db()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, licencia));
    for (const [person, endpoint] of [
      [activo, "activo"],
      [honorario, "honorario"],
      [licencia, "licencia"],
    ] as const) {
      await subscribe(person, `https://push.example/${endpoint}`);
    }
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createAnnouncement(ctx, {
        title: "General",
        body: "Cuerpo",
        audience: "PUBLIC",
        pinned: false,
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAndPushAnnouncement(ctx, id));
    await drain(20);
    expect(delivered.sort()).toEqual([
      "https://push.example/activo",
      "https://push.example/honorario",
    ]);
    void termId;
  });

  it("los puntos acreditados mandan T-181 con el saldo, y una ocasión sin puntos no manda nada", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.puntos@eafit.edu.co");
    await subscribe(ana, "https://push.example/ana");
    const conPuntos = await seedOccasion(termId, { title: "Integración", points: 10 });
    const sinPuntos = await seedOccasion(termId, { title: "Reunión", points: 0 });
    expect((await checkInSelfAs({ personId: ana }, { publicId: conPuntos.publicId })).ok).toBe(
      true,
    );
    expect((await checkInSelfAs({ personId: ana }, { publicId: sinPuntos.publicId })).ok).toBe(
      true,
    );
    const result = await drain(50);
    expect(result.failed).toBe(0);
    const rows = (await messagesOf(ana)).filter((row) => row.kind === "POINTS");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe("¡Sumaste 10 GH Points!");
    expect(rows[0]?.dedupeKey).toBe(`points:${conPuntos.id}:${ana}`);
  });

  it("abrir una convocatoria manda T-190 a los activos y nombrar un destacado manda T-192 al comité", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-a3", "A3");
    const miembro = await seedMember("a3@eafit.edu.co");
    const otro = await seedMember("otro@eafit.edu.co");
    await seedCommitteeMembership(miembro, committeeId, termId);
    await subscribe(miembro, "https://push.example/a3");
    await subscribe(otro, "https://push.example/otro");
    const groupId = await seedWorkGroup(termId, "e2e-gt");
    const closesAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const { id: callId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCall(ctx, {
        termId,
        groupId,
        title: "GT de pruebas",
        description: "",
        opensAt: new Date(Date.now() - 60_000),
        closesAt,
        capacity: 3,
        selection: "FIRST_COME",
        status: "DRAFT",
      }),
    );
    await setCallStatusAs(SYSTEM_ACTOR, callId, "OPEN");
    await drain(50);
    const call = await db()
      .select()
      .from(message)
      .where(eq(message.dedupeKey, `call:${callId}`));
    expect(call).toHaveLength(2);
    expect(call[0]?.subject).toBe("Se abrió GT de pruebas");

    await recordConsentAs(SYSTEM_ACTOR, miembro, "DIRECTORY_PHOTO", "SELF");
    const result = await grantRecognitionAs(SYSTEM_ACTOR, {
      personId: miembro,
      kind: "MEMBER_OF_MONTH",
      committeeId,
      termId,
      month: 9,
      title: "",
    });
    expect(result.published).toBe(true);
    await drain(50);
    const recog = await db()
      .select()
      .from(message)
      .where(eq(message.dedupeKey, `recognition:${result.id}`));
    expect(recog).toHaveLength(1);
    expect(recog[0]?.personId).toBe(miembro);
    expect(recog[0]?.subject).toBe("¡Destacado del mes!");
  });
});
