import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { checkinApproved } from "@/domain-events/participation";
import { permanenceDecided } from "@/domain-events/permanence";
import {
  listMessagesFor,
  saveSubscriptionAs,
  setMailTransportsForTests,
  setPushSenderForTests,
} from "@/modules/comms";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { person } from "@/modules/people/schema";
import type { MailMessage } from "@/shared/adapters/mail";
import { deferred, waitingForLock } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

// Los avisos que no pasaban por `unlessAnonymized` (DT-172, ADR-119 regla 11): el correo del resultado
// de permanencia (T-202) y todo push, del bus o por evento. Leían a la persona sin retenerla: con dos
// workers, `person.anonymized` se procesaba entre esa lectura y el registro, su limpieza no encontraba
// nada y el `message` quedaba para siempre a nombre de alguien anonimizado. El poller es el real: un
// worker entrega con el proveedor retenido y otro, desde otra llamada, anonimiza y drena.

const admin = { personId: null, ip: null };
const endpointOf = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;

const mails: MailMessage[] = [];
const pushes: string[] = [];
/** Si la prueba la pone, el proveedor no responde hasta que se resuelva. */
let providerHold: Promise<void> | null = null;
/** Solo se retiene el push a este dispositivo; `null`, cualquiera. */
let heldEndpoint: string | null = null;
let providerBusy = false;

async function throughProvider(endpoint: string | null): Promise<void> {
  if (providerHold && (heldEndpoint === null || heldEndpoint === endpoint)) {
    providerBusy = true;
    await providerHold;
  }
}

async function memberWithDevice(name: string): Promise<string> {
  const personId = await seedMember(`${name}@eafit.edu.co`, { firstName: "Nora" });
  await saveSubscriptionAs(
    { personId },
    { endpoint: endpointOf(name), keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    null,
  );
  return personId;
}

/**
 * Dos workers. El primero drena con el proveedor retenido; el segundo, apenas el aviso está saliendo,
 * anonimiza a la persona y drena lo que eso dejó. Cuando el segundo ya hizo lo que podía (terminó, o
 * espera la fila de la persona) se suelta al proveedor y se espera a los dos.
 */
async function anonymizeWhileSending(personId: string): Promise<void> {
  const hold = deferred<void>();
  providerHold = hold.promise;
  const sending = drainOutbox();
  let cleaned = false;
  let cleaning: Promise<unknown> = Promise.resolve();
  try {
    await expect.poll(() => providerBusy).toBe(true);
    cleaning = anonymizePersonAs(admin, personId)
      .then(() => drainOutbox())
      .then(() => {
        cleaned = true;
      });
    await expect.poll(async () => cleaned || (await waitingForLock()) > 0).toBe(true);
  } finally {
    hold.resolve();
  }
  await Promise.all([sending, cleaning]);
  await drainOutbox();
}

function pointsApproved(personId: string, termId: string) {
  return eventOf(checkinApproved, {
    occasionId: "ocasion-sintetica",
    occasionTitle: "Taller de prueba",
    personId,
    termId,
    category: "WORKSHOP",
    kind: "ACTIVITY",
    points: 10,
    source: "SELF",
  });
}

describe("avisos mientras la persona se anonimiza", () => {
  beforeEach(async () => {
    await truncateAll();
    mails.length = 0;
    pushes.length = 0;
    providerHold = null;
    heldEndpoint = null;
    providerBusy = false;
    setMailTransportsForTests({
      primary: {
        name: "resend",
        send: async (mail) => {
          await throughProvider(null);
          mails.push(mail);
          return { id: `re_${mails.length}` };
        },
      },
      overflow: null,
    });
    setPushSenderForTests(async (subscription) => {
      await throughProvider(subscription.endpoint);
      pushes.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("una anonimización que llega con el correo del resultado de permanencia saliendo lo espera, y su limpieza se lleva el registro", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("cumple.en.vuelo@eafit.edu.co", { firstName: "Nora" });
    await requestDeletionAs({ personId });
    await enqueueEvent(
      getDb(),
      eventOf(permanenceDecided, {
        actorId: null,
        personId,
        termId,
        committeeId: null,
        decision: "CONTINUES",
        reason: "",
      }),
    );
    await warmPool(6);

    await anonymizeWhileSending(personId);

    // El correo que ya estaba saliendo salió: la persona todavía no estaba anonimizada.
    expect(mails.map((mail) => mail.to)).toEqual(["cumple.en.vuelo@eafit.edu.co"]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("una anonimización que llega con un push de puntos saliendo lo espera, y su limpieza se lleva el registro", async () => {
    const termId = await seedTerm();
    const personId = await memberWithDevice("puntos.en.vuelo");
    await requestDeletionAs({ personId });
    await enqueueEvent(getDb(), pointsApproved(personId, termId));
    await warmPool(6);

    await anonymizeWhileSending(personId);

    expect(pushes).toEqual([endpointOf("puntos.en.vuelo")]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("un push que el poller todavía no había tomado cuando la persona se anonimizó no sale ni deja registro", async () => {
    // El evento del push quedó en el outbox antes que `person.anonymized`: el poller lo procesa
    // primero, con la persona ya anonimizada y su dispositivo todavía sin borrar.
    const termId = await seedTerm();
    const personId = await memberWithDevice("puntos.tarde");
    await requestDeletionAs({ personId });
    await enqueueEvent(getDb(), pointsApproved(personId, termId));
    await anonymizePersonAs(admin, personId);

    await drainOutbox();

    expect(pushes).toEqual([]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("un aviso a varias personas retiene solo a la que tiene el push saliendo", async () => {
    const [first, second, third] = [
      await memberWithDevice("primera"),
      await memberWithDevice("segunda"),
      await memberWithDevice("tercera"),
    ];
    await enqueueEvent(
      getDb(),
      eventOf(notificationRequested, {
        kind: "ANNOUNCEMENT",
        recipients: [first, second, third].map((personId) => ({ personId })),
        title: "Aviso sintético",
        body: "",
        url: "/app",
        dedupeKey: "aviso-sintetico",
      }),
    );
    await warmPool(6);
    const hold = deferred<void>();
    providerHold = hold.promise;
    heldEndpoint = endpointOf("segunda");
    const sending = drainOutbox();
    let free: string[] = [];
    try {
      await expect.poll(() => providerBusy).toBe(true);
      // Las filas que otra transacción puede tomar ahora mismo: las retenidas no aparecen.
      free = await getDb().transaction(async (tx) => {
        const rows = await tx
          .select({ id: person.id })
          .from(person)
          .where(inArray(person.id, [first, second, third]))
          .for("update", { skipLocked: true });
        return rows.map((row) => row.id);
      });
    } finally {
      hold.resolve();
    }
    await sending;

    expect(free.sort()).toEqual([first, third].sort());
    expect(pushes).toEqual(["primera", "segunda", "tercera"].map(endpointOf));
  });
});
