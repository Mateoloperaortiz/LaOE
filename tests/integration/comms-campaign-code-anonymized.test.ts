import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createCampaignAs,
  createTemplate,
  getCampaign,
  listMessagesFor,
  listRecipients,
  runCampaignTick,
  scheduleCampaignAs,
  setMailTransportsForTests,
} from "@/modules/comms";
import { requestOtp } from "@/modules/identity";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import { person, segment } from "@/modules/people/schema";
import { setConfig } from "@/modules/system";
import type { MailMessage } from "@/shared/adapters/mail";
import { withTimeout } from "@/shared/lib/timeout";
import { deferred, type Held, holdCommand, waitingForLock, waitingOn } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// El correo de una campaña y el del código de ingreso cuando la persona se anonimiza mientras salen
// (ADR-120 regla 8, DT-276). La limpieza de `comms` corre una sola vez, al procesar
// `person.anonymized`: el registro que se escriba después queda para siempre a nombre de alguien
// anonimizado. Los dos correos viajan sin transacción abierta (ADR-115 regla 1; el código sale dentro
// del request), así que a la persona se la retiene solo para escribir el registro. El proveedor de
// correo es el de pruebas y se deja retener; el lote, el pedido del código, la anonimización y el
// poller son los reales.

const admin = { personId: null, ip: null };
// La hora programada queda en el futuro del reloj real: así programar no encola el arranque inmediato
// y el tick corre con el instante que le pasa la prueba.
const DUE = new Date(Date.now() + 3_600_000);

const mails: MailMessage[] = [];
/** Los correos que el proveedor tiene retenidos ahora mismo. */
const held: MailMessage[] = [];
/** Qué correos retiene el proveedor hasta que la prueba suelte `gate`, por orden de llegada. */
let holds: (call: number) => boolean = () => false;
let gate = deferred<void>();
let calls = 0;

const sentTo = () => mails.map((mail) => mail.to).sort();

interface Member {
  id: string;
  email: string;
}

async function seedRosterMember(name: string): Promise<Member> {
  const email = `${name}@eafit.edu.co`;
  return { id: await seedMember(email, { firstName: name }), email };
}

/** Una campaña a todas las personas de la prueba, programada para `DUE` y con lote para todas. */
async function scheduleCampaign(): Promise<string> {
  await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", 60));
  const [everyone] = await getDb()
    .insert(segment)
    .values({ name: "Todos", filter: {} })
    .returning({ id: segment.id });
  if (!everyone) throw new Error("seed segment");
  const { id: templateId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug: "novedades",
      name: "Novedades",
      subject: "Novedades para {nombre}",
      body: "Hola **{nombre}**.\n\n[Mi OE]({url}/app)",
    }),
  );
  const { id } = await createCampaignAs(SYSTEM_ACTOR, {
    name: "Novedades",
    templateId,
    segmentId: everyone.id,
  });
  await scheduleCampaignAs(SYSTEM_ACTOR, id, DUE);
  return id;
}

/**
 * Lo que hace GH desde otra llamada con el correo ya en vuelo: el pedido de borrado, la anonimización
 * y el poller que procesa `person.anonymized`. El pedido llega recién acá para que la prueba no dependa
 * de si a quien pidió el borrado le sigue saliendo el correo (decisión abierta 17).
 */
async function anonymizeAndClean(personId: string): Promise<void> {
  await requestDeletionAs({ personId, ip: null });
  await anonymizePersonAs(admin, personId);
  await drainOutbox();
}

/** Anonimiza y limpia mientras `sending` tiene su correo retenido en el proveedor, y después lo suelta. */
async function anonymizeWhileInFlight(personId: string, sending: Promise<unknown>): Promise<void> {
  let cleaned = false;
  let cleaning: Promise<unknown> = Promise.resolve();
  try {
    await expect.poll(() => held.length).toBe(1);
    cleaning = anonymizeAndClean(personId).then(() => {
      cleaned = true;
    });
    // La otra llamada ya hizo lo que podía: terminó, o espera un candado de quien envía.
    await expect.poll(async () => cleaned || (await waitingForLock()) > 0).toBe(true);
  } finally {
    gate.resolve();
  }
  await Promise.all([sending, cleaning]);
  await drainOutbox();
}

describe("el correo de una campaña y el del código de ingreso mientras la persona se anonimiza", () => {
  // El lote por minuto que `scheduleCampaign` cambia no se repone a mano: el vaciado de la prueba
  // siguiente devuelve la configuración a la foto de la migración (ADR-124 regla 3).
  beforeEach(async () => {
    await truncateAll();
    mails.length = 0;
    held.length = 0;
    holds = () => false;
    gate = deferred<void>();
    calls = 0;
    setMailTransportsForTests({
      primary: {
        name: "resend",
        send: async (mail) => {
          calls += 1;
          if (holds(calls)) {
            held.push(mail);
            await gate.promise;
          }
          mails.push(mail);
          return { id: `re_${mails.length}` };
        },
      },
      overflow: null,
    });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("el correo de una campaña que sale mientras la persona se anonimiza no queda registrado a su nombre", async () => {
    const nora = await seedRosterMember("nora");
    const campaignId = await scheduleCampaign();
    await warmPool(6);
    holds = () => true;

    await anonymizeWhileInFlight(nora.id, runCampaignTick(DUE));

    // El correo que ya estaba saliendo salió: la persona todavía no estaba anonimizada.
    expect(sentTo()).toEqual([nora.email]);
    expect(await listMessagesFor(nora.id)).toEqual([]);
    // El lote marcó lo que respondió el proveedor y cerró la campaña, como siempre (ADR-115 regla 3).
    expect((await listRecipients(campaignId)).rows).toMatchObject([
      { personId: nora.id, status: "SENT", messageId: null },
    ]);
    expect(await getCampaign(campaignId)).toMatchObject({ status: "SENT", sentCount: 1 });
  });

  it("el registro del correo de una campaña espera a la anonimización que ya empezó y no se escribe", async () => {
    const nora = await seedRosterMember("campana.espera");
    const campaignId = await scheduleCampaign();
    await warmPool(6);
    holds = () => true;
    let tickDone = false;
    const sending = runCampaignTick(DUE).finally(() => {
      tickDone = true;
    });
    let anonymizing: Held | null = null;
    try {
      await expect.poll(() => held.length).toBe(1);
      await requestDeletionAs({ personId: nora.id, ip: null });
      // La anonimización queda escrita y sin confirmar: tiene tomada la fila de la persona.
      const pending = await holdCommand(admin, (ctx) => anonymizePerson(ctx, nora.id));
      anonymizing = pending;
      gate.resolve();
      // El proveedor ya respondió: el lote espera esa fila para registrar, o terminó sin esperarla.
      await expect.poll(async () => tickDone || (await waitingOn(pending.pid)) > 0).toBe(true);
    } finally {
      gate.resolve();
      anonymizing?.release();
    }
    await Promise.all([sending, anonymizing?.done]);

    // Todavía no corrió la limpieza de `person.anonymized`, y no tiene nada que llevarse.
    expect(await listMessagesFor(nora.id)).toEqual([]);
    expect(sentTo()).toEqual([nora.email]);
    await drainOutbox();
    expect(await listMessagesFor(nora.id)).toEqual([]);
    expect((await listRecipients(campaignId)).rows).toMatchObject([
      { personId: nora.id, status: "SENT", messageId: null },
    ]);
    expect(await getCampaign(campaignId)).toMatchObject({ status: "SENT", sentCount: 1 });
  });

  it("mientras el correo de una campaña viaja, el lote no retiene a ninguna persona", async () => {
    // A la persona se la retiene de a una y solo para escribir su registro, con el proveedor ya de
    // vuelta: el lote sigue enviando sin transacción abierta (ADR-115 regla 1).
    const members = [
      await seedRosterMember("primera"),
      await seedRosterMember("segunda"),
      await seedRosterMember("tercera"),
    ];
    await scheduleCampaign();
    await warmPool(6);
    holds = (call) => call === 2;
    const sending = runCampaignTick(DUE);
    let free: string[] = [];
    try {
      await expect.poll(() => held.length).toBe(1);
      // Las filas que otra transacción puede tomar ahora mismo: las retenidas no aparecen.
      free = await getDb().transaction(async (tx) => {
        const rows = await tx
          .select({ id: person.id })
          .from(person)
          .where(
            inArray(
              person.id,
              members.map((member) => member.id),
            ),
          )
          .for("update", { skipLocked: true });
        return rows.map((row) => row.id);
      });
    } finally {
      gate.resolve();
    }
    await sending;

    expect(free.sort()).toEqual(members.map((member) => member.id).sort());
    expect(sentTo()).toEqual(members.map((member) => member.email).sort());
  });

  it("el código de ingreso que sale mientras la persona se anonimiza no queda registrado a su nombre", async () => {
    const nora = await seedRosterMember("codigo.en.vuelo");
    await warmPool(6);
    holds = () => true;

    await anonymizeWhileInFlight(nora.id, requestOtp({ email: nora.email, ip: null }));

    // El código que ya estaba saliendo salió: la persona todavía no estaba anonimizada.
    expect(sentTo()).toEqual([nora.email]);
    expect(await listMessagesFor(nora.id)).toEqual([]);
  });

  it("los códigos que están saliendo no retienen conexiones: con tantos en vuelo como tiene el pool, la base sigue respondiendo", async () => {
    // Pedir el código es una ruta sin sesión y su correo sale dentro del request (decisión abierta 30):
    // si cada correo en vuelo retuviera a su persona, y con ella una conexión, tantos pedidos como
    // conexiones dejarían a toda la casa esperando al proveedor. Por eso se retiene solo el registro.
    const size = getDb().$client.options.max ?? 10;
    const members: Member[] = [];
    for (let index = 0; index < size; index += 1) {
      members.push(await seedRosterMember(`codigo${index}`));
    }
    await warmPool(size);
    holds = () => true;
    const asking = Promise.allSettled(
      members.map((member) => requestOtp({ email: member.email, ip: null })),
    );
    try {
      await expect.poll(() => held.length, { timeout: 5_000 }).toBe(size);
      const answered = await withTimeout(
        getDb().execute<{ ok: number }>(sql`select 1 as ok`),
        2_000,
        "una consulta con los códigos en vuelo",
      );
      expect(answered.rows).toEqual([{ ok: 1 }]);
    } finally {
      gate.resolve();
    }

    expect((await asking).map((result) => result.status)).toEqual(members.map(() => "fulfilled"));
    for (const member of members) {
      expect(await listMessagesFor(member.id)).toHaveLength(1);
    }
  });
});
