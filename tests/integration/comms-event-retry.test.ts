import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { requestDecided } from "@/domain-events/crm";
import { accessGrantIssued } from "@/domain-events/identity";
import { personAdmitted } from "@/domain-events/people";
import { getEnv } from "@/env";
import { getHandlers, registerHandler } from "@/jobs/registry";
import {
  listMessagesFor,
  saveSubscriptionAs,
  sendTransactionalEmail,
  setMailTransportsForTests,
  setPushSenderForTests,
  splitPush,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import { issueAccessGrantAs } from "@/modules/identity";
import { admitPersonAs } from "@/modules/people";
import type { MailMessage } from "@/shared/adapters/mail";
import { t, tList } from "@/shared/copy";
import { logger } from "@/shared/log";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
} from "../factories";
import { captureLogs, recordsOf } from "../helpers/logs";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// La bienvenida (T-200) y la respuesta a una solicitud (T-205 y el push T-189) cuando el poller
// reintenta el evento entero (ADR-115 regla 8). El poller es el real: corre en serie los handlers de
// un evento y, si uno falla, lo reintenta completo, con comms incluido. Y el aviso del enlace de acceso
// (T-2132), que lleva la misma clave del evento (ADR-116 regla 17).

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
    registerHandler(accessGrantIssued.type, neighbour);
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
      { personId, ip: null },
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
    // Y cada correo le lleva al proveedor su propia clave de idempotencia (ADR-116 regla 18).
    const keys = mailsTo("dos.veces@eafit.edu.co").map((mail) => mail.idempotencyKey);
    expect(keys.every((key) => key?.endsWith(`/${personId}`))).toBe(true);
    expect(new Set(keys).size).toBe(2);
    expect(await sentTo(personId, "EMAIL")).toHaveLength(2);
  });

  it("el aviso del enlace de acceso llega una sola vez aunque el evento se reintente, y un enlace nuevo avisa otra vez", async () => {
    const { personId } = await activeMember("enlace@eafit.edu.co");
    await saveSubscriptionAs(
      { personId, ip: null },
      { endpoint: DEVICE, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
      null,
    );
    const junta = await seedMember("junta@eafit.edu.co");
    await issueAccessGrantAs({ personId: junta, ip: null }, { personId, kind: "ACTIVATION" });

    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [accessGrantIssued] });
    expect(pushes).toEqual([DEVICE]);

    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(neighbourRuns).toBe(2);
    expect(pushes).toEqual([DEVICE]);
    const afterRetry = await sentTo(personId, "PUSH");
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0]).toMatchObject({
      status: "SENT",
      kind: "TRANSACTIONAL",
      subject: splitPush(t("T-2132")).title,
    });

    // Otro enlace para la misma persona es otro evento: avisa otra vez.
    await issueAccessGrantAs({ personId: junta, ip: null }, { personId, kind: "RECOVERY" });
    const second = await drainOutbox({ now: afterBackoff() });
    expect(second.failed).toBe(0);
    expect(pushes).toEqual([DEVICE, DEVICE]);
    expect(await sentTo(personId, "PUSH")).toHaveLength(2);
  });

  // El id del evento es la mitad de la clave. Sin él quedaría `access-grant:<persona>:`, igual para
  // todos los enlaces de esa persona: el primer aviso taparía los siguientes. El poller siempre lo
  // trae; lo que se fija es que el aviso no confía en eso.
  it("un evento del enlace de acceso que llegue sin id no avisa y falla, en vez de dejar una clave que taparía los avisos siguientes", async () => {
    const { personId } = await activeMember("sin.id@eafit.edu.co");
    await saveSubscriptionAs(
      { personId, ip: null },
      { endpoint: DEVICE, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
      null,
    );
    const payload = { personId, kind: "ACTIVATION", issuedById: null };
    // El primero de la cadena es el de comms: el vecino se registró después.
    const [notify] = getHandlers(accessGrantIssued.type);

    for (const id of ["", "   "]) {
      await expect(
        notify?.(payload, { id, attempt: 1, log: logger, now: new Date() }),
      ).rejects.toThrow(/sin el id de su evento/);
    }

    expect(pushes).toEqual([]);
    expect(await sentTo(personId, "PUSH")).toEqual([]);
  });

  // Lo que el bus hace con todo push (ADR-038 regla 2): salta a quien ya tiene un registro con esa
  // clave, sea de un envío o de un rechazo. Con la clave del evento (ADR-116 regla 17) eso vale también
  // para este aviso; antes el reintento traía otra clave y lo volvía a intentar. Es la pregunta de la
  // decisión abierta 15, que está escrita para el correo: esta prueba cambia con lo que se decida.
  it("un aviso del enlace que el servicio de push rechazó queda fallido y el reintento del evento no lo vuelve a intentar", async () => {
    const { personId } = await activeMember("rechazo@eafit.edu.co");
    await saveSubscriptionAs(
      { personId, ip: null },
      { endpoint: DEVICE, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
      null,
    );
    let serviceDown = true;
    let rejected = 0;
    setPushSenderForTests(async (subscription) => {
      if (serviceDown) {
        rejected += 1;
        return { ok: false, gone: false, statusCode: 503, error: "servicio caído" };
      }
      pushes.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
    const junta = await seedMember("junta@eafit.edu.co");
    await issueAccessGrantAs({ personId: junta, ip: null }, { personId, kind: "ACTIVATION" });

    neighbourFailures = 1;
    const { lines } = await captureLogs(() => drainOutbox({ expectFailures: [accessGrantIssued] }));
    expect(rejected).toBe(1);
    // El rechazo es una advertencia con el código del servicio, no una línea que dice «entregado»
    // (ADR-118 regla 25): este aviso es como la titular se entera de un enlace que pidió otra persona.
    expect(recordsOf(lines, "push del enlace de acceso entregado")).toEqual([]);
    expect(recordsOf(lines, "push sin entregar")).toEqual([
      expect.objectContaining({
        level: 40,
        job: accessGrantIssued.type,
        sent: 0,
        failed: 1,
        deviceFailures: { "503": 1 },
      }),
    ]);
    expect(lines.every(({ line }) => !line.includes(DEVICE))).toBe(true);

    serviceDown = false;
    const retry = await drainOutbox({ now: afterBackoff() });
    expect(retry.failed).toBe(0);
    expect(neighbourRuns).toBe(2);
    expect(pushes).toEqual([]);
    const records = await sentTo(personId, "PUSH");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "FAILED", kind: "TRANSACTIONAL" });
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

  // La clave de idempotencia del proveedor (ADR-116 regla 18). De este lado el envío sigue siendo «al
  // menos una vez» (decisiones abiertas 13 y 15): lo que cambia es que el reenvío lleva la misma clave.
  describe("la clave con la que el correo llega al proveedor", () => {
    const host = () => new URL(getEnv().APP_URL).host;

    it("el correo que el proveedor aceptó y cuyo registro no se guardó vuelve a salir con la misma clave: el entorno, el evento con su texto y la persona", async () => {
      const termId = await seedTerm();
      const committeeId = await seedCommittee("a3", "A3");
      const personId = await seedPerson("sin.registro@eafit.edu.co", {
        stage: "APPLICANT",
        firstName: "Nora",
      });
      await admitPersonAs(admin, personId, { termId, committeeIds: [committeeId] });

      // El proveedor acepta el correo y el evento queda para reintento. El registro se borra a mano: es
      // el estado que deja un proceso que muere entre la respuesta del proveedor y el `message`.
      neighbourFailures = 1;
      await drainOutbox({ expectFailures: [personAdmitted] });
      expect(mailsTo("sin.registro@eafit.edu.co")).toHaveLength(1);
      await getDb().delete(message).where(eq(message.personId, personId));
      expect(await sentTo(personId, "EMAIL")).toHaveLength(0);

      const retry = await drainOutbox({ now: afterBackoff() });
      expect(retry.failed).toBe(0);
      // Nadie supo que el primero había salido: el reintento lo manda otra vez.
      const attempts = mailsTo("sin.registro@eafit.edu.co");
      expect(attempts).toHaveLength(2);
      expect(await sentTo(personId, "EMAIL")).toHaveLength(1);

      const [environment, recordKey, who, ...rest] = attempts[0]?.idempotencyKey?.split("/") ?? [];
      expect(rest).toEqual([]);
      expect(environment).toBe(host());
      expect(recordKey).toMatch(/^event:[^:]+:T-200$/);
      expect(who).toBe(personId);
      // Con la misma clave y el mismo contenido, el proveedor no lo entrega dos veces.
      expect(attempts[1]).toEqual(attempts[0]);
    });

    it("un correo sin clave de registro sale sin clave de idempotencia, y la que no cabe en lo que admite el proveedor viaja como su huella", async () => {
      const { personId } = await activeMember("claves@eafit.edu.co");
      const mail = { personId, to: "claves@eafit.edu.co", subject: "Asunto", text: "Texto" };
      const long = `prueba:${"x".repeat(300)}`;

      await sendTransactionalEmail(mail);
      await sendTransactionalEmail(mail, new Date(), { dedupeKey: "prueba:corta" });
      await sendTransactionalEmail(mail, new Date(), { dedupeKey: long });
      const again = await sendTransactionalEmail(mail, new Date(), { dedupeKey: long });

      const keys = mailsTo("claves@eafit.edu.co").map((sent) => sent.idempotencyKey);
      expect(keys).toHaveLength(3);
      expect(keys[0]).toBeUndefined();
      expect(keys[1]).toBe(`${host()}/prueba:corta/${personId}`);
      expect(keys[2]).toMatch(/^[0-9a-f]{64}$/);
      expect(again).toMatchObject({ status: "SENT", provider: "resend" });
    });

    // El tipo no deja que quien llama pase la clave, pero un objeto armado en otra parte puede traer el
    // campo en ejecución. Al proveedor solo le llega la que sale de la clave del registro.
    it("una clave de idempotencia colada en el correo no llega al proveedor: sin clave de registro sale sin ninguna, y con ella sale la del registro", async () => {
      const { personId } = await activeMember("colada@eafit.edu.co");
      const mail = {
        personId,
        to: "colada@eafit.edu.co",
        subject: "Asunto",
        text: "Texto",
        idempotencyKey: "colada",
      };

      await sendTransactionalEmail(mail);
      await sendTransactionalEmail(mail, new Date(), { dedupeKey: "prueba:colada" });

      const sent = mailsTo("colada@eafit.edu.co");
      expect(sent).toHaveLength(2);
      expect(sent[0]).not.toHaveProperty("idempotencyKey");
      expect(sent[1]?.idempotencyKey).toBe(`${host()}/prueba:colada/${personId}`);
    });
  });
});
