import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import {
  NOTIFICATION_MAX_RECIPIENTS,
  notificationRequested,
  notificationRequestedSchema,
} from "@/domain-events/comms";
import { occasionClosed } from "@/domain-events/participation";
import { saveSubscriptionAs, setPushSenderForTests } from "@/modules/comms";
import {
  closeOccasionAs,
  createSurveyInvites,
  getSurveyInviteForActor,
} from "@/modules/participation";
import { checkIn, occasion, occasionSurveyInvite } from "@/modules/participation/schema";
import { outbox } from "@/modules/system/schema";
import {
  seedCheckIn,
  seedForm,
  seedMember,
  seedOccasion,
  seedPeople,
  seedTerm,
} from "../factories";
import { holdTransaction, waitingOn } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

// Las invitaciones a la encuesta toleran el reintento (DT-214, ADR-118 regla 4). El enlace de cada
// persona solo existe en memoria mientras corre el handler del cierre: en la base queda su huella. Si
// la invitación se confirmaba y su aviso no llegaba a encolarse, el reintento la encontraba hecha y la
// saltaba: la persona se quedaba sin encuesta, sin error y con el evento «procesado».

const MINUTE = 60_000;
const db = () => getDb();
/** El instante en que el poller ya reintenta un primer fallo: un minuto después (ADR-012). */
const afterBackoff = () => new Date(Date.now() + 2 * MINUTE);
const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
const tokenOf = (url: string) => url.replace("/app/encuesta/", "");
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * La base rechaza el aviso de encuesta que se intente encolar: es la sentencia que falla entre crear
 * las invitaciones y encolar su aviso. Con «partial-batch» solo rechaza la tanda que no va llena, que
 * es la última cuando los aprobados no caben en un solo pedido.
 */
async function rejectSurveyNotices(scope: "all" | "partial-batch"): Promise<void> {
  await db().execute(sql`
    create or replace function test_reject_survey_notice() returns trigger language plpgsql as
    $$ begin raise exception 'aviso de encuesta rechazado por la prueba'; end $$
  `);
  const partial =
    scope === "partial-batch"
      ? sql.raw(
          `and jsonb_array_length(new.payload -> 'recipients') < ${NOTIFICATION_MAX_RECIPIENTS}`,
        )
      : sql.raw("");
  await db().execute(sql`
    create trigger test_reject_survey_notice before insert on outbox for each row
    when (new.event_type = 'notification.requested' and new.payload ->> 'kind' = 'SURVEY' ${partial})
    execute function test_reject_survey_notice()
  `);
}

async function acceptSurveyNotices(): Promise<void> {
  await db().execute(sql`drop trigger if exists test_reject_survey_notice on outbox`);
  await db().execute(sql`drop function if exists test_reject_survey_notice()`);
}

/** Cada destinatario de los avisos de encuesta que quedaron en el outbox, entregados o no. */
async function surveyNotices(occasionId: string): Promise<{ personId: string; url: string }[]> {
  const rows = await db()
    .select({ payload: outbox.payload })
    .from(outbox)
    .where(eq(outbox.eventType, notificationRequested.type));
  return rows
    .map((row) => notificationRequestedSchema.parse(row.payload))
    .filter((notice) => notice.kind === "SURVEY" && notice.tag === `survey-${occasionId}`)
    .flatMap((notice) => notice.recipients)
    .map((recipient) => ({ personId: recipient.personId, url: recipient.url ?? "" }));
}

async function closedOccasionWithSurvey(termId: string): Promise<string> {
  const formId = await seedForm("encuesta", {
    audience: "MEMBERS",
    fields: [{ key: "calif", label: "¿Cómo estuvo?", type: "RATING", required: true }],
    actions: { createPerson: false },
  });
  const { id } = await seedOccasion(termId, { title: "Integración", points: 10 });
  await db().update(occasion).set({ surveyFormId: formId }).where(eq(occasion.id, id));
  return id;
}

describe("las invitaciones a la encuesta toleran el reintento", () => {
  const pushed: Array<{ endpoint: string; url: string }> = [];
  beforeEach(async () => {
    await acceptSurveyNotices();
    await truncateAll();
    pushed.length = 0;
    setPushSenderForTests(async (subscription, payload) => {
      pushed.push({ endpoint: subscription.endpoint, url: payload.url });
      return { ok: true, statusCode: 201 };
    });
  });
  afterEach(acceptSurveyNotices);
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("si el cierre falla entre crear las invitaciones y encolar su aviso, el reintento le manda a cada aprobado su enlace, una sola vez", async () => {
    const termId = await seedTerm();
    const names = ["ana", "bruno", "carla"];
    const people = new Map<string, string>();
    for (const name of names) {
      const personId = await seedMember(`${name}.reintento@eafit.edu.co`);
      people.set(endpointOf(name), personId);
      await saveSubscriptionAs(
        { personId, ip: null },
        { endpoint: endpointOf(name), keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
        null,
      );
    }
    const occasionId = await closedOccasionWithSurvey(termId);
    for (const personId of people.values()) {
      await seedCheckIn(occasionId, personId, "APPROVED");
    }
    await closeOccasionAs(SYSTEM_ACTOR, occasionId);

    await rejectSurveyNotices("all");
    await drainOutbox({ expectFailures: [occasionClosed] });
    expect(pushed).toEqual([]);

    await acceptSurveyNotices();
    await drainOutbox({ now: afterBackoff() });

    // Cada persona recibió un aviso, y uno solo.
    expect(pushed.map((push) => push.endpoint).sort()).toEqual([...people.keys()].sort());
    // Y el enlace que le llegó abre su encuesta: es el de la invitación que quedó en la base.
    for (const push of pushed) {
      const personId = people.get(push.endpoint) ?? "";
      expect(await getSurveyInviteForActor(personId, tokenOf(push.url))).toMatchObject({
        state: "OPEN",
        occasionId,
      });
    }
    // Un reintento más, o un segundo cierre, no manda nada.
    expect((await createSurveyInvites(occasionId)).created).toEqual([]);
    await drainOutbox({ now: afterBackoff() });
    expect(pushed).toHaveLength(names.length);
  });

  it("si falla la segunda tanda, la primera queda hecha con sus avisos y repetir solo completa lo que falta", async () => {
    const termId = await seedTerm();
    const occasionId = await closedOccasionWithSurvey(termId);
    const total = NOTIFICATION_MAX_RECIPIENTS + 1;
    const attendees = await seedPeople(
      Array.from({ length: total }, (_unused, index) => ({
        email: `tanda-${index}@eafit.edu.co`,
        firstName: "Tanda",
        lastName: `Sintética ${index}`,
      })),
    );
    await db()
      .insert(checkIn)
      .values(
        attendees.map((personId) => ({
          occasionId,
          personId,
          status: "APPROVED" as const,
          source: "ADMIN" as const,
        })),
      );
    await db().update(occasion).set({ status: "CLOSED" }).where(eq(occasion.id, occasionId));

    await rejectSurveyNotices("partial-batch");
    await expect(createSurveyInvites(occasionId)).rejects.toThrow();
    // La tanda llena ya salió: sus invitaciones tienen aviso y no se vuelven a tocar.
    expect(await surveyNotices(occasionId)).toHaveLength(NOTIFICATION_MAX_RECIPIENTS);

    await acceptSurveyNotices();
    const retry = await createSurveyInvites(occasionId);
    // El aviso de la primera tanda sigue en cola, sin entregar, y no tapa al de la que faltaba.
    expect(retry.created).toHaveLength(1);

    const invites = await db()
      .select({
        personId: occasionSurveyInvite.personId,
        tokenHash: occasionSurveyInvite.tokenHash,
      })
      .from(occasionSurveyInvite)
      .where(eq(occasionSurveyInvite.occasionId, occasionId));
    const notices = await surveyNotices(occasionId);
    // Nadie se queda sin aviso, nadie lo recibe dos veces, y cada enlace es el de su invitación.
    expect(notices.map((notice) => notice.personId).sort()).toEqual([...attendees].sort());
    expect(
      notices.map((notice) => `${notice.personId}:${hashOf(tokenOf(notice.url))}`).sort(),
    ).toEqual(invites.map((invite) => `${invite.personId}:${invite.tokenHash}`).sort());
  });

  it("si otra corrida del mismo cierre ya ganó la invitación de alguien, esta no le manda un enlace que no abre", async () => {
    const termId = await seedTerm();
    const occasionId = await closedOccasionWithSurvey(termId);
    const ana = await seedMember("ana.doble@eafit.edu.co");
    const bruno = await seedMember("bruno.doble@eafit.edu.co");
    await seedCheckIn(occasionId, ana, "APPROVED");
    await seedCheckIn(occasionId, bruno, "APPROVED");
    await db().update(occasion).set({ status: "CLOSED" }).where(eq(occasion.id, occasionId));
    await warmPool();

    // Otra corrida va adelante: ya insertó la invitación de Ana y todavía no confirma.
    const other = await holdTransaction((tx) =>
      tx.insert(occasionSurveyInvite).values({
        occasionId,
        personId: ana,
        tokenHash: hashOf("enlace-de-la-otra-corrida-000001"),
        sentAt: new Date(),
      }),
    );
    const running = createSurveyInvites(occasionId);
    try {
      // Esta corrida no vio esa invitación y hace cola detrás de ella en el índice único.
      await vi.waitFor(async () => expect(await waitingOn(other.pid)).toBe(1), { timeout: 5_000 });
    } finally {
      other.release();
      await other.done;
    }
    const { created } = await running;

    // A Ana le va el aviso de la corrida que se quedó con su invitación; esta solo lleva a Bruno.
    expect(created.map((item) => item.personId)).toEqual([bruno]);
    const notices = await surveyNotices(occasionId);
    expect(notices.map((notice) => notice.personId)).toEqual([bruno]);
    expect(await getSurveyInviteForActor(bruno, tokenOf(notices[0]?.url ?? ""))).toMatchObject({
      state: "OPEN",
      occasionId,
    });
  });
});
