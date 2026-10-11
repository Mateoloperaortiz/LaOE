import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { requestDecided } from "@/domain-events/crm";
import { personAdmitted } from "@/domain-events/people";
import { registerHandler } from "@/jobs/registry";
import {
  listMessagesFor,
  saveSubscriptionAs,
  setMailTransportsForTests,
  setPushSenderForTests,
} from "@/modules/comms";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import { admitPersonAs, anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import type { MailMessage } from "@/shared/adapters/mail";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

// La bienvenida (T-200) y la respuesta a una solicitud (T-205 y el push T-189) cuando la persona se
// anonimiza antes de que el evento termine de procesarse (ADR-116 regla 9). El evento lleva su correo
// real en el payload, y la anonimización borra el registro que evitaba el reenvío (ADR-115 regla 8).
// El poller es el real; el reintento se alcanza adelantándole el reloj.

const MINUTE = 60_000;
const admin = { personId: null, ip: null };
const DEVICE = "https://fcm.googleapis.com/fcm/send/anonimizada";
const until = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString().slice(0, 10);

const mails: MailMessage[] = [];
const pushes: string[] = [];
/** Cuántas veces más falla el vecino de comms. */
let neighbourFailures = 0;
/** Si la prueba la pone, el proveedor de correo no responde hasta que se resuelva. */
let providerHold: Promise<void> | null = null;
let providerBusy = false;

const mailsTo = (email: string) => mails.filter((mail) => mail.to === email);
/** El instante en que el poller ya reintenta un primer fallo: un minuto después (ADR-012). */
const afterBackoff = () => new Date(Date.now() + 2 * MINUTE);

/** Cuántas conexiones de esta base esperan un candado, de quien sea. */
async function waitingForLock(): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `);
  return result.rows[0]?.n ?? 0;
}

async function memberWithDevice(email: string) {
  const termId = await seedTerm();
  const personId = await seedMember(email, { firstName: "Nora" });
  const committeeId = await seedCommittee("a3", "A3");
  await seedCommitteeMembership(personId, committeeId, termId);
  await saveSubscriptionAs(
    { personId, ip: null },
    { endpoint: DEVICE, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    null,
  );
  return { personId, actor: { personId, ip: null } };
}

/** GH rechaza una licencia de la persona: deja `request.decided` en el outbox. */
async function decideLeave(actor: { personId: string; ip: null }) {
  const gh = await seedMember("gh@eafit.edu.co");
  const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });
  await decideRequestAs({ personId: gh, ip: null }, created.id, {
    decision: "REJECTED",
    reason: "Todavía no",
  });
}

async function anonymize(personId: string): Promise<void> {
  await requestDeletionAs({ personId, ip: null });
  await anonymizePersonAs(admin, personId);
}

describe("correos de un evento cuando la persona ya fue anonimizada", () => {
  beforeAll(() => {
    // Un vecino al final de la cadena de los dos eventos: falla después de que comms envió, y con eso
    // el poller deja el evento entero en espera.
    const neighbour = async () => {
      if (neighbourFailures > 0) {
        neighbourFailures -= 1;
        throw new Error("vecino caído");
      }
    };
    registerHandler(personAdmitted.type, neighbour);
    registerHandler(requestDecided.type, neighbour);
  });
  beforeEach(async () => {
    await truncateAll();
    mails.length = 0;
    pushes.length = 0;
    neighbourFailures = 0;
    providerHold = null;
    providerBusy = false;
    setMailTransportsForTests({
      primary: {
        name: "resend",
        send: async (mail) => {
          providerBusy = true;
          if (providerHold) {
            await providerHold;
          }
          mails.push(mail);
          return { id: `re_${mails.length}` };
        },
      },
      overflow: null,
    });
    setPushSenderForTests(async (subscription) => {
      pushes.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("la respuesta a una solicitud que se reintenta después de anonimizar no sale, ni por correo ni por push, ni deja registro", async () => {
    const { personId, actor } = await memberWithDevice("respuesta.sale@eafit.edu.co");
    await decideLeave(actor);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [requestDecided] });
    // El primer intento sí avisó: la persona todavía estaba.
    expect(mailsTo("respuesta.sale@eafit.edu.co")).toHaveLength(1);
    expect(pushes).toEqual([DEVICE]);

    await anonymize(personId);
    await drainOutbox({ expectFailures: [requestDecided] });
    expect(await listMessagesFor(personId)).toEqual([]);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(mailsTo("respuesta.sale@eafit.edu.co")).toHaveLength(1);
    expect(pushes).toEqual([DEVICE]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("la bienvenida que se reintenta después de anonimizar no sale ni deja registro", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3", "A3");
    const personId = await seedPerson("bienvenida.sale@eafit.edu.co", {
      stage: "APPLICANT",
      firstName: "Nora",
    });
    await admitPersonAs(admin, personId, { termId, committeeIds: [committeeId] });
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [personAdmitted] });
    expect(mailsTo("bienvenida.sale@eafit.edu.co")).toHaveLength(1);

    await anonymize(personId);
    await drainOutbox({ expectFailures: [personAdmitted] });
    expect(await listMessagesFor(personId)).toEqual([]);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(mailsTo("bienvenida.sale@eafit.edu.co")).toHaveLength(1);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("un evento que el poller todavía no había tomado cuando la persona se anonimizó no le avisa a nadie", async () => {
    const { personId, actor } = await memberWithDevice("sin.procesar@eafit.edu.co");
    await decideLeave(actor);
    await anonymize(personId);

    await drainOutbox();

    expect(mailsTo("sin.procesar@eafit.edu.co")).toEqual([]);
    expect(pushes).toEqual([]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("una anonimización que llega con el correo saliendo lo espera, y su limpieza se lleva el registro", async () => {
    // Dos workers: uno procesa `request.decided` y el otro, apenas se anonimiza, procesa
    // `person.anonymized`. Sin el candado de la persona el segundo limpia antes de que el primero
    // registre el envío, y ese registro queda para siempre a nombre de alguien anonimizado.
    const { personId, actor } = await memberWithDevice("en.vuelo@eafit.edu.co");
    await requestDeletionAs({ personId, ip: null });
    await decideLeave(actor);
    await warmPool(6);
    let release: () => void = () => undefined;
    providerHold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cleaned = false;
    const sending = drainOutbox();
    let cleaning: Promise<unknown> = Promise.resolve();
    try {
      await expect.poll(() => providerBusy).toBe(true);
      cleaning = anonymizePersonAs(admin, personId)
        .then(() => drainOutbox())
        .then(() => {
          cleaned = true;
        });
      // El segundo worker ya hizo lo que podía: terminó, o espera la fila de la persona.
      await expect.poll(async () => cleaned || (await waitingForLock()) > 0).toBe(true);
    } finally {
      release();
    }
    await Promise.all([sending, cleaning]);
    await drainOutbox();

    // El correo que ya estaba saliendo salió: la persona todavía no estaba anonimizada.
    expect(mailsTo("en.vuelo@eafit.edu.co")).toHaveLength(1);
    expect(await listMessagesFor(personId)).toEqual([]);
  });
});
