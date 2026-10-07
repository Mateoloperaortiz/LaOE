import { setTimeout as sleep } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { SCHEDULE } from "@/jobs/schedule";
import { enqueueScheduled } from "@/jobs/scheduler";
import {
  cancelCampaignAs,
  createCampaignAs,
  createTemplate,
  getCampaign,
  getPreferences,
  listRecipients,
  runCampaignTick,
  scheduleCampaignAs,
  setMailTransportsForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { segment } from "@/modules/people/schema";
import { requireConfig, setConfig } from "@/modules/system";
import {
  type MailMessage,
  type MailProvider,
  type MailTransport,
  QuotaExceededError,
} from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { withTimeout } from "@/shared/lib/timeout";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Caracterización del lote de una campaña (ADR-038 regla 8) antes de tocarlo (ADR-109, DT-077): lo que
// hoy funciona queda fijado en verde, por el tick que exporta `comms` y con el transporte de pruebas; los
// defectos quedan después, cada uno con su fila del ledger y su ticket: los que siguen abiertos fallan a
// propósito (`knownDefect`) y los ya corregidos son pruebas corrientes (`fixedDefect`). Al final, lo que
// el lote hace desde ADR-115.

const db = () => getDb();

// La hora programada queda en el futuro del reloj real: así programar no encola el arranque inmediato
// y cada tick corre con el instante que le pasa la prueba.
const DUE = new Date(Date.now() + 3_600_000);
const minute = (n: number): Date => new Date(DUE.getTime() + n * 60_000);

const delivered: Record<"primary" | "overflow", MailMessage[]> = { primary: [], overflow: [] };

/** Qué hace el proveedor con cada correo, en orden de llegada: devuelve su id, espera o lo rechaza. */
type Accept = (mail: MailMessage, call: number) => string | Promise<string>;

/** Transporte de pruebas: lo que el proveedor aceptó queda en `inbox`, en el orden en que salió. */
function fakeTransport(
  name: MailProvider,
  inbox: MailMessage[],
  accept: Accept = (_mail, call) => `${name}_${call}`,
): MailTransport {
  let calls = 0;
  return {
    name,
    async send(mail) {
      calls += 1;
      const id = await accept(mail, calls);
      inbox.push(mail);
      return { id };
    },
  };
}

/** Resend de primario y SES de desbordamiento, como en ADR-023; `overflow: null` deja solo a Resend. */
function useTransports(accept: { primary?: Accept; overflow?: Accept | null } = {}): void {
  setMailTransportsForTests({
    primary: fakeTransport("resend", delivered.primary, accept.primary),
    overflow:
      accept.overflow === null ? null : fakeTransport("ses", delivered.overflow, accept.overflow),
  });
}

interface Member {
  id: string;
  email: string;
}

async function seedRosterMember(firstName: string): Promise<Member> {
  const email = `${firstName.toLowerCase()}@eafit.edu.co`;
  return { id: await seedMember(email, { firstName }), email };
}

const NAMES = ["Ana", "Beto", "Caro", "Dani", "Eli", "Fede"];

async function seedRoster(size: number): Promise<Member[]> {
  const roster: Member[] = [];
  for (const name of NAMES.slice(0, size)) {
    roster.push(await seedRosterMember(name));
  }
  return roster;
}

const emails = (roster: Member[]): string[] => roster.map((member) => member.email).sort();
const addresses = (inbox: MailMessage[]): string[] => inbox.map((mail) => mail.to).sort();

function setPerMinute(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", value));
}

interface CampaignParts {
  templateId: string;
  segmentId: string;
}

/** La plantilla y el segmento de una campaña a todas las personas de la prueba. */
async function seedParts(): Promise<CampaignParts> {
  const [row] = await db()
    .insert(segment)
    .values({ name: "Todos", filter: {} })
    .returning({ id: segment.id });
  if (!row) throw new Error("seed segment");
  const { id: templateId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug: "novedades",
      name: "Novedades",
      subject: "Novedades para {nombre}",
      body: "Hola **{nombre}**.\n\n[Mi OE]({url}/app)",
    }),
  );
  return { templateId, segmentId: row.id };
}

async function scheduleNew(parts: CampaignParts, name: string, at = DUE): Promise<string> {
  const { id } = await createCampaignAs(SYSTEM_ACTOR, { name, ...parts });
  await scheduleCampaignAs(SYSTEM_ACTOR, id, at);
  return id;
}

/** Una campaña a todas las personas de la prueba, programada para `DUE`, con ese lote por minuto. */
async function scheduleCampaign(perMinute: number): Promise<string> {
  await setPerMinute(perMinute);
  return scheduleNew(await seedParts(), "Novedades");
}

async function recipientStatuses(campaignId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const row of (await listRecipients(campaignId)).rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

function optOutOfCampaigns(personId: string): Promise<void> {
  return updatePreferencesAs(
    { personId },
    {
      emailCampaigns: false,
      pushAnnouncements: true,
      pushPoints: true,
      pushReminders: true,
      pushWordle: true,
    },
  );
}

function campaignsEntry() {
  const entry = SCHEDULE.find((item) => item.name === "campaigns");
  if (!entry) throw new Error("El programado de campañas no está en el calendario");
  return entry;
}

let seededPerMinute = 0;

beforeAll(async () => {
  seededPerMinute = await requireConfig("campaigns.perMinute");
});
beforeEach(async () => {
  await truncateAll();
  delivered.primary.length = 0;
  delivered.overflow.length = 0;
  useTransports();
});
afterAll(async () => {
  // `truncateAll` conserva la configuración: el lote por minuto de estas pruebas no se le deja a otra.
  await setPerMinute(seededPerMinute);
  setMailTransportsForTests(undefined);
  await closeDb();
});

describe("el lote de una campaña, tal como es hoy", () => {
  it("un tick con cupo para todos arranca la campaña vencida, le manda a cada elegible y la cierra", async () => {
    const ana = await seedRosterMember("Ana");
    const beto = await seedRosterMember("Beto");
    const caro = await seedRosterMember("Caro");
    const dani = await seedRosterMember("Dani");
    await optOutOfCampaigns(dani.id);
    const id = await scheduleCampaign(10);

    expect(await runCampaignTick(minute(-1))).toEqual({ started: 0, sent: 0 });
    expect((await getCampaign(id))?.status).toBe("SCHEDULED");
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 3 });

    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      startedAt: minute(0),
      finishedAt: minute(0),
      totalCount: 4,
      sentCount: 3,
      failedCount: 0,
      skippedCount: 1,
    });
    const recipients = new Map((await listRecipients(id)).rows.map((row) => [row.personId, row]));
    expect(recipients.get(dani.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "OPTED_OUT",
      sentAt: null,
      messageId: null,
    });
    for (const member of [ana, beto, caro]) {
      expect(recipients.get(member.id)).toMatchObject({
        status: "SENT",
        skipReason: null,
        sentAt: minute(0),
      });
    }

    // Lo que recibió el transporte: uno por elegible, por SES, con su asunto y su baja en un clic.
    expect(delivered.primary).toEqual([]);
    expect(addresses(delivered.overflow)).toEqual(emails([ana, beto, caro]));
    const token = (await getPreferences(ana.id)).unsubscribeToken;
    expect(token).toEqual(expect.any(String));
    const toAna = delivered.overflow.find((mail) => mail.to === ana.email);
    expect(toAna?.subject).toBe("Novedades para Ana");
    expect(toAna?.html).toContain("<strong>Ana</strong>");
    expect(toAna?.text).toContain(`/baja/${token}`);
    expect(toAna?.headers?.["List-Unsubscribe"]).toMatch(new RegExp(`/api/baja/${token}>$`));
    expect(toAna?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // Y el registro: un mensaje por correo, ligado a su destinatario.
    const messages = await db().select().from(message).where(eq(message.campaignId, id));
    expect(messages.map((row) => row.id).sort()).toEqual(
      [ana, beto, caro].map((member) => recipients.get(member.id)?.messageId).sort(),
    );
    for (const row of messages) {
      expect(row).toMatchObject({
        channel: "EMAIL",
        kind: "CAMPAIGN",
        status: "SENT",
        provider: "ses",
        providerId: expect.stringMatching(/^ses_\d$/),
        sentAt: minute(0),
      });
    }
  });

  it("con el lote por minuto en dos, cinco destinatarios salen en tres ticks y ninguno se repite", async () => {
    const roster = await seedRoster(5);
    const id = await scheduleCampaign(2);

    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      startedAt: minute(0),
      finishedAt: null,
      totalCount: 5,
      sentCount: 2,
    });
    expect(await recipientStatuses(id)).toEqual({ SENT: 2, PENDING: 3 });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 4 });

    expect(await runCampaignTick(minute(2))).toEqual({ started: 0, sent: 1 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      startedAt: minute(0),
      finishedAt: minute(2),
      totalCount: 5,
      sentCount: 5,
      failedCount: 0,
      skippedCount: 0,
    });

    expect(await runCampaignTick(minute(3))).toEqual({ started: 0, sent: 0 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
  });

  it("«Enviar ahora» y el programado de cada minuto corren el mismo tick: cada uno manda un lote", async () => {
    const roster = await seedRoster(3);
    await setPerMinute(2);
    const { id } = await createCampaignAs(SYSTEM_ACTOR, {
      name: "Novedades",
      ...(await seedParts()),
    });

    // Una fecha vencida es «ahora»: programar encola el arranque sin esperar al minuto.
    await scheduleCampaignAs(SYSTEM_ACTOR, id, new Date(Date.now() - 1000));
    await drainOutbox();
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", totalCount: 3, sentCount: 2 });

    await enqueueScheduled(campaignsEntry());
    await drainOutbox();
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 3 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
  });

  it("cancelar entre dos lotes deja lo pendiente omitido y el siguiente tick no manda nada", async () => {
    await seedRoster(5);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const sentBefore = addresses(delivered.overflow);

    await cancelCampaignAs(SYSTEM_ACTOR, id);

    expect(await getCampaign(id)).toMatchObject({
      status: "CANCELLED",
      finishedAt: expect.any(Date),
      totalCount: 5,
      sentCount: 2,
      failedCount: 0,
      skippedCount: 3,
    });
    const { rows } = await listRecipients(id);
    expect(rows.filter((row) => row.status === "SENT")).toHaveLength(2);
    expect(rows.filter((row) => row.skipReason === "CANCELLED")).toHaveLength(3);
    expect(rows.filter((row) => row.status === "PENDING")).toHaveLength(0);

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });
    expect(addresses(delivered.overflow)).toEqual(sentBefore);
    await expect(cancelCampaignAs(SYSTEM_ACTOR, id)).rejects.toThrow(t("T-1137"));
  });

  it("una campaña cancelada antes de su hora no arranca ni congela audiencia", async () => {
    await seedRoster(2);
    const id = await scheduleCampaign(10);

    await cancelCampaignAs(SYSTEM_ACTOR, id);

    expect(await runCampaignTick(minute(0))).toEqual({ started: 0, sent: 0 });
    expect(await getCampaign(id)).toMatchObject({ status: "CANCELLED", totalCount: 0 });
    expect((await listRecipients(id)).total).toBe(0);
    expect(delivered.overflow).toEqual([]);
  });

  it("una baja entre dos lotes no saca a la persona de la campaña en curso, que ya congeló su audiencia; la siguiente sí la omite", async () => {
    const roster = await seedRoster(4);
    await setPerMinute(2);
    const parts = await seedParts();
    const id = await scheduleNew(parts, "Novedades");
    await runCampaignTick(minute(0));
    const waiting = (await listRecipients(id)).rows.find((row) => row.status === "PENDING");
    if (!waiting) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");

    await optOutOfCampaigns(waiting.personId);

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, skippedCount: 0 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));

    const next = await scheduleNew(parts, "Las de la otra semana", minute(10));
    expect(await runCampaignTick(minute(10))).toEqual({ started: 1, sent: 2 });
    const { rows } = await listRecipients(next);
    expect(rows.find((row) => row.personId === waiting.personId)).toMatchObject({
      status: "SKIPPED",
      skipReason: "OPTED_OUT",
    });
    expect(await getCampaign(next)).toMatchObject({ totalCount: 4, sentCount: 2, skippedCount: 1 });
    expect(delivered.overflow.filter((mail) => mail.to === waiting.email)).toHaveLength(1);
  });

  it("sin desbordamiento sale por el primario; lo que el proveedor rechaza queda fallido, la campaña se cierra y nadie lo reintenta", async () => {
    const roster = await seedRoster(3);
    const [, beto] = roster;
    if (!beto) throw new Error("seed roster");
    const id = await scheduleCampaign(10);
    let rejecting = true;
    useTransports({
      overflow: null,
      primary: (mail, call) => {
        if (rejecting && mail.to === beto.email) {
          throw new Error("550 buzón inexistente");
        }
        return `resend_${call}`;
      },
    });

    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 2 });

    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(0),
      totalCount: 3,
      sentCount: 2,
      failedCount: 1,
      skippedCount: 0,
    });
    const failed = (await listRecipients(id)).rows.find((row) => row.personId === beto.id);
    expect(failed).toMatchObject({ status: "FAILED", sentAt: null });
    const [record] = await db()
      .select()
      .from(message)
      .where(eq(message.id, failed?.messageId ?? ""));
    expect(record).toMatchObject({
      kind: "CAMPAIGN",
      campaignId: id,
      status: "FAILED",
      provider: "resend",
      providerId: null,
      error: "550 buzón inexistente",
      sentAt: null,
    });
    expect(delivered.overflow).toEqual([]);
    expect(addresses(delivered.primary)).toEqual(
      emails(roster.filter((member) => member !== beto)),
    );

    // El proveedor ya lo recibiría, pero el lote solo toma pendientes.
    rejecting = false;
    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });
    expect(delivered.primary).toHaveLength(2);
  });

  it("dos ticks a la vez arrancan la campaña una sola vez y no le mandan dos veces a nadie", async () => {
    const roster = await seedRoster(6);
    const id = await scheduleCampaign(3);

    const ticks = await Promise.all([runCampaignTick(minute(0)), runCampaignTick(minute(0))]);

    expect(ticks.reduce((sum, tick) => sum + tick.started, 0)).toBe(1);
    expect(ticks.reduce((sum, tick) => sum + tick.sent, 0)).toBe(6);
    expect((await getCampaign(id))?.totalCount).toBe(6);
    expect(await recipientStatuses(id)).toEqual({ SENT: 6 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
    // Los contadores y el cierre no se afirman acá: con dos lotes a la vez quedan a medias (DT-112).
  });
});

/** El motivo de un rechazo en una línea: el de Postgres si viene, que el de Drizzle repite la consulta. */
function reasonOf(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) {
    return cause.message;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Cómo terminó una promesa: `null` si cumplió, el motivo si rechazó. Nunca rechaza. */
const settle = (work: Promise<unknown>): Promise<string | null> => work.then(() => null, reasonOf);

const SCENARIO_DEADLINE_MS = 15_000;

/**
 * Un defecto conocido del lote, escrito como la conducta correcta que hoy no se cumple (`it.fails`):
 * `observe` arma el escenario y devuelve lo que pasó; `expectFixed` afirma lo que debería pasar. Si el
 * escenario no se arma o no termina, la prueba no lanza y vitest la da por rota: un escenario caído no
 * cuenta como defecto reproducido. Cuando entre el ticket que lo corrige, vitest avisa que la prueba ya
 * pasa y la llamada se vuelve un `fixedDefect`.
 */
function knownDefect<T>(
  title: string,
  observe: () => Promise<T>,
  expectFixed: (seen: T) => void,
): void {
  it.fails(title, async () => {
    let seen: T;
    try {
      seen = await withTimeout(observe(), SCENARIO_DEADLINE_MS, "el escenario del defecto");
    } catch (error) {
      console.error("No se pudo armar el escenario del defecto:", error);
      return;
    }
    expectFixed(seen);
  });
}

/**
 * Un defecto que ya se corrigió: el mismo escenario y la misma afirmación que tuvo como `knownDefect`,
 * ahora como prueba corriente. Acá el escenario sí tiene que armarse y terminar.
 */
function fixedDefect<T>(
  title: string,
  observe: () => Promise<T>,
  expectFixed: (seen: T) => void,
): void {
  it(title, async () => {
    expectFixed(await withTimeout(observe(), SCENARIO_DEADLINE_MS, "el escenario del defecto"));
  });
}

interface LockWaiter {
  pid: number;
  statement: string;
}

/** Las sentencias que esperan un candado en la base de la prueba; primero la que más lleva esperando. */
async function lockWaiters(): Promise<LockWaiter[]> {
  const result = await db().execute<{ pid: number; query: string }>(sql`
    select pid, query from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
    order by query_start
  `);
  return result.rows.map((row) => ({
    pid: row.pid,
    statement: row.query.trim().split(/\s+/).slice(0, 3).join(" "),
  }));
}

/** Espera a que `count` sesiones de la base estén esperando un candado, o a que `work` termine antes. */
async function untilLockWaiters(count: number, work: Promise<unknown>): Promise<void> {
  let settled = false;
  const done = (): void => {
    settled = true;
  };
  void work.then(done, done);
  for (let attempt = 0; attempt < 200 && !settled; attempt += 1) {
    if ((await lockWaiters()).length >= count) {
      return;
    }
    await sleep(25);
  }
}

/** Quién sigue esperando un candado si `work` no terminó en `milliseconds`; nadie si terminó. */
async function stuckAfter(work: Promise<unknown>, milliseconds: number): Promise<LockWaiter[]> {
  let settled = false;
  void work.then(() => {
    settled = true;
  });
  for (let waited = 0; waited < milliseconds && !settled; waited += 25) {
    await sleep(25);
  }
  return settled ? [] : lockWaiters();
}

/** Lo que Postgres espera antes de buscar un interbloqueo, en milisegundos. */
async function deadlockTimeoutMs(): Promise<number> {
  const result = await db().execute<{ ms: number }>(
    sql`select setting::int as ms from pg_settings where name = 'deadlock_timeout'`,
  );
  return result.rows[0]?.ms ?? 1000;
}

describe("los defectos que la caracterización le encontró al lote", () => {
  // DT-067, corregido en #145 (ADR-115 reglas 1 y 2): el lote marcaba a los enviados en la misma
  // transacción en la que enviaba, y al caerse la transacción los correos ya habían salido.
  fixedDefect(
    "un lote que se cae después de enviar no les repite el correo a quienes ya lo recibieron",
    async () => {
      await seedRoster(5);
      await scheduleCampaign(5);
      // El proveedor acepta el tercer correo, pero su id no se puede guardar (Postgres no admite el
      // byte nulo): el registro en `message` falla después del envío y el lote no termina.
      useTransports({ overflow: (_mail, call) => (call === 3 ? "ses_\u0000" : `ses_${call}`) });

      const interruption = await settle(runCampaignTick(minute(0)));
      // Los dos primeros salieron, quedaron registrados y marcados antes de la caída.
      const [first, second] = delivered.overflow.map((mail) => mail.to);
      await runCampaignTick(minute(1));

      const copiesOf = (address: string | undefined) =>
        delivered.overflow.filter((mail) => mail.to === address).length;
      return { interruption, copies: [copiesOf(first), copiesOf(second)] };
    },
    (seen) => {
      expect(seen.copies).toEqual([1, 1]);
    },
  );

  // DT-068, lo corrige #145: cancelar toma la campaña y espera al lote, que la necesita para registrar su mensaje.
  knownDefect(
    "cancelar con un lote en curso no los deja esperándose: la campaña queda cancelada y los contadores dicen lo que salió",
    async () => {
      await seedRoster(4);
      const id = await scheduleCampaign(2);
      let reached = (): void => {};
      const inFlight = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let release = (): void => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Un transporte lento: el primer correo del lote no sale hasta que la prueba lo suelta.
      useTransports({
        overflow: async (_mail, call) => {
          if (call === 1) {
            reached();
            await gate;
          }
          return `ses_${call}`;
        },
      });

      const tick = settle(runCampaignTick(minute(0)));
      await Promise.race([
        inFlight,
        tick.then((reason) => {
          throw new Error(`El lote terminó sin llegar al transporte: ${reason}`);
        }),
      ]);
      const cancel = settle(cancelCampaignAs(SYSTEM_ACTOR, id));
      await untilLockWaiters(1, cancel);
      release();

      // Con el doble de lo que Postgres tarda en ver un interbloqueo suyo, lo que siga esperando ya
      // no lo va a destrabar él. Lo destraba lo mismo que en producción, pero al minuto: el
      // `statement_timeout`, que cancela la sentencia que más lleva esperando.
      const both = Promise.all([tick, cancel]);
      const stuck = await stuckAfter(both, 2 * (await deadlockTimeoutMs()));
      const [oldest] = stuck;
      if (oldest) {
        await db().execute(sql`select pg_cancel_backend(${oldest.pid})`);
      }
      const [tickError, cancelError] = await both;

      return {
        stuck: stuck.map((waiter) => waiter.statement),
        errors: { tick: tickError, cancel: cancelError },
        campaign: await getCampaign(id),
        recipients: await recipientStatuses(id),
        accepted: delivered.overflow.length,
      };
    },
    (seen) => {
      expect(seen.stuck).toEqual([]);
      expect(seen.errors).toEqual({ tick: null, cancel: null });
      expect(seen.campaign).toMatchObject({
        status: "CANCELLED",
        totalCount: 4,
        sentCount: seen.accepted,
        skippedCount: 4 - seen.accepted,
      });
      expect(seen.recipients).toEqual({ SENT: seen.accepted, SKIPPED: 4 - seen.accepted });
    },
  );

  // DT-066, lo corrige #146: una campaña no mira la cuota y trata su rechazo como uno definitivo.
  knownDefect(
    "con la cuota del proveedor agotada, a quien le faltaba el correo queda pendiente y lo recibe cuando vuelve el cupo",
    async () => {
      const roster = await seedRoster(3);
      const id = await scheduleCampaign(10);
      let quota = 1;
      useTransports({
        overflow: null,
        primary: (_mail, call) => {
          if (quota === 0) {
            throw new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy");
          }
          quota -= 1;
          return `resend_${call}`;
        },
      });

      await runCampaignTick(minute(0));
      const exhausted = {
        recipients: await recipientStatuses(id),
        campaign: await getCampaign(id),
      };
      quota = 10;
      await runCampaignTick(minute(24 * 60));

      return {
        roster,
        exhausted,
        received: addresses(delivered.primary),
        campaign: await getCampaign(id),
      };
    },
    (seen) => {
      expect(seen.exhausted.recipients).toEqual({ SENT: 1, PENDING: 2 });
      expect(seen.exhausted.campaign).toMatchObject({ status: "SENDING", failedCount: 0 });
      expect(seen.received).toEqual(emails(seen.roster));
      expect(seen.campaign).toMatchObject({ status: "SENT", sentCount: 3, failedCount: 0 });
    },
  );

  // DT-112, corregido en #145 (ADR-115 regla 3): cada lote recontaba sin ver al otro.
  fixedDefect(
    "dos lotes a la vez dejan la campaña cerrada y con los contadores de lo que salió",
    async () => {
      await seedRoster(6);
      const id = await scheduleCampaign(2);
      await runCampaignTick(minute(0));

      // Suelta, la carrera es de milisegundos y se da unas veces sí y otras no. Acá la prueba sostiene
      // la fila de la campaña, sin estorbar el registro de los mensajes, hasta que los dos lotes ya
      // recontaron y esperan para escribir; cuando la suelta, cada uno escribe lo que contó.
      let ticks: Promise<unknown> = Promise.resolve();
      await db().transaction(async (tx) => {
        await tx.execute(sql`select id from campaign where id = ${id} for no key update`);
        ticks = Promise.all([runCampaignTick(minute(1)), runCampaignTick(minute(1))]);
        await untilLockWaiters(2, ticks);
      });
      await ticks;
      // Un tick posterior no lo arregla: sin pendientes, el lote sale antes de recontar.
      await runCampaignTick(minute(2));

      const campaign = await getCampaign(id);
      return {
        status: campaign?.status,
        sentCount: campaign?.sentCount,
        recipients: await recipientStatuses(id),
        accepted: delivered.overflow.length,
      };
    },
    (seen) => {
      expect(seen).toEqual({ status: "SENT", sentCount: 6, recipients: { SENT: 6 }, accepted: 6 });
    },
  );
});

/** Lo que dura el reclamo de un lote sobre sus destinatarios, en minutos (ADR-115 regla 1). */
const CLAIM_MINUTES = 15;

describe("el lote reclama, envía sin transacción abierta y marca a cada destinatario (ADR-115)", () => {
  it("mientras un correo viaja, el lote no tiene ninguna transacción abierta", async () => {
    await seedRoster(2);
    await scheduleCampaign(2);
    const openWhileSending: number[] = [];
    useTransports({
      overflow: async (_mail, call) => {
        const result = await db().execute<{ n: number }>(sql`
          select count(*)::int as n from pg_stat_activity
          where datname = current_database() and state like 'idle in transaction%'
        `);
        openWhileSending.push(result.rows[0]?.n ?? -1);
        return `ses_${call}`;
      },
    });

    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 2 });

    expect(openWhileSending).toEqual([0, 0]);
  });

  it("lo que un lote interrumpido dejó reclamado no sale antes de que venza el reclamo, y al vencer sale", async () => {
    const roster = await seedRoster(5);
    const id = await scheduleCampaign(5);
    // Como en DT-067: el proveedor acepta el tercer correo y su registro falla, así que el lote se cae.
    useTransports({ overflow: (_mail, call) => (call === 3 ? "ses_\u0000" : `ses_${call}`) });

    expect(await settle(runCampaignTick(minute(0)))).toEqual(expect.any(String));
    expect(await recipientStatuses(id)).toEqual({ SENT: 2, PENDING: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 2 });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(minute(CLAIM_MINUTES - 1))).toEqual({ started: 0, sent: 0 });
    expect(delivered.overflow).toHaveLength(3);

    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(CLAIM_MINUTES),
      sentCount: 5,
      failedCount: 0,
      skippedCount: 0,
    });
    // Solo se repite el correo que salió sin poderse registrar: de ese nadie supo que había salido.
    const copies = roster.map(
      (member) => delivered.overflow.filter((mail) => mail.to === member.email).length,
    );
    expect(copies.sort()).toEqual([1, 1, 1, 1, 2]);
    const records = await db()
      .select({ personId: message.personId })
      .from(message)
      .where(eq(message.campaignId, id));
    expect(records.map((row) => row.personId).sort()).toEqual(
      roster.map((member) => member.id).sort(),
    );
  });

  it("un destinatario reclamado cuyo correo ya quedó registrado se recupera como enviado, sin reenviárselo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(3);
    // El lote se cae entre registrar el primer correo y marcar a su destinatario: mientras el correo
    // viaja la prueba toma la fila de la campaña, sin estorbar el registro del mensaje, y después
    // cancela la sentencia con la que el lote la espera para marcar.
    let letGo = (): void => {};
    const untilLetGo = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    let hold: Promise<void> = Promise.resolve();
    useTransports({
      overflow: async (_mail, call) => {
        if (call === 1) {
          await new Promise<void>((taken) => {
            hold = db().transaction(async (tx) => {
              await tx.execute(sql`select id from campaign where id = ${id} for no key update`);
              taken();
              await untilLetGo;
            });
          });
        }
        return `ses_${call}`;
      },
    });

    const tick = settle(runCampaignTick(minute(0)));
    await untilLockWaiters(1, tick);
    for (const waiter of await lockWaiters()) {
      await db().execute(sql`select pg_cancel_backend(${waiter.pid})`);
    }
    const interruption = await tick;
    letGo();
    await hold;

    expect(interruption).toEqual(expect.any(String));
    expect(await recipientStatuses(id)).toEqual({ PENDING: 3 });
    expect(delivered.overflow).toHaveLength(1);
    const [record] = await db().select().from(message).where(eq(message.campaignId, id));
    const firstTo = delivered.overflow[0]?.to;
    const first = roster.find((member) => member.email === firstTo);
    expect(record).toMatchObject({ personId: first?.id, status: "SENT", sentAt: minute(0) });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 2 });

    expect(addresses(delivered.overflow)).toEqual(emails(roster));
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 3, failedCount: 0 });
    const recovered = (await listRecipients(id)).rows.find((row) => row.personId === first?.id);
    expect(recovered).toMatchObject({ status: "SENT", messageId: record?.id, sentAt: minute(0) });
    expect(await db().select().from(message).where(eq(message.campaignId, id))).toHaveLength(3);
  });
});
