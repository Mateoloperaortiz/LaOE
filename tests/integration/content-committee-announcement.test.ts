import { asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  listMessagesFor,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import {
  committeeAnnouncementSchema,
  createCommitteeAnnouncementAs,
  getAnnouncement,
} from "@/modules/content";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { committeeMembership } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Caracterización de `createCommitteeAnnouncementAs` (DT-147): el anuncio que la dirección de un comité
// publica en su cartelera interna, con y sin aviso push, hasta que el outbox queda en reposo. El envío
// real se reemplaza por una lista de las direcciones a las que salió.

const db = () => getDb();
const system = { personId: null, ip: null };
const actor = (personId: string) => ({ personId, ip: null });
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

async function withDevice(personId: string, name: string): Promise<void> {
  await saveSubscriptionAs(
    actor(personId),
    { endpoint: endpoint(name), keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    null,
  );
}

async function auditsOf(entityId: string) {
  const rows = await db()
    .select({
      action: auditLog.action,
      entityType: auditLog.entityType,
      actorId: auditLog.actorId,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .where(eq(auditLog.entityId, entityId))
    .orderBy(asc(auditLog.action));
  return rows;
}

/** Lo que el poller todavía no tomó: los eventos que dejó el último comando. */
function pendingEvents() {
  return db()
    .select({ eventType: outbox.eventType, payload: outbox.payload, dedupeKey: outbox.dedupeKey })
    .from(outbox)
    .where(isNull(outbox.processedAt));
}

async function pushesOf(personId: string) {
  const rows = await listMessagesFor(personId);
  return rows.map((row) => ({
    channel: row.channel,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
  }));
}

/**
 * Un comité con cada caso de su audiencia: quien publica, un miembro activo, una honoraria, uno sin
 * dispositivo, una que apagó los avisos de anuncios, un ex miembro, una en licencia, una anonimizada y
 * uno de otro comité. Todos tienen dispositivo salvo quien se llama así.
 */
async function fixture() {
  const termId = await seedTerm();
  const pixel = await seedCommittee("c9-pixel", "Pixel");
  const ius = await seedCommittee("c9-ius", "IUS");
  const member = async (name: string, committeeId: string) => {
    const personId = await seedMember(`${name}@eafit.edu.co`);
    const membershipId = await seedCommitteeMembership(personId, committeeId, termId);
    return { personId, membershipId };
  };
  const autora = (await member("autora", pixel)).personId;
  const dentro = await member("dentro", pixel);
  const honoraria = await seedPerson("honoraria@eafit.edu.co");
  await seedMembership(honoraria, termId, "HONORARY");
  await seedCommitteeMembership(honoraria, pixel, termId);
  const sinDispositivo = (await member("sin.dispositivo", pixel)).personId;
  const silenciada = (await member("silenciada", pixel)).personId;
  const ex = await member("ex", pixel);
  const enLicencia = await seedPerson("licencia@eafit.edu.co");
  await seedMembership(enLicencia, termId, "ON_LEAVE");
  await seedCommitteeMembership(enLicencia, pixel, termId);
  const anonimizada = (await member("anonimizada", pixel)).personId;
  const deOtro = (await member("de.otro", ius)).personId;

  for (const [personId, name] of [
    [autora, "autora"],
    [dentro.personId, "dentro"],
    [honoraria, "honoraria"],
    [silenciada, "silenciada"],
    [ex.personId, "ex"],
    [enLicencia, "licencia"],
    [anonimizada, "anonimizada"],
    [deOtro, "de-otro"],
  ] as const) {
    await withDevice(personId, name);
  }
  await updatePreferencesAs(actor(silenciada), {
    emailCampaigns: true,
    pushAnnouncements: false,
    pushPoints: true,
    pushReminders: true,
    pushWordle: true,
    pushGamerStreak: false,
  });
  await db()
    .update(committeeMembership)
    .set({ leftAt: new Date() })
    .where(eq(committeeMembership.id, ex.membershipId));
  await requestDeletionAs(actor(anonimizada));
  await anonymizePersonAs(system, anonimizada);
  // Lo que dejó el armado (la limpieza de la anonimizada) se procesa antes de publicar.
  await drainOutbox();
  return {
    termId,
    pixel,
    ius,
    autora,
    dentro: dentro.personId,
    dentroMembershipId: dentro.membershipId,
    honoraria,
    sinDispositivo,
    silenciada,
    ex: ex.personId,
    enLicencia,
    anonimizada,
    deOtro,
  };
}

describe("el anuncio de un comité (createCommitteeAnnouncementAs)", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    await truncateAll();
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
    delivered.length = 0;
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("sin push queda publicado en la cartelera interna del comité, con su auditoría, y no avisa a nadie", async () => {
    const f = await fixture();
    delivered.length = 0;

    const { id } = await createCommitteeAnnouncementAs(
      actor(f.autora),
      f.pixel,
      committeeAnnouncementSchema.parse({
        title: "  Reunión del jueves  ",
        body: "Nos vemos a las 6.\n\nLlevá computador.",
      }),
    );

    const row = await getAnnouncement(id);
    expect(row).toMatchObject({
      title: "Reunión del jueves",
      body: "Nos vemos a las 6.\n\nLlevá computador.",
      audience: "MEMBERS",
      pinned: false,
      committeeId: f.pixel,
      createdById: f.autora,
      pushRequestedAt: null,
      pushSentAt: null,
    });
    expect(row?.publishedAt).toBeInstanceOf(Date);
    expect(await auditsOf(id)).toEqual([
      {
        action: "announcement.created",
        entityType: "announcement",
        actorId: f.autora,
        before: null,
        after: {
          title: "Reunión del jueves",
          body: "Nos vemos a las 6.\n\nLlevá computador.",
          audience: "MEMBERS",
          pinned: false,
          committeeId: f.pixel,
        },
      },
      {
        action: "announcement.published",
        entityType: "announcement",
        actorId: f.autora,
        before: { publishedAt: null },
        after: { publishedAt: row?.publishedAt?.toISOString() },
      },
    ]);
    expect(await pendingEvents()).toEqual([]);

    await drainOutbox();
    expect(delivered).toEqual([]);
    expect(await pushesOf(f.dentro)).toEqual([]);
    expect((await getAnnouncement(id))?.pushSentAt).toBeNull();
  });

  it("con push deja un solo evento con lo que el aviso muestra y, al drenar, les llega a los miembros vigentes del comité y a nadie más", async () => {
    const f = await fixture();
    delivered.length = 0;

    const { id } = await createCommitteeAnnouncementAs(actor(f.autora), f.pixel, {
      title: "Destacado de Pixel",
      body: "Primera línea del anuncio.\n\nSegunda.",
      push: true,
    });

    const published = await getAnnouncement(id);
    expect(published).toMatchObject({
      audience: "MEMBERS",
      committeeId: f.pixel,
      createdById: f.autora,
      pushSentAt: null,
    });
    expect(published?.publishedAt).toBeInstanceOf(Date);
    // Publicar y pedir el aviso comparten instante: es una sola transacción con un solo reloj.
    expect(published?.pushRequestedAt).toEqual(published?.publishedAt);
    expect((await auditsOf(id)).map((row) => [row.action, row.actorId, row.after])).toEqual([
      [
        "announcement.created",
        f.autora,
        {
          title: "Destacado de Pixel",
          body: "Primera línea del anuncio.\n\nSegunda.",
          audience: "MEMBERS",
          pinned: false,
          committeeId: f.pixel,
        },
      ],
      ["announcement.published", f.autora, { publishedAt: published?.publishedAt?.toISOString() }],
      [
        "announcement.push-requested",
        f.autora,
        { pushRequestedAt: published?.publishedAt?.toISOString() },
      ],
    ]);
    expect(await pendingEvents()).toEqual([
      {
        eventType: "announcement.push-requested",
        dedupeKey: `announcement-push:${id}`,
        payload: {
          announcementId: id,
          title: "Destacado de Pixel",
          excerpt: "Primera línea del anuncio. Segunda.",
          audience: "MEMBERS",
          committeeId: f.pixel,
          url: `/app/cartelera/${id}`,
          actorId: f.autora,
        },
      },
    ]);

    await drainOutbox();

    // Activos y honorarios del comité con dispositivo, también quien lo publicó.
    expect([...delivered].sort()).toEqual(
      [endpoint("autora"), endpoint("dentro"), endpoint("honoraria")].sort(),
    );
    const push = {
      channel: "PUSH",
      kind: "ANNOUNCEMENT",
      subject: "Destacado de Pixel",
      status: "SENT",
    };
    expect(await pushesOf(f.autora)).toEqual([push]);
    expect(await pushesOf(f.dentro)).toEqual([push]);
    expect(await pushesOf(f.honoraria)).toEqual([push]);
    // Ni aviso ni registro: sin dispositivo, con los anuncios apagados, ex miembro, en licencia,
    // anonimizada y de otro comité.
    for (const personId of [
      f.sinDispositivo,
      f.silenciada,
      f.ex,
      f.enLicencia,
      f.anonimizada,
      f.deOtro,
    ]) {
      expect(await pushesOf(personId)).toEqual([]);
    }
    const sent = await getAnnouncement(id);
    expect(sent?.pushSentAt).toBeInstanceOf(Date);
    expect(sent?.pushCount).toBe(3);
    expect(await pendingEvents()).toEqual([]);

    // Un segundo drenado no repite el aviso.
    await drainOutbox();
    expect(delivered).toHaveLength(3);
  });

  it("la audiencia se resuelve al entregar: quien sale del comité antes del envío no recibe, y quien entra sí", async () => {
    const f = await fixture();
    delivered.length = 0;

    const { id } = await createCommitteeAnnouncementAs(actor(f.autora), f.pixel, {
      title: "Cambio de salón",
      body: "",
      push: true,
    });
    await db()
      .update(committeeMembership)
      .set({ leftAt: new Date() })
      .where(eq(committeeMembership.id, f.dentroMembershipId));
    await seedCommitteeMembership(f.deOtro, f.pixel, f.termId);

    await drainOutbox();

    expect([...delivered].sort()).toEqual(
      [endpoint("autora"), endpoint("de-otro"), endpoint("honoraria")].sort(),
    );
    expect(await pushesOf(f.dentro)).toEqual([]);
    expect((await getAnnouncement(id))?.pushCount).toBe(3);
  });

  it("el comando no comprueba quién llama: la capacidad de cartelera la exige la acción (ADR-082 regla 5) y el anuncio queda a nombre de quien llegó", async () => {
    const f = await fixture();

    const { id } = await createCommitteeAnnouncementAs(actor(f.deOtro), f.pixel, {
      title: "Anuncio de alguien de otro comité",
      body: "",
      push: false,
    });

    expect(await getAnnouncement(id)).toMatchObject({
      committeeId: f.pixel,
      createdById: f.deOtro,
    });
    expect((await auditsOf(id)).map((row) => row.actorId)).toEqual([f.deOtro, f.deOtro]);
  });

  it("un comité que no existe no deja anuncio, auditoría ni evento, tampoco pidiendo el push", async () => {
    await fixture();
    const before = await db().select({ id: auditLog.id }).from(auditLog);

    await expect(
      createCommitteeAnnouncementAs(system, "comite-que-no-existe", {
        title: "Anuncio sin comité",
        body: "",
        push: true,
      }),
    ).rejects.toThrow();

    expect(await db().select({ id: auditLog.id }).from(auditLog)).toHaveLength(before.length);
    expect(await pendingEvents()).toEqual([]);
  });
});
