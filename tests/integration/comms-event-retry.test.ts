import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { requestDecided } from "@/domain-events/crm";
import { personAdmitted } from "@/domain-events/people";
import { registerHandler } from "@/jobs/registry";
import {
  listMessagesFor,
  saveSubscriptionAs,
  sendTransactionalEmail,
  setMailTransportsForTests,
  setPushSenderForTests,
} from "@/modules/comms";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import { admitPersonAs } from "@/modules/people";
import type { MailMessage } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
} from "./factories";

// La bienvenida (T-200) y la respuesta a una solicitud (T-205 y el push T-189) cuando el poller
// reintenta el evento entero (ADR-115 regla 8). El poller es el real: corre en serie los handlers de
// un evento y, si uno falla, lo reintenta completo, con comms incluido.

const MINUTE = 60_000;
const admin = { personId: null, ip: null };
const DEVICE = "https://fcm.googleapis.com/fcm/send/reintento";
// Regreso previsto dentro de la ventana de una licencia (ADR-060 regla 10): en dos meses.
const until = new Date(Date.now() + 60 * 24 * 60 * 60_000).toISOString().slice(0, 10);
const tipoLicencia = tList("T-894")[0];

const mails: MailMessage[] = [];
const pushes: string[] = [];
/** El proveedor de correo rechaza mientras esto sea cierto. */
let providerDown = false;
/** Cuántas veces más falla el vecino, y cuántas ha corrido. */
let neighbourFailures = 0;
let neighbourRuns = 0;

const mailsTo = (email: string) => mails.filter((mail) => mail.to === email);
const subjectOf = (text: string) => text.split(" · ")[0];
/** El instante en que el poller ya reintenta un primer fallo: un minuto después (ADR-012). */
const afterBackoff = () => new Date(Date.now() + 2 * MINUTE);

async function sentTo(personId: string, channel: "EMAIL" | "PUSH") {
  return (await listMessagesFor(personId)).filter((row) => row.channel === channel);
}

async function activeMember(email: string) {
  const termId = await seedTerm();
  const personId = await seedMember(email, { firstName: "Nora" });
  const committeeId = await seedCommittee("a3", "A3");
  await seedCommitteeMembership(personId, committeeId, termId);
  return { personId, actor: { personId, ip: null } };
}

describe("correos de un evento que el poller reintenta", () => {
  beforeAll(() => {
    // Un vecino de comms en los dos eventos. Importar el drenado ya registró los handlers de los
    // módulos, así que este queda al final de la cadena: falla después de que comms envió, como
    // podría fallar la línea de tiempo de crm, que escucha los mismos eventos.
    const neighbour = async () => {
      neighbourRuns += 1;
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
    providerDown = false;
    neighbourFailures = 0;
    neighbourRuns = 0;
    setMailTransportsForTests({
      primary: {
        name: "resend",
        send: async (mail) => {
          if (providerDown) {
            throw new Error("proveedor caído");
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

  it("la bienvenida llega una sola vez aunque falle otro handler del evento y el poller lo reintente", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3", "A3");
    const personId = await seedPerson("nueva@eafit.edu.co", {
      stage: "APPLICANT",
      firstName: "Nora",
    });
    await admitPersonAs(admin, personId, { termId, committeeIds: [committeeId] });

    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [personAdmitted] });
    expect(mailsTo("nueva@eafit.edu.co")).toHaveLength(1);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    // La cadena entera corrió dos veces: el intento que falló y su reintento.
    expect(neighbourRuns).toBe(2);
    expect(mailsTo("nueva@eafit.edu.co")).toHaveLength(1);
    const emails = await sentTo(personId, "EMAIL");
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      status: "SENT",
      subject: subjectOf(t("T-200", { nombre: "Nora" })),
    });
  });

  it("la respuesta a una solicitud llega una sola vez, por correo y por push, aunque el evento se reintente", async () => {
    const { personId, actor } = await activeMember("licencia@eafit.edu.co");
    await saveSubscriptionAs(
      { personId },
      { endpoint: DEVICE, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
      null,
    );
    const gh = await seedMember("gh@eafit.edu.co");
    const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });
    await decideRequestAs({ personId: gh, ip: null }, created.id, { decision: "APPROVED" });

    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [requestDecided] });
    expect(mailsTo("licencia@eafit.edu.co")).toHaveLength(1);
    expect(pushes).toEqual([DEVICE]);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(neighbourRuns).toBe(2);
    expect(mailsTo("licencia@eafit.edu.co")).toHaveLength(1);
    expect(pushes).toEqual([DEVICE]);
    const emails = await sentTo(personId, "EMAIL");
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      status: "SENT",
      subject: subjectOf(t("T-205", { tipo: tipoLicencia })),
    });
    const sentPushes = await sentTo(personId, "PUSH");
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0]).toMatchObject({ status: "SENT", kind: "TRANSACTIONAL" });
  });

  it("cada solicitud respondida manda su propio correo: la clave es del evento y no solo de la persona", async () => {
    const { personId, actor } = await activeMember("dos.veces@eafit.edu.co");
    const gh = await seedMember("gh@eafit.edu.co");
    for (const reason of ["Intercambio", "Práctica"]) {
      const created = await createRequestAs(actor, "LEAVE", { reason, until });
      await decideRequestAs({ personId: gh, ip: null }, created.id, {
        decision: "REJECTED",
        reason: "Todavía no",
      });
      await drainOutbox();
    }
    expect(mailsTo("dos.veces@eafit.edu.co")).toHaveLength(2);
    expect(await sentTo(personId, "EMAIL")).toHaveLength(2);
  });

  // Lo que el código hace mientras la decisión abierta 15 no diga otra cosa: el registro de un rechazo
  // también cuenta, como en el resultado de permanencia.
  it("el intento que no envía responde con lo que quedó registrado: enviado si el correo salió, fallido si el proveedor lo rechazó", async () => {
    const { personId } = await activeMember("recibo@eafit.edu.co");
    const mail = {
      personId,
      to: "recibo@eafit.edu.co",
      subject: "Asunto",
      text: "Texto",
      html: "<p>Texto</p>",
    };
    const send = (dedupeKey: string) => sendTransactionalEmail(mail, new Date(), { dedupeKey });

    providerDown = true;
    const rejected = await send("prueba:rechazado");
    providerDown = false;
    const afterRejection = await send("prueba:rechazado");
    const accepted = await send("prueba:aceptado");
    const afterAcceptance = await send("prueba:aceptado");

    expect(rejected).toMatchObject({ status: "FAILED", provider: "resend" });
    expect(afterRejection).toEqual(rejected);
    expect(accepted).toMatchObject({ status: "SENT", provider: "resend" });
    expect(afterAcceptance).toEqual(accepted);
    // Ninguno de los dos intentos repetidos volvió a enviar.
    expect(mailsTo("recibo@eafit.edu.co")).toHaveLength(1);
    expect(await sentTo(personId, "EMAIL")).toHaveLength(2);
  });

  it("mientras la decisión 15 siga abierta, una bienvenida que el proveedor rechazó queda fallida y el reintento del evento no la vuelve a intentar", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("a3", "A3");
    const personId = await seedPerson("rechazada@eafit.edu.co", { stage: "APPLICANT" });
    await admitPersonAs(admin, personId, { termId, committeeIds: [committeeId] });

    providerDown = true;
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [personAdmitted] });
    providerDown = false;
    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(neighbourRuns).toBe(2);

    expect(mailsTo("rechazada@eafit.edu.co")).toHaveLength(0);
    const emails = await sentTo(personId, "EMAIL");
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ status: "FAILED", provider: "resend" });
  });
});
