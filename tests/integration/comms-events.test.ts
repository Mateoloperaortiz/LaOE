import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  listMessagesFor,
  saveSubscriptionAs,
  setMailTransportsForTests,
  setPushSenderForTests,
  splitPush,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  createAnnouncement,
  getAnnouncement,
  publishAndPushAnnouncement,
  requestAnnouncementPush,
} from "@/modules/content";
import {
  createRequestAs,
  decideRequestAs,
  grantRecognitionAs,
  setCallStatusAs,
  withdrawRequestAs,
} from "@/modules/crm";
import { callsResource } from "@/modules/crm/admin";
import { createCall } from "@/modules/crm/domain/calls";
import { checkInSelfAs } from "@/modules/participation";
import { recordConsentAs } from "@/modules/people";
import { membership } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
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
  await saveSubscriptionAs({ personId, ip: null }, { endpoint, keys: keys() }, null);
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
    await subscribe(dentro, "https://fcm.googleapis.com/fcm/send/dentro");
    await subscribe(fuera, "https://fcm.googleapis.com/fcm/send/fuera");

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

    await drainOutbox();
    expect(delivered).toEqual(["https://fcm.googleapis.com/fcm/send/dentro"]);
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
    await drainOutbox();
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
      await subscribe(person, `https://fcm.googleapis.com/fcm/send/${endpoint}`);
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
    await drainOutbox();
    expect(delivered.sort()).toEqual([
      "https://fcm.googleapis.com/fcm/send/activo",
      "https://fcm.googleapis.com/fcm/send/honorario",
    ]);
    void termId;
  });

  it("los puntos acreditados mandan T-181 con el saldo, y una ocasión sin puntos no manda nada", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.puntos@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/ana");
    const conPuntos = await seedOccasion(termId, { title: "Integración", points: 10 });
    const sinPuntos = await seedOccasion(termId, { title: "Reunión", points: 0 });
    expect(
      (await checkInSelfAs({ personId: ana, ip: null }, { publicId: conPuntos.publicId })).ok,
    ).toBe(true);
    expect(
      (await checkInSelfAs({ personId: ana, ip: null }, { publicId: sinPuntos.publicId })).ok,
    ).toBe(true);
    await drainOutbox();
    const rows = (await messagesOf(ana)).filter((row) => row.kind === "POINTS");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subject).toBe(t("T-181", { n: 10 }).split(" · ")[0]);
    expect(rows[0]?.dedupeKey).toBe(`points:${conPuntos.id}:${ana}`);
  });

  it("abrir una convocatoria desde el formulario de edición manda el mismo aviso que el botón, una sola vez", async () => {
    // ADR-037, enmienda a la regla 10, y ADR-118 regla 15: crear abierta, abrir con el botón o abrir
    // cambiando el Estado en el formulario emiten `call.opened`.
    const termId = await seedTerm();
    const gh = await seedMember("gh.convocatorias@eafit.edu.co");
    const miembro = await seedMember("a3@eafit.edu.co");
    await subscribe(miembro, "https://fcm.googleapis.com/fcm/send/a3");
    const groupId = await seedWorkGroup(termId, "e2e-gt");
    const actor = { personId: gh, ip: null };
    const draft = {
      termId,
      groupId,
      title: "GT de pruebas",
      description: "",
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      capacity: 3,
      selection: "FIRST_COME" as const,
      status: "DRAFT" as const,
    };
    const callId = (await callsResource.create?.(actor, draft))?.id ?? "";
    const openedEvents = () =>
      db()
        .select({ dedupeKey: outbox.dedupeKey })
        .from(outbox)
        .where(eq(outbox.eventType, "call.opened"));
    const pushes = async () =>
      (await messagesOf(miembro)).filter((row) => row.dedupeKey === `call:${callId}`);
    expect(await openedEvents()).toEqual([]);

    // GH la abre cambiando el Estado en el formulario de edición.
    await callsResource.update?.(actor, callId, { ...draft, status: "OPEN" });
    expect(await openedEvents()).toEqual([{ dedupeKey: `call-opened:${callId}` }]);
    await drainOutbox();
    expect(await pushes()).toHaveLength(1);
    expect((await pushes())[0]?.subject).toBe(
      t("T-190", { convocatoria: "GT de pruebas" }).split(" · ")[0],
    );

    // Guardar otra vez con la convocatoria ya abierta no vuelve a avisar.
    await callsResource.update?.(actor, callId, {
      ...draft,
      title: "GT de pruebas, segunda fecha",
      status: "OPEN",
    });
    await drainOutbox();
    expect(await openedEvents()).toHaveLength(1);
    expect(await pushes()).toHaveLength(1);
  });

  it("abrir una convocatoria manda T-190 a los activos y nombrar un destacado manda T-192 al comité", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-a3", "A3");
    const miembro = await seedMember("a3@eafit.edu.co");
    const otro = await seedMember("otro@eafit.edu.co");
    await seedCommitteeMembership(miembro, committeeId, termId);
    await subscribe(miembro, "https://fcm.googleapis.com/fcm/send/a3");
    await subscribe(otro, "https://fcm.googleapis.com/fcm/send/otro");
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
    await drainOutbox();
    const call = await db()
      .select()
      .from(message)
      .where(eq(message.dedupeKey, `call:${callId}`));
    expect(call).toHaveLength(2);
    expect(call[0]?.subject).toBe(t("T-190", { convocatoria: "GT de pruebas" }).split(" · ")[0]);

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
    await drainOutbox();
    const recog = await db()
      .select()
      .from(message)
      .where(eq(message.dedupeKey, `recognition:${result.id}`));
    expect(recog).toHaveLength(1);
    expect(recog[0]?.personId).toBe(miembro);
    expect(recog[0]?.subject).toBe(tList("T-192")[0]);
  });

  // La respuesta a una solicitud (T-189, ADR-038 regla 7) tal como le llega al dispositivo: el título y
  // el cuerpo completos, con la decisión escrita donde iba su marcador (DT-122).
  describe("la respuesta a una solicitud", () => {
    const DEVICE = "https://fcm.googleapis.com/fcm/send/solicitud";
    // Regreso previsto dentro de la ventana de una licencia (ADR-060 regla 10): en dos meses.
    const until = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const tipoLicencia = tList("T-894")[0];
    const pushed: Array<{ endpoint: string; title: string; body: string }> = [];

    beforeEach(() => {
      pushed.length = 0;
      setPushSenderForTests(async (subscription, payload) => {
        pushed.push({ endpoint: subscription.endpoint, title: payload.title, body: payload.body });
        return { ok: true, statusCode: 201 };
      });
      // El correo T-205 que acompaña al push no es de estas pruebas: sale por un transporte mudo.
      setMailTransportsForTests({
        primary: { name: "console", send: async () => ({ id: null }) },
        overflow: null,
      });
    });
    afterAll(() => {
      setMailTransportsForTests(undefined);
    });

    async function memberWithLeaveRequest() {
      const termId = await seedTerm();
      const committeeId = await seedCommittee("a3", "A3");
      const personId = await seedMember("licencia@eafit.edu.co", { firstName: "Nora" });
      await seedCommitteeMembership(personId, committeeId, termId);
      await subscribe(personId, DEVICE);
      const actor = { personId, ip: null };
      const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });
      return { personId, actor, requestId: created.id };
    }

    /** Un cambio de comité: el tipo de solicitud con el nombre más largo de T-894. */
    async function memberWithTransferRequest() {
      const termId = await seedTerm();
      const leaves = await seedCommittee("a3", "A3");
      const stays = await seedCommittee("pixel", "PIXEL");
      const joins = await seedCommittee("cigma", "CIGMA");
      const personId = await seedMember("cambio@eafit.edu.co", { firstName: "Nora" });
      await seedCommitteeMembership(personId, leaves, termId);
      await seedCommitteeMembership(personId, stays, termId, "GENERAL");
      await subscribe(personId, DEVICE);
      const created = await createRequestAs({ personId, ip: null }, "TRANSFER", {
        reason: "Quiero cambiar de aire",
        leaveCommitteeIds: [leaves],
        joinCommitteeIds: [joins],
      });
      return { personId, requestId: created.id };
    }

    async function pushesOf(personId: string) {
      return (await listMessagesFor(personId)).filter((row) => row.channel === "PUSH");
    }

    /**
     * El dispositivo recibió un solo aviso: T-189 sin recortar, con la decisión entera en el título y el
     * tipo de solicitud a la vista.
     */
    async function expectAnswer(personId: string, decisión: string, tipo = tipoLicencia) {
      expect(pushed).toHaveLength(1);
      const received = `${pushed[0]?.title} · ${pushed[0]?.body}`;
      expect(received).not.toMatch(/[{}]/);
      expect(pushed[0]?.title).toContain(decisión);
      expect(received).toContain(tipo);
      const expected = splitPush(t("T-189", { tipo, decisión }));
      expect(pushed).toEqual([{ endpoint: DEVICE, ...expected }]);
      const records = await pushesOf(personId);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        status: "SENT",
        kind: "TRANSACTIONAL",
        subject: expected.title,
      });
    }

    it("una licencia aprobada avisa con T-189 entero: el título dice la decisión y no queda ningún marcador a la vista", async () => {
      const { personId, requestId } = await memberWithLeaveRequest();
      const gh = await seedMember("gh@eafit.edu.co");
      await decideRequestAs({ personId: gh, ip: null }, requestId, { decision: "APPROVED" });
      await drainOutbox();

      await expectAnswer(personId, tList("T-195")[0]);
    });

    it("una licencia rechazada avisa con T-189 entero: el título dice que fue rechazada", async () => {
      const { personId, requestId } = await memberWithLeaveRequest();
      const gh = await seedMember("gh@eafit.edu.co");
      await decideRequestAs({ personId: gh, ip: null }, requestId, {
        decision: "REJECTED",
        reason: "Todavía no",
      });
      await drainOutbox();

      await expectAnswer(personId, tList("T-195")[1]);
    });

    // El título tiene 40 caracteres (`buildPushPayload`): con el tipo adentro, el de un cambio de comité
    // llegaba como «Tu solicitud de cambio de comité fue ap…» y «… fue re…», sin la decisión (DT-122).
    it("un cambio de comité aprobado avisa con la decisión entera en el título, sin recortar", async () => {
      const { personId, requestId } = await memberWithTransferRequest();
      const gh = await seedMember("gh@eafit.edu.co");
      await decideRequestAs({ personId: gh, ip: null }, requestId, { decision: "APPROVED" });
      await drainOutbox();

      await expectAnswer(personId, tList("T-195")[0], tList("T-894")[2]);
    });

    it("un cambio de comité rechazado avisa con la decisión entera en el título, sin recortar", async () => {
      const { personId, requestId } = await memberWithTransferRequest();
      const gh = await seedMember("gh@eafit.edu.co");
      await decideRequestAs({ personId: gh, ip: null }, requestId, {
        decision: "REJECTED",
        reason: "Todavía no",
      });
      await drainOutbox();

      await expectAnswer(personId, tList("T-195")[1], tList("T-894")[2]);
    });

    it("una solicitud que la persona cancela no le manda aviso ni correo: nadie la respondió", async () => {
      const { personId, actor, requestId } = await memberWithLeaveRequest();
      await withdrawRequestAs(actor, requestId);
      await drainOutbox();

      expect(pushed).toEqual([]);
      expect(await listMessagesFor(personId)).toEqual([]);
    });
  });
});
