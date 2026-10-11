import { setTimeout as sleep } from "node:timers/promises";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
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
import {
  campaign,
  campaignRecipient,
  message,
  notificationPreference,
} from "@/modules/comms/schema";
import {
  anonymizePersonAs,
  endMembershipAs,
  requestDeletionAs,
  revokeConsentAs,
} from "@/modules/people";
import { segment } from "@/modules/people/schema";
import { setConfig } from "@/modules/system";
import {
  type MailMessage,
  type MailProvider,
  type MailTransport,
  QuotaExceededError,
} from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { withTimeout } from "@/shared/lib/timeout";
import { captureLogs, expectNoEmail, recordsOf } from "../helpers/logs";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Caracterización del lote de una campaña (ADR-038 regla 8) antes de tocarlo (ADR-109, DT-077): lo que
// hoy funciona queda fijado en verde, por el tick que exporta `comms` y con el transporte de pruebas; los
// defectos quedan después, cada uno con su fila del ledger y su ticket, ya corregidos y como pruebas
// corrientes (`fixedDefect`). Al final, lo que el lote hace desde ADR-115.

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
    { personId, ip: null },
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

// El lote por minuto que estas pruebas cambian no se repone a mano: el vaciado de la prueba siguiente
// devuelve la configuración a la foto de la migración (ADR-124 regla 3).
beforeEach(async () => {
  await truncateAll();
  delivered.primary.length = 0;
  delivered.overflow.length = 0;
  useTransports();
});
afterAll(async () => {
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

  // El aviso de un correo que no salió nombra a la persona por su id, como el transaccional: los
  // registros no llevan correos (ADR-114 regla 5, DT-102).
  it("el rechazo de un correo de campaña deja en el registro a la persona por su id y nunca su dirección", async () => {
    const email = "rechazada.q7m3@eafit.edu.co";
    const personId = await seedMember(email, { firstName: "Quimera" });
    const id = await scheduleCampaign(10);
    useTransports({
      overflow: null,
      primary: () => {
        throw new Error("550 buzón inexistente");
      },
    });

    const { result, lines } = await captureLogs(() => runCampaignTick(minute(0)));

    expect(result).toEqual({ started: 1, sent: 0 });
    expect(await getCampaign(id)).toMatchObject({ totalCount: 1, failedCount: 1 });
    expectNoEmail(lines, email);
    const avisos = recordsOf(lines, "correo de campaña no enviado");
    expect(avisos).toEqual([
      expect.objectContaining({ personId, provider: "resend", error: "550 buzón inexistente" }),
    ]);
    expect(avisos[0]).not.toHaveProperty("to");
  });

  it("dos ticks a la vez arrancan la campaña una sola vez y no le mandan dos veces a nadie", async () => {
    const roster = await seedRoster(6);
    const id = await scheduleCampaign(3);

    await warmPool();
    const ticks = await Promise.all([runCampaignTick(minute(0)), runCampaignTick(minute(0))]);

    expect(ticks.reduce((sum, tick) => sum + tick.started, 0)).toBe(1);
    expect(ticks.reduce((sum, tick) => sum + tick.sent, 0)).toBe(6);
    expect((await getCampaign(id))?.totalCount).toBe(6);
    expect(await recipientStatuses(id)).toEqual({ SENT: 6 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
    // Los contadores y el cierre no se afirman acá: con dos lotes a la vez quedan a medias (DT-112).
  });

  it("la cancelación que llega antes que el arranque gana: el tick espera la fila de la campaña, la vuelve a leer cancelada y no arranca ni le manda a nadie", async () => {
    await seedRoster(3);
    const id = await scheduleCampaign(3);

    // La cancelación no toma el consultivo del arranque: lo único que pone al arranque detrás de ella es
    // el `for update` de la fila en `startCampaign`. La prueba retiene la fila hasta que los dos la
    // esperan, la cancelación primero (DT-335).
    const row = await holdLock(sql`select id from campaign where id = ${id} for update`);
    const cancel = cancelCampaignAs(SYSTEM_ACTOR, id);
    await untilLockWaiters(1, cancel);
    const tick = runCampaignTick(minute(0));
    await untilLockWaiters(2, tick);
    const waiting = (await lockWaiters()).length;
    await row.release();
    await cancel;

    expect(waiting).toBe(2);
    // Sin la fila bajo candado el arranque lee «programada», congela la audiencia, espera recién en su
    // escritura y pisa la cancelación: la campaña sale.
    expect(await tick).toEqual({ started: 0, sent: 0 });
    expect(await getCampaign(id)).toMatchObject({ status: "CANCELLED", startedAt: null });
    expect(await recipientStatuses(id)).toEqual({});
    expect(delivered.overflow).toHaveLength(0);
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
 * Un defecto que la caracterización dejó escrito en rojo (`it.fails`) y que ya se corrigió: el mismo
 * escenario y la misma afirmación, ahora como prueba corriente. `observe` arma el escenario y devuelve
 * lo que pasó; `expectFixed` afirma lo que tiene que pasar. El escenario tiene que armarse y terminar.
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

/**
 * Una transacción de la prueba que toma un candado con `lock` y lo retiene hasta `release`: quien lo
 * necesite se queda quieto justo donde lo pide, y la prueba decide qué pasa mientras tanto.
 */
async function holdLock(lock: SQL): Promise<{ release: () => Promise<void> }> {
  let letGo = (): void => {};
  const untilLetGo = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  let held: Promise<void> = Promise.resolve();
  await new Promise<void>((taken, failed) => {
    held = db().transaction(async (tx) => {
      await tx.execute(lock);
      taken();
      await untilLetGo;
    });
    held.catch(failed);
  });
  return {
    release: async () => {
      letGo();
      await held;
    },
  };
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

  // DT-068, corregido en #145 (ADR-115 reglas 3 y 4): cancelar tomaba la campaña y esperaba al lote,
  // que la necesitaba para registrar su mensaje.
  fixedDefect(
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

  // DT-066, corregido en #146 (ADR-115 regla 6): una campaña trataba el rechazo por cuota como uno
  // definitivo y dejaba fallido para siempre a quien le faltaba el correo.
  fixedDefect(
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

// El cupo es el de Resend (`RESEND_DAILY_LIMIT`) y, mientras nadie fije el margen, un tercio queda
// reservado para los correos transaccionales.
const DAILY_LIMIT = Number(process.env.RESEND_DAILY_LIMIT ?? 95);
const CAMPAIGN_CEILING = DAILY_LIMIT - Math.ceil(DAILY_LIMIT / 3);

// Un día fijo y lejano para contar el cupo: son las 22:00 del 9 de marzo en Colombia y ya es 10 en UTC,
// que es el día por el que cuenta el proveedor (ADR-121 regla 5).
const NIGHT = new Date("2031-03-10T03:00:00.000Z");
/** La mañana del 9 en Colombia: para el proveedor es su día anterior. */
const MORNING = new Date("2031-03-09T12:00:00.000Z");
/** Más temprano en ese mismo día del proveedor: las 19:30 del 9 en Colombia. */
const EARLIER = new Date("2031-03-10T00:30:00.000Z");
const night = (minutes: number): Date => new Date(NIGHT.getTime() + minutes * 60_000);
/** Los minutos que le faltan a `NIGHT` para la medianoche del proveedor: las 19:00 del 10 en Colombia. */
const TO_MIDNIGHT = 21 * 60;
/** Los que le faltan para la medianoche de Colombia, que al cupo ya no le dice nada. */
const TO_LOCAL_MIDNIGHT = 120;

/** Correos que ya salieron a esa hora, sin pasar por el transporte: lo que cuenta el cupo. */
async function seedSent(
  personId: string,
  kind: "TRANSACTIONAL" | "CAMPAIGN",
  amount: number,
  sentAt: Date,
  provider: MailProvider = "resend",
): Promise<void> {
  if (amount === 0) return;
  await db()
    .insert(message)
    .values(
      Array.from({ length: amount }, (_, index) => ({
        personId,
        channel: "EMAIL" as const,
        kind,
        subject: `Previo ${index}`,
        status: "SENT" as const,
        provider,
        sentAt,
      })),
    );
}

function setReserve(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.transactionalReserve", value));
}

/** Una campaña a todas las personas de la prueba, programada para `NIGHT`, con ese lote por minuto. */
async function scheduleForNight(perMinute: number): Promise<string> {
  await setPerMinute(perMinute);
  return scheduleNew(await seedParts(), "Novedades", NIGHT);
}

describe("el cupo del día y el margen para los correos transaccionales (ADR-115 reglas 5 y 6)", () => {
  it("con el cupo de campañas casi lleno, el lote manda lo que cabe contando lo transaccional y lo de campañas que salió en el día del proveedor, y lo demás sigue en su otro día", async () => {
    const roster = await seedRoster(5);
    const [ana] = roster;
    if (!ana) throw new Error("seed roster");
    const id = await scheduleForNight(10);
    // En el día del proveedor ya salieron todos los que caben menos dos, entre transaccionales y de
    // campaña: su medianoche en punto, que son las 19:00 de Colombia, ya es de hoy.
    await seedSent(ana.id, "TRANSACTIONAL", CAMPAIGN_CEILING - 5, EARLIER);
    await seedSent(ana.id, "CAMPAIGN", 3, new Date("2031-03-10T00:00:00.000Z"));
    // No cuentan: lo de su día anterior, por un segundo o desde la mañana, aunque en Colombia sea el
    // mismo día; ni lo que salió por otro proveedor.
    await seedSent(ana.id, "TRANSACTIONAL", 40, new Date("2031-03-09T23:59:59.000Z"));
    await seedSent(ana.id, "TRANSACTIONAL", 40, MORNING);
    await seedSent(ana.id, "TRANSACTIONAL", 40, EARLIER, "ses");
    useTransports({ overflow: null });

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 2 });

    expect(await recipientStatuses(id)).toEqual({ SENT: 2, PENDING: 3 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      sentCount: 2,
      failedCount: 0,
      skippedCount: 0,
    });
    const waiting = (await listRecipients(id)).rows.filter((row) => row.status === "PENDING");
    expect(waiting.map((row) => [row.claimedAt, row.messageId])).toEqual(
      waiting.map(() => [null, null]),
    );

    // Lo que queda del día no sale nada más, tampoco al pasar la medianoche de Colombia.
    expect(await runCampaignTick(night(1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(night(TO_LOCAL_MIDNIGHT + 5))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(night(TO_MIDNIGHT - 1))).toEqual({ started: 0, sent: 0 });
    expect(delivered.primary).toHaveLength(2);

    // A la medianoche del proveedor el cupo es otro: la campaña sigue donde quedó y termina.
    expect(await runCampaignTick(night(TO_MIDNIGHT))).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: night(TO_MIDNIGHT),
      sentCount: 5,
      failedCount: 0,
    });
    expect(addresses(delivered.primary)).toEqual(emails(roster));
  });

  it("el margen reservado se puede cambiar, y el lote siguiente ya cuenta con el nuevo", async () => {
    await seedRoster(4);
    const id = await scheduleForNight(10);
    useTransports({ overflow: null });

    await setReserve(DAILY_LIMIT - 1);
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    // Con tres correos del cupo para campañas, y uno ya gastado, caben dos más.
    await setReserve(DAILY_LIMIT - 3);
    expect(await runCampaignTick(night(1))).toEqual({ started: 0, sent: 2 });
    expect(await recipientStatuses(id)).toEqual({ SENT: 3, PENDING: 1 });

    // Un margen igual o mayor que el cupo no deja salir ninguna campaña.
    await setReserve(DAILY_LIMIT + 10);
    expect(await runCampaignTick(night(2))).toEqual({ started: 0, sent: 0 });
    expect(delivered.primary).toHaveLength(3);
  });

  it("cuando las campañas salen por el desbordamiento, el cupo del primario no las frena", async () => {
    const roster = await seedRoster(3);
    const [ana] = roster;
    if (!ana) throw new Error("seed roster");
    const id = await scheduleForNight(10);
    await seedSent(ana.id, "TRANSACTIONAL", DAILY_LIMIT, EARLIER);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 3 });

    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 3 });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
  });

  it("un rechazo por cuota del proveedor deja al destinatario pendiente y sin registro, y corta los lotes hasta el otro día aunque el proveedor ya acepte", async () => {
    const roster = await seedRoster(4);
    const id = await scheduleForNight(10);
    let quota = 1;
    let calls = 0;
    useTransports({
      overflow: null,
      primary: (_mail, call) => {
        calls = call;
        if (quota === 0) {
          throw new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy");
        }
        quota -= 1;
        return `resend_${call}`;
      },
    });

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    // Uno salió, al segundo lo rechazaron por cuota y a los otros dos ya no se les intentó.
    expect(calls).toBe(2);
    expect(await recipientStatuses(id)).toEqual({ SENT: 1, PENDING: 3 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      sentCount: 1,
      failedCount: 0,
    });
    const waiting = (await listRecipients(id)).rows.filter((row) => row.status === "PENDING");
    expect(waiting.map((row) => [row.claimedAt, row.messageId])).toEqual(
      waiting.map(() => [null, null]),
    );
    expect(await db().select().from(message).where(eq(message.status, "FAILED"))).toEqual([]);

    // El proveedor ya aceptaría, pero hoy no se le vuelve a preguntar.
    quota = 10;
    expect(await runCampaignTick(night(1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(night(TO_MIDNIGHT - 1))).toEqual({ started: 0, sent: 0 });
    expect(calls).toBe(2);

    expect(await runCampaignTick(night(TO_MIDNIGHT))).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
    expect(addresses(delivered.primary)).toEqual(emails(roster));
  });

  it("dos lotes a la vez no gastan más de lo que cabe: lo que uno reclamó ya cuenta para el otro", async () => {
    const roster = await seedRoster(6);
    const [ana] = roster;
    if (!ana) throw new Error("seed roster");
    const id = await scheduleForNight(3);
    await seedSent(ana.id, "TRANSACTIONAL", CAMPAIGN_CEILING - 2, EARLIER);
    // El proveedor no responde hasta que los dos lotes reclamaron lo suyo: ninguno ve todavía un
    // correo enviado por el otro, solo lo que el otro reclamó.
    let waiting = 0;
    let finished = 0;
    let release = (): void => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    useTransports({
      overflow: null,
      primary: async (_mail, call) => {
        waiting += 1;
        await released;
        return `resend_${call}`;
      },
    });

    const ticks = [runCampaignTick(NIGHT), runCampaignTick(NIGHT)].map((tick) =>
      tick.finally(() => {
        finished += 1;
      }),
    );
    for (let attempt = 0; attempt < 400 && waiting + finished < 2; attempt += 1) {
      await sleep(25);
    }
    release();
    const results = await Promise.all(ticks);

    expect(results.reduce((sum, tick) => sum + tick.sent, 0)).toBe(2);
    expect(delivered.primary).toHaveLength(2);
    expect(await recipientStatuses(id)).toEqual({ SENT: 2, PENDING: 4 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      sentCount: 2,
      failedCount: 0,
    });
  });

  it("dos lotes que reclaman a la vez en campañas distintas cuentan el cupo uno después del otro", async () => {
    await seedRoster(4);
    const parts = await seedParts();
    await setPerMinute(2);
    useTransports({ overflow: null });
    // La segunda campaña arranca sin enviar: con todo el cupo reservado no cabe ningún correo.
    const second = await scheduleNew(parts, "Segunda", NIGHT);
    await setReserve(DAILY_LIMIT);
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });
    // Desde acá caben dos correos de campaña en el día.
    await setReserve(DAILY_LIMIT - 2);

    // Un lote ya contó el cupo y va a reclamar a dos de la segunda: queda quieto ahí, con su
    // transacción abierta, porque la prueba retiene a esos destinatarios.
    const recipients = await holdLock(
      sql`select id from campaign_recipient where campaign_id = ${second} for update`,
    );
    const late = runCampaignTick(night(1));
    await untilLockWaiters(1, late);

    // Otro lote llega a una campaña distinta, y la fila de la segunda no lo detiene: lo único que los
    // pone en fila es el candado del cupo. Para que visite primero a la suya, esa campaña tiene que
    // haber arrancado antes: por eso este tick trae un reloj anterior.
    const first = await scheduleNew(parts, "Primera", night(-2));
    const early = runCampaignTick(night(-1));
    await untilLockWaiters(2, early);
    await recipients.release();
    const results = await Promise.all([late, early]);

    expect(results.reduce((sum, tick) => sum + tick.sent, 0)).toBe(2);
    expect(delivered.primary).toHaveLength(2);
    expect(await recipientStatuses(second)).toEqual({ SENT: 2, PENDING: 2 });
    expect(await recipientStatuses(first)).toEqual({ PENDING: 4 });
  });
});

/** Lo que dura el reclamo de un lote sobre sus destinatarios, en minutos (ADR-115 regla 1). */
const CLAIM_MINUTES = 15;

/** Una compuerta del transporte: `hold` avisa que un correo llegó y lo retiene hasta `release`. */
interface MailGate {
  reached: Promise<void>;
  hold: () => Promise<void>;
  release: () => void;
}

function mailGate(): MailGate {
  let reach = (): void => {};
  let release = (): void => {};
  const reached = new Promise<void>((resolve) => {
    reach = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    reached,
    hold: () => {
      reach();
      return released;
    },
    release: () => release(),
  };
}

/** Espera a que el lote deje un correo retenido en la compuerta; si termina antes, no hay escenario. */
function untilHeld(gate: MailGate, tick: Promise<unknown>): Promise<void> {
  return Promise.race([
    gate.reached,
    tick.then(() => {
      throw new Error("El lote terminó sin dejar un correo en vuelo");
    }),
  ]);
}

/**
 * Un lote que se cae entre registrar su primer correo y marcar a su destinatario. `accept` va de
 * transporte: mientras ese correo viaja toma la fila de la campaña, sin estorbar el registro del
 * mensaje, y después hace con cada correo lo que diga `provider`. `run` corre el lote del minuto 0,
 * cancela la sentencia con la que el lote espera esa fila para marcar y devuelve el motivo de la caída,
 * o `null` si el lote no se cayó.
 */
function interruptionBeforeMarking(
  id: string,
  provider: (call: number) => string,
): { accept: Accept; run: () => Promise<string | null> } {
  let letGo = (): void => {};
  const untilLetGo = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  let hold: Promise<void> = Promise.resolve();
  return {
    accept: async (_mail, call) => {
      if (call === 1) {
        await new Promise<void>((taken) => {
          hold = db().transaction(async (tx) => {
            await tx.execute(sql`select id from campaign where id = ${id} for no key update`);
            taken();
            await untilLetGo;
          });
        });
      }
      return provider(call);
    },
    run: async () => {
      const tick = settle(runCampaignTick(minute(0)));
      await untilLockWaiters(1, tick);
      for (const waiter of await lockWaiters()) {
        await db().execute(sql`select pg_cancel_backend(${waiter.pid})`);
      }
      const interruption = await tick;
      letGo();
      await hold;
      return interruption;
    },
  };
}

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

  it("cuando no caben todos, el relevo de un lote caído retoma primero a los que ese lote dejó reclamados y solo con el lugar que le sobra toma a quien nadie había reclamado", async () => {
    const roster = await seedRoster(5);
    const id = await scheduleCampaign(3);
    // Como en DT-067: el proveedor acepta el segundo correo y su registro falla, así que el lote se cae
    // con un enviado y dos reclamados sin marcar. A los otros dos no los alcanzó a reclamar nadie.
    useTransports({ overflow: (_mail, call) => (call === 2 ? "ses_\u0000" : `ses_${call}`) });
    expect(await settle(runCampaignTick(minute(0)))).toEqual(expect.any(String));
    const left = (await listRecipients(id)).rows.filter((row) => row.status === "PENDING");
    const membersOf = (rows: typeof left): Member[] =>
      roster.filter((member) => rows.some((row) => row.personId === member.id));
    const lapsed = membersOf(left.filter((row) => row.claimedAt !== null));
    const unclaimed = membersOf(left.filter((row) => row.claimedAt === null));
    expect([lapsed.length, unclaimed.length]).toEqual([2, 2]);
    const before = delivered.overflow.length;

    // Al vencer el reclamo hay cuatro libres y en el lote caben tres.
    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 3 });

    // Les llegó a los dos que el lote caído había dejado reclamados y a uno solo de los otros.
    const reached = delivered.overflow.slice(before).map((mail) => mail.to);
    const reachedOf = (members: Member[]): string[] =>
      emails(members.filter((member) => reached.includes(member.email)));
    expect(reachedOf(lapsed)).toEqual(emails(lapsed));
    expect(reachedOf(unclaimed)).toHaveLength(1);
    const after = (await listRecipients(id)).rows;
    const stateOf = (members: Member[]) =>
      members
        .map((member) => after.find((row) => row.personId === member.id))
        .map((row) => [row?.status, row?.sentAt ?? null]);
    expect(stateOf(lapsed)).toEqual(lapsed.map(() => ["SENT", minute(CLAIM_MINUTES)]));
    expect(stateOf(unclaimed).sort()).toEqual([
      ["PENDING", null],
      ["SENT", minute(CLAIM_MINUTES)],
    ]);
    // El que no cupo sigue libre para el lote siguiente: pendiente y sin reclamo.
    const waiting = after.filter((row) => row.status === "PENDING");
    expect(waiting.map((row) => row.claimedAt)).toEqual([null]);
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 4 });
  });

  it("un destinatario reclamado cuyo correo ya quedó registrado se recupera como enviado, sin reenviárselo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(3);
    const interrupted = interruptionBeforeMarking(id, (call) => `ses_${call}`);
    useTransports({ overflow: interrupted.accept });

    const interruption = await interrupted.run();

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

  it("un destinatario reclamado cuyo correo quedó registrado como rechazado se recupera como fallido, sin volver a intentarlo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(3);
    // El proveedor rechaza el primer correo y aceptaría cualquier otro, también un reintento de ese.
    const interrupted = interruptionBeforeMarking(id, (call) => {
      if (call === 1) {
        throw new Error("550 buzón inexistente");
      }
      return `ses_${call}`;
    });
    useTransports({ overflow: interrupted.accept });

    const interruption = await interrupted.run();

    expect(interruption).toEqual(expect.any(String));
    expect(await recipientStatuses(id)).toEqual({ PENDING: 3 });
    expect(delivered.overflow).toEqual([]);
    const [record] = await db().select().from(message).where(eq(message.campaignId, id));
    expect(record).toMatchObject({
      status: "FAILED",
      error: "550 buzón inexistente",
      sentAt: null,
    });

    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 2 });

    const rejected = roster.find((member) => member.id === record?.personId);
    expect(addresses(delivered.overflow)).toEqual(
      emails(roster.filter((member) => member !== rejected)),
    );
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2, failedCount: 1 });
    const recovered = (await listRecipients(id)).rows.find((row) => row.personId === rejected?.id);
    expect(recovered).toMatchObject({ status: "FAILED", messageId: record?.id, sentAt: null });
    expect(await db().select().from(message).where(eq(message.campaignId, id))).toHaveLength(3);
  });

  it("un lote que sigue vivo al vencer su reclamo no manda nada de lo que otro lote ya reclamó: solo se repite el correo que tenía en vuelo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(3);
    // El poller deja de esperar a un lote lento, pero no lo detiene (ADR-079). Acá el lote viejo queda
    // con su primer correo en vuelo y el nuevo, que al vencer el reclamo los reclama a los tres, con su
    // segundo: los dos reciben a sus destinatarios en el mismo orden.
    const oldLot = mailGate();
    const newLot = mailGate();
    useTransports({
      overflow: async (_mail, call) => {
        if (call === 1) {
          await oldLot.hold();
        }
        if (call === 3) {
          await newLot.hold();
        }
        return `ses_${call}`;
      },
    });

    const oldTick = runCampaignTick(minute(0));
    await untilHeld(oldLot, oldTick);
    const newTick = runCampaignTick(minute(CLAIM_MINUTES));
    await untilHeld(newLot, newTick);
    // El lote nuevo ya le mandó y le marcó a uno; a los otros dos los tiene reclamados y pendientes.
    expect(delivered.overflow).toHaveLength(1);
    expect(await recipientStatuses(id)).toEqual({ SENT: 1, PENDING: 2 });

    oldLot.release();
    expect(await oldTick).toEqual({ started: 1, sent: 0 });
    // Del lote viejo solo llegó el correo que ya iba en vuelo, para quien el nuevo ya había atendido.
    expect(delivered.overflow).toHaveLength(2);
    const repeatedTo = delivered.overflow[0]?.to;
    expect(delivered.overflow[1]?.to).toBe(repeatedTo);

    newLot.release();
    expect(await newTick).toEqual({ started: 0, sent: 3 });

    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(CLAIM_MINUTES),
      sentCount: 3,
      failedCount: 0,
      skippedCount: 0,
    });
    const copies = roster.map(
      (member) => delivered.overflow.filter((mail) => mail.to === member.email).length,
    );
    expect(copies.sort()).toEqual([1, 1, 2]);
    // Del correo repetido queda un solo registro, el del lote que lo anotó primero, y con ese quedó
    // marcado su destinatario.
    const records = await db().select().from(message).where(eq(message.campaignId, id));
    expect(records).toHaveLength(3);
    const repeated = (await listRecipients(id)).rows.find((row) => row.email === repeatedTo);
    const record = records.find((row) => row.personId === repeated?.personId);
    expect(repeated).toMatchObject({
      status: "SENT",
      messageId: record?.id,
      sentAt: minute(CLAIM_MINUTES),
    });
  });
});

describe("el cupo cuando un lote se cae, sigue vivo o cruza la medianoche (ADR-115 reglas 5 y 6)", () => {
  it("un lote que se cae conserva su reserva: los siguientes solo mandan lo que cabe descontándola, y al vencer su reclamo salen sus destinatarios", async () => {
    const roster = await seedRoster(5);
    const id = await scheduleForNight(2);
    await setReserve(DAILY_LIMIT - 3);
    // El proveedor acepta el primer correo y su registro falla, como en DT-067: el lote se cae con sus
    // dos destinatarios reclamados y sin ningún correo anotado.
    useTransports({
      overflow: null,
      primary: (_mail, call) => (call === 1 ? "resend_\u0000" : `resend_${call}`),
    });
    expect(await settle(runCampaignTick(NIGHT))).toEqual(expect.any(String));
    expect(await recipientStatuses(id)).toEqual({ PENDING: 5 });

    // Caben tres en el día y dos están reservados: sale uno, y después nada hasta que vence el reclamo.
    const sent: number[] = [];
    for (const at of [1, 2, CLAIM_MINUTES - 1, CLAIM_MINUTES, CLAIM_MINUTES + 1]) {
      sent.push((await runCampaignTick(night(at))).sent);
    }
    expect(sent).toEqual([1, 0, 0, 2, 0]);
    expect(await recipientStatuses(id)).toEqual({ SENT: 3, PENDING: 2 });

    // Al otro día salen los dos que no cabían.
    expect(await runCampaignTick(night(TO_MIDNIGHT))).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 5, failedCount: 0 });
    expect([...new Set(addresses(delivered.primary))]).toEqual(emails(roster));
  });

  it("un lote que sigue vivo con el reclamo vencido conserva su reserva: el relevo retoma primero a sus destinatarios y entre los dos no pasan del tope", async () => {
    await seedRoster(4);
    const parts = await seedParts();
    await setPerMinute(4);
    await setReserve(DAILY_LIMIT - 4);
    const gate = mailGate();
    useTransports({
      overflow: null,
      primary: async (_mail, call) => {
        if (call === 1) {
          await gate.hold();
        }
        return `resend_${call}`;
      },
    });
    // El lote viejo reclama a los cuatro de la segunda, que son todo el cupo del día, y queda con el
    // primer correo en vuelo.
    const second = await scheduleNew(parts, "Segunda", night(5));
    const old = runCampaignTick(night(5));
    await untilHeld(gate, old);
    // Otra campaña queda antes en la fila, porque arranca con un reloj anterior. Mientras el reclamo
    // del lote viejo siga vigente no le cabe nada.
    const first = await scheduleNew(parts, "Primera", NIGHT);
    expect(await runCampaignTick(night(1))).toEqual({ started: 1, sent: 0 });

    // A los 15 minutos el reclamo venció y el lote viejo sigue ahí, con lo suyo sin enviar.
    const relief = await runCampaignTick(night(5 + CLAIM_MINUTES));
    gate.release();
    const late = await old;

    const accepted = await db()
      .select({ id: message.id })
      .from(message)
      .where(and(eq(message.provider, "resend"), eq(message.status, "SENT")));
    expect(accepted).toHaveLength(4);
    // El relevo no le dio ese cupo a la primera: retomó a los de la segunda. Al lote viejo ya no le
    // quedaba nada suyo, y lo único que se repite es el correo que tenía en vuelo (DT-113).
    expect([relief, late]).toEqual([
      { started: 0, sent: 4 },
      { started: 1, sent: 0 },
    ]);
    expect(await recipientStatuses(second)).toEqual({ SENT: 4 });
    expect(await recipientStatuses(first)).toEqual({ PENDING: 4 });
    expect(delivered.primary).toHaveLength(5);
  });

  it("un lote de ayer que recibe tarde su rechazo por cuota no devuelve el corte al día anterior", async () => {
    await seedRoster(6);
    const id = await scheduleForNight(2);
    const gate = mailGate();
    let calls = 0;
    useTransports({
      overflow: null,
      primary: async (_mail, call) => {
        calls = Math.max(calls, call);
        if (call === 1) {
          await gate.hold();
        }
        throw new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy");
      },
    });
    // Las 23:59 del proveedor: el lote queda con su primer correo en vuelo.
    const yesterday = runCampaignTick(night(TO_MIDNIGHT - 1));
    await untilHeld(gate, yesterday);
    // Las 00:01: otro lote recibe el rechazo y deja el corte de hoy; el de las 00:02 ya no pregunta.
    expect(await runCampaignTick(night(TO_MIDNIGHT + 1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(night(TO_MIDNIGHT + 2))).toEqual({ started: 0, sent: 0 });
    expect(calls).toBe(2);

    // Al lote de las 23:59 le llega su rechazo. Su hora es de ayer y no pisa el corte de hoy.
    gate.release();
    expect(await yesterday).toEqual({ started: 1, sent: 0 });
    expect(await runCampaignTick(night(TO_MIDNIGHT + 3))).toEqual({ started: 0, sent: 0 });
    expect(calls).toBe(2);
    expect(await recipientStatuses(id)).toEqual({ PENDING: 6 });
  });
});

describe("cancelar con un lote en curso (ADR-115 regla 4)", () => {
  it("cancelar con un correo en vuelo: ese correo cuenta como enviado y el lote no manda lo que le quedaba", async () => {
    await seedRoster(4);
    const id = await scheduleCampaign(3);
    let reached = (): void => {};
    const inFlight = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    useTransports({
      overflow: async (_mail, call) => {
        if (call === 1) {
          reached();
          await gate;
        }
        return `ses_${call}`;
      },
    });

    const tick = runCampaignTick(minute(0));
    await Promise.race([
      inFlight,
      tick.then(() => {
        throw new Error("El lote terminó sin llegar al transporte");
      }),
    ]);
    await cancelCampaignAs(SYSTEM_ACTOR, id);
    // Todo lo pendiente quedó omitido, también los tres que el lote tenía reclamados.
    expect(await recipientStatuses(id)).toEqual({ SKIPPED: 4 });
    const cancelledAt = (await getCampaign(id))?.finishedAt;
    release();

    expect(await tick).toEqual({ started: 1, sent: 1 });
    expect(delivered.overflow).toHaveLength(1);
    expect(await getCampaign(id)).toMatchObject({
      status: "CANCELLED",
      finishedAt: cancelledAt,
      totalCount: 4,
      sentCount: 1,
      failedCount: 0,
      skippedCount: 3,
    });
    const { rows } = await listRecipients(id);
    const flown = rows.find((row) => row.email === delivered.overflow[0]?.to);
    expect(flown).toMatchObject({
      status: "SENT",
      skipReason: null,
      messageId: expect.any(String),
      sentAt: minute(0),
    });
    expect(rows.filter((row) => row.skipReason === "CANCELLED")).toHaveLength(3);
  });

  it("cancelar con un correo en vuelo que el proveedor rechaza: su destinatario queda fallido con su mensaje y la cancelación no cambia", async () => {
    await seedRoster(3);
    const id = await scheduleCampaign(3);
    const gate = mailGate();
    useTransports({
      overflow: async (_mail, call) => {
        if (call === 1) {
          await gate.hold();
          throw new Error("550 el buzón no existe");
        }
        return `ses_${call}`;
      },
    });

    const tick = runCampaignTick(minute(0));
    await untilHeld(gate, tick);
    await cancelCampaignAs(SYSTEM_ACTOR, id);
    expect(await recipientStatuses(id)).toEqual({ SKIPPED: 3 });
    const cancelledAt = (await getCampaign(id))?.finishedAt;
    gate.release();

    expect(await tick).toEqual({ started: 1, sent: 0 });
    expect(delivered.overflow).toHaveLength(0);
    expect(await getCampaign(id)).toMatchObject({
      status: "CANCELLED",
      finishedAt: cancelledAt,
      totalCount: 3,
      sentCount: 0,
      failedCount: 1,
      skippedCount: 2,
    });
    const { rows } = await listRecipients(id);
    const [record] = await db().select().from(message).where(eq(message.campaignId, id));
    expect(record).toMatchObject({ status: "FAILED", error: "550 el buzón no existe" });
    expect(rows.find((row) => row.status === "FAILED")).toMatchObject({
      personId: record?.personId,
      skipReason: null,
      messageId: record?.id,
      sentAt: null,
    });
    expect(rows.filter((row) => row.skipReason === "CANCELLED")).toHaveLength(2);
  });

  it("cancelar y correr el lote a la vez, una y otra vez, no falla y deja los contadores en lo que recibió el transporte", async () => {
    await seedRoster(6);
    await setPerMinute(2);
    const parts = await seedParts();
    // Qué pasa cuando un correo llega al proveedor lo decide cada ronda.
    let onMail = (): void => {};
    useTransports({
      overflow: (_mail, call) => {
        onMail();
        return `ses_${call}`;
      },
    });

    for (let round = 0; round < 9; round += 1) {
      onMail = () => {};
      const startsAt = minute(round * 10);
      const id = await scheduleNew(parts, `Ronda ${round}`, startsAt);
      expect(await runCampaignTick(startsAt)).toEqual({ started: 1, sent: 2 });
      const before = delivered.overflow.length;

      // La cancelación arranca junto con el lote (0) o con su primer o su segundo correo en vuelo, y
      // nadie la espera: corre a la par de lo que al lote le falte.
      const cancelOn = round % 3;
      let cancel: Promise<string | null> | null = null;
      const startCancel = (): Promise<string | null> => {
        cancel ??= settle(cancelCampaignAs(SYSTEM_ACTOR, id));
        return cancel;
      };
      let mails = 0;
      onMail = () => {
        mails += 1;
        if (mails === cancelOn) {
          void startCancel();
        }
      };
      const tick = settle(runCampaignTick(minute(round * 10 + 1)));
      if (cancelOn === 0) {
        void startCancel();
      }
      const errors = { tick: await tick, cancel: await startCancel() };

      const accepted = 2 + delivered.overflow.length - before;
      expect(errors).toEqual({ tick: null, cancel: null });
      expect(await getCampaign(id)).toMatchObject({
        status: "CANCELLED",
        totalCount: 6,
        sentCount: accepted,
        failedCount: 0,
        skippedCount: 6 - accepted,
      });
      expect(await recipientStatuses(id)).toEqual({ SENT: accepted, SKIPPED: 6 - accepted });
    }
  });
});

/** Anonimiza a pedido, como lo hace GH: primero la solicitud de la persona y después el comando. */
async function anonymize(personId: string): Promise<void> {
  await requestDeletionAs({ personId, ip: null });
  await anonymizePersonAs(SYSTEM_ACTOR, personId);
}

/** Quienes siguen pendientes en la campaña, en el orden de la prueba. */
async function waitingMembers(campaignId: string, roster: Member[]): Promise<Member[]> {
  const pending = new Set(
    (await listRecipients(campaignId)).rows
      .filter((row) => row.status === "PENDING")
      .map((row) => row.personId),
  );
  return roster.filter((member) => pending.has(member.id));
}

async function recipientOf(campaignId: string, personId: string) {
  return (await listRecipients(campaignId)).rows.find((row) => row.personId === personId);
}

describe("antes de cada envío el lote vuelve a mirar a la persona (ADR-115 regla 7)", () => {
  it("a quien se anonimizó después de congelar la audiencia lo omite con su motivo y no le escribe", async () => {
    const roster = await seedRoster(4);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const [gone] = await waitingMembers(id, roster);
    if (!gone) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");

    await anonymize(gone.id);

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 1 });
    expect(await recipientOf(id, gone.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "ANONYMIZED",
      messageId: null,
      sentAt: null,
    });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      totalCount: 4,
      sentCount: 3,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(addresses(delivered.overflow)).toEqual(
      emails(roster.filter((member) => member !== gone)),
    );
  });

  it("a quien salió sin dejar consentimiento lo omite por eso y no le escribe", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const [left] = await waitingMembers(id, roster);
    if (!left) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");

    await endMembershipAs(SYSTEM_ACTOR, left.id, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });
    expect(await recipientOf(id, left.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "NO_CONSENT",
      messageId: null,
      sentAt: null,
    });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      sentCount: 2,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(delivered.overflow.map((mail) => mail.to)).not.toContain(left.email);
  });

  // Esta conducta NO está decidida (decisión abierta 14, DT-116): #146 y la historia 9 de su spec dicen
  // que quien salió no recibe la campaña en curso, sin excepción. La prueba fija lo que el lote hace
  // mientras tanto, que para esta persona es lo mismo que hacía antes de ADR-115.
  // Si se decide que no reciba, esta es la prueba que se reescribe.
  it("mientras no se decida otra cosa, a quien salió pidiendo seguir en contacto le sigue llegando la campaña en curso, a su correo personal", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const [keeps] = await waitingMembers(id, roster);
    if (!keeps) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");

    await endMembershipAs(SYSTEM_ACTOR, keeps.id, {
      endReason: "GRADUATION",
      memorialConsent: false,
      contactConsent: true,
      personalEmail: "egresada@example.com",
    });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 1 });
    expect(await recipientOf(id, keeps.id)).toMatchObject({ status: "SENT", skipReason: null });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      sentCount: 3,
      failedCount: 0,
      skippedCount: 0,
    });
    const received = delivered.overflow.map((mail) => mail.to);
    expect(received).toContain("egresada@example.com");
    expect(received).not.toContain(keeps.email);
  });

  it("a quien omite no le vuelve a crear las preferencias ni el enlace de baja que se le borraron al anonimizarse o al salir", async () => {
    const roster = await seedRoster(4);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const [gone, left] = await waitingMembers(id, roster);
    if (!gone || !left) throw new Error("Tras el primer lote tenían que quedar dos pendientes");
    await anonymize(gone.id);
    await endMembershipAs(SYSTEM_ACTOR, left.id, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    // Los handlers de comms ya corrieron y les borraron las preferencias (ADR-030, ADR-038 regla 5).
    await drainOutbox();

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });

    expect(await recipientStatuses(id)).toEqual({ SENT: 2, SKIPPED: 2 });
    const kept = await db()
      .select({ personId: notificationPreference.personId })
      .from(notificationPreference)
      .where(inArray(notificationPreference.personId, [gone.id, left.id]));
    expect(kept).toEqual([]);
  });

  // Esta conducta NO está decidida (decisión abierta 17, DT-126): la historia 8 de la spec #143 habla
  // de quien «pidió el borrado», y el criterio de #146 y la regla 7, de quien ya fue anonimizado. Entre
  // el pedido y la anonimización, que hace GH en días hábiles, la persona sigue siendo miembro.
  // Si se decide que no reciba, esta es la prueba que se reescribe.
  it("mientras no se decida otra cosa, a quien pidió el borrado de sus datos y todavía no fue anonimizado le sigue llegando la campaña en curso", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(2);
    await runCampaignTick(minute(0));
    const [asked] = await waitingMembers(id, roster);
    if (!asked) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");

    await requestDeletionAs({ personId: asked.id, ip: null });

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 1 });
    expect(await recipientOf(id, asked.id)).toMatchObject({ status: "SENT", skipReason: null });
    expect(delivered.overflow.map((mail) => mail.to)).toContain(asked.email);
  });

  it("a quien salió dejando consentimiento y lo revoca mientras el lote le escribe a otro no le llega: el consentimiento se lee justo antes de su correo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(1);
    await runCampaignTick(minute(0));
    const alumni = await waitingMembers(id, roster);
    const personal = (member: Member): string =>
      member.email.replace("@eafit.edu.co", "@example.com");
    for (const member of alumni) {
      await endMembershipAs(SYSTEM_ACTOR, member.id, {
        endReason: "GRADUATION",
        memorialConsent: false,
        contactConsent: true,
        personalEmail: personal(member),
      });
    }
    await setPerMinute(2);
    const gate = mailGate();
    let firstTo = "";
    useTransports({
      overflow: async (mail, call) => {
        if (call === 1) {
          firstTo = mail.to;
          await gate.hold();
        }
        return `ses_${call}`;
      },
    });

    const tick = runCampaignTick(minute(1));
    await untilHeld(gate, tick);
    expect(alumni.map(personal)).toContain(firstTo);
    const revokes = alumni.find((member) => personal(member) !== firstTo);
    if (!revokes) throw new Error("Tras el primer lote tenían que quedar dos pendientes");
    await revokeConsentAs(SYSTEM_ACTOR, revokes.id, "COMMUNICATIONS");
    gate.release();

    expect(await tick).toEqual({ started: 0, sent: 1 });
    expect(await recipientOf(id, revokes.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "NO_CONSENT",
      messageId: null,
    });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2, skippedCount: 1 });
    const received = delivered.overflow.map((mail) => mail.to);
    expect(received).not.toContain(personal(revokes));
    expect(received).not.toContain(revokes.email);
  });

  it("a quien se anonimiza mientras el lote le escribe a otro tampoco le llega: el lote lo mira justo antes de su correo", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(3);
    const gate = mailGate();
    let firstTo = "";
    useTransports({
      overflow: async (mail, call) => {
        if (call === 1) {
          firstTo = mail.to;
          await gate.hold();
        }
        return `ses_${call}`;
      },
    });

    const tick = runCampaignTick(minute(0));
    await untilHeld(gate, tick);
    const gone = roster.find((member) => member.email !== firstTo);
    if (!gone) throw new Error("seed roster");
    await anonymize(gone.id);
    gate.release();

    expect(await tick).toEqual({ started: 1, sent: 2 });
    expect(await recipientOf(id, gone.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "ANONYMIZED",
    });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2, skippedCount: 1 });
    expect(addresses(delivered.overflow)).toEqual(
      emails(roster.filter((member) => member !== gone)),
    );
  });

  it("si su correo ya había salido y quedado registrado, cuenta como enviado aunque después haya salido sin dejar consentimiento", async () => {
    await seedRoster(3);
    const id = await scheduleCampaign(3);
    const interrupted = interruptionBeforeMarking(id, (call) => `ses_${call}`);
    useTransports({ overflow: interrupted.accept });
    expect(await interrupted.run()).toEqual(expect.any(String));
    const [record] = await db().select().from(message).where(eq(message.campaignId, id));
    if (!record) throw new Error("El primer correo tenía que quedar registrado");

    await endMembershipAs(SYSTEM_ACTOR, record.personId, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    await drainOutbox();

    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 2 });
    expect(await recipientOf(id, record.personId)).toMatchObject({
      status: "SENT",
      skipReason: null,
      messageId: record.id,
    });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      sentCount: 3,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(delivered.overflow).toHaveLength(3);
  });

  it("a quien se anonimizó con su correo registrado y sin marcar ya no le queda registro: queda omitido y la campaña cuenta un enviado menos de los que aceptó el proveedor", async () => {
    await seedRoster(3);
    const id = await scheduleCampaign(3);
    const interrupted = interruptionBeforeMarking(id, (call) => `ses_${call}`);
    useTransports({ overflow: interrupted.accept });
    expect(await interrupted.run()).toEqual(expect.any(String));
    const [record] = await db().select().from(message).where(eq(message.campaignId, id));
    if (!record) throw new Error("El primer correo tenía que quedar registrado");

    // Como pasa de verdad: comms le borra los mensajes al anonimizarla (ADR-030), y eso llega mucho
    // antes de que venza el reclamo del lote que se cayó.
    await anonymize(record.personId);
    await drainOutbox();
    expect(await db().select().from(message).where(eq(message.personId, record.personId))).toEqual(
      [],
    );

    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 2 });
    expect(await recipientOf(id, record.personId)).toMatchObject({
      status: "SKIPPED",
      skipReason: "ANONYMIZED",
      messageId: null,
    });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      sentCount: 2,
      failedCount: 0,
      skippedCount: 1,
    });
    expect(delivered.overflow).toHaveLength(3);
  });

  it("si cancelan la campaña mientras el lote decide omitir a alguien, queda omitido por la cancelación y no por el motivo del lote", async () => {
    const roster = await seedRoster(2);
    const id = await scheduleCampaign(1);
    await runCampaignTick(minute(0));
    const [left] = await waitingMembers(id, roster);
    if (!left) throw new Error("Tras el primer lote tenía que quedar alguien pendiente");
    await endMembershipAs(SYSTEM_ACTOR, left.id, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });

    // El lote ya comprobó su reclamo y está leyendo el consentimiento de la persona: queda quieto ahí,
    // porque la prueba retiene esa tabla, y mientras tanto llega la cancelación.
    const consents = await holdLock(sql`lock table consent in access exclusive mode`);
    const tick = runCampaignTick(minute(1));
    await untilLockWaiters(1, tick);
    await cancelCampaignAs(SYSTEM_ACTOR, id);
    await consents.release();

    expect(await tick).toEqual({ started: 0, sent: 0 });
    expect(await recipientOf(id, left.id)).toMatchObject({
      status: "SKIPPED",
      skipReason: "CANCELLED",
    });
    expect(await getCampaign(id)).toMatchObject({
      status: "CANCELLED",
      sentCount: 1,
      failedCount: 0,
      skippedCount: 1,
    });
  });
});

// DT-114: una campaña `SENDING` sin ningún `PENDING` no la cerraba ningún tick, porque solo recuenta
// quien marca a un destinatario. No hay comando que la deje así, y por eso las pruebas escriben el
// estado a mano: es lo que dejaba la carrera de DT-112 antes de ADR-115 regla 3, y lo que deja un
// destinatario que desaparece con su persona (`campaign_recipient.person_id` es `ON DELETE CASCADE`).
describe("una campaña en curso que se quedó sin pendientes (ADR-116 regla 16)", () => {
  /** El pendiente desaparece sin que ningún lote lo marque, como si se borrara su persona. */
  function dropPending(campaignId: string) {
    return db()
      .delete(campaignRecipient)
      .where(
        and(eq(campaignRecipient.campaignId, campaignId), eq(campaignRecipient.status, "PENDING")),
      )
      .returning({ id: campaignRecipient.id });
  }

  it("si el último pendiente desaparece sin pasar por un lote, el siguiente tick la cierra con sus contadores al día", async () => {
    await seedRoster(2);
    const id = await scheduleCampaign(1);
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 1 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      sentCount: 1,
      finishedAt: null,
    });
    expect(await dropPending(id)).toHaveLength(1);

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });

    expect(await recipientStatuses(id)).toEqual({ SENT: 1 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(1),
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(delivered.overflow).toHaveLength(1);
  });

  it("la que ya estaba trabada, con todos marcados y los contadores a medias, se cierra en el siguiente tick sin reenviarle a nadie", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(10);
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 3 });
    // Como la dejaba DT-112: los tres marcados, la campaña en curso y el recuento del lote que perdió.
    await db()
      .update(campaign)
      .set({ status: "SENDING", finishedAt: null, sentCount: 1 })
      .where(eq(campaign.id, id));

    expect(await runCampaignTick(minute(40))).toEqual({ started: 0, sent: 0 });

    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(40),
      sentCount: 3,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
  });

  it("se cierra en ese tick aunque una campaña más antigua le llene el lote", async () => {
    await seedRoster(3);
    await setPerMinute(1);
    const parts = await seedParts();
    const older = await scheduleNew(parts, "Primera");
    const stuck = await scheduleNew(parts, "Segunda", minute(1));
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 1 });
    expect(await runCampaignTick(minute(1))).toEqual({ started: 1, sent: 1 });
    expect(await recipientStatuses(stuck)).toEqual({ PENDING: 3 });
    expect(await dropPending(stuck)).toHaveLength(3);

    // El único lugar del lote se lo lleva el último pendiente de la más antigua.
    expect(await runCampaignTick(minute(2))).toEqual({ started: 0, sent: 1 });

    expect(await getCampaign(older)).toMatchObject({ status: "SENT", sentCount: 3 });
    expect(await getCampaign(stuck)).toMatchObject({
      status: "SENT",
      finishedAt: minute(2),
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
    expect(delivered.overflow).toHaveLength(3);
  });

  it("se cierra también el día en que el proveedor ya cortó por cuota, sin pedirle otro correo", async () => {
    await seedRoster(3);
    const id = await scheduleForNight(10);
    let calls = 0;
    useTransports({
      overflow: null,
      primary: (_mail, call) => {
        calls = call;
        if (call > 1) {
          throw new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy");
        }
        return `resend_${call}`;
      },
    });
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    expect(await recipientStatuses(id)).toEqual({ SENT: 1, PENDING: 2 });
    expect(await dropPending(id)).toHaveLength(2);

    expect(await runCampaignTick(night(1))).toEqual({ started: 0, sent: 0 });

    expect(calls).toBe(2);
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: night(1),
      sentCount: 1,
      failedCount: 0,
    });
  });

  it("mientras le quede un pendiente no se cierra, aunque el tick no pueda reclamarlo", async () => {
    await seedRoster(2);
    const id = await scheduleCampaign(1);
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 1 });
    // El pendiente que queda lo tiene reclamado un lote que todavía está en su plazo.
    await db()
      .update(campaignRecipient)
      .set({ claimedAt: minute(0) })
      .where(and(eq(campaignRecipient.campaignId, id), eq(campaignRecipient.status, "PENDING")));

    expect(await runCampaignTick(minute(1))).toEqual({ started: 0, sent: 0 });

    expect(await getCampaign(id)).toMatchObject({
      status: "SENDING",
      finishedAt: null,
      sentCount: 1,
    });
  });

  // El cierre del reclamo corre con la fila de la campaña tomada (ADR-115 regla 3): varios ticks a la vez
  // la visitan uno después del otro. Lo dejó la revisión de #170 como sonda; acá queda fijo.
  it("seis ticks a la vez sobre la que se quedó sin pendientes la cierran sin mandar nada, y un tick posterior no la vuelve a cerrar", async () => {
    await seedRoster(2);
    const id = await scheduleCampaign(1);
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 1 });
    expect(await dropPending(id)).toHaveLength(1);

    await warmPool(6);
    const ticks = await Promise.all(Array.from({ length: 6 }, () => runCampaignTick(minute(1))));

    expect(ticks).toEqual(Array.from({ length: 6 }, () => ({ started: 0, sent: 0 })));
    const closed = {
      status: "SENT",
      finishedAt: minute(1),
      sentCount: 1,
      failedCount: 0,
      skippedCount: 0,
    };
    expect(await getCampaign(id)).toMatchObject(closed);
    expect(await runCampaignTick(minute(9))).toEqual({ started: 0, sent: 0 });
    expect(await getCampaign(id)).toMatchObject(closed);
    expect(await recipientStatuses(id)).toEqual({ SENT: 1 });
    expect(delivered.overflow).toHaveLength(1);
  });

  it("dos ticks a la vez con un pendiente: uno le manda, el otro no manda nada y la campaña queda cerrada con los dos enviados", async () => {
    const roster = await seedRoster(2);
    const id = await scheduleCampaign(1);
    expect(await runCampaignTick(minute(0))).toEqual({ started: 1, sent: 1 });

    await warmPool();
    // Suelta, la carrera se da unas veces sí y otras no. La prueba retiene la fila de la campaña hasta
    // que los dos ticks la esperan: al soltarla entran uno tras otro, y sin ese candado ninguno espera.
    const row = await holdLock(sql`select id from campaign where id = ${id} for update`);
    const both = Promise.all([runCampaignTick(minute(1)), runCampaignTick(minute(1))]);
    await untilLockWaiters(2, both);
    const waiting = (await lockWaiters()).length;
    await row.release();
    const ticks = await both;

    expect(waiting).toBe(2);
    expect(ticks.map((tick) => tick.started)).toEqual([0, 0]);
    expect(ticks.map((tick) => tick.sent).sort()).toEqual([0, 1]);
    // Cada destinatario recibió su correo una sola vez.
    expect(addresses(delivered.overflow)).toEqual(emails(roster));
    expect(await recipientStatuses(id)).toEqual({ SENT: 2 });
    expect(await getCampaign(id)).toMatchObject({
      status: "SENT",
      finishedAt: minute(1),
      sentCount: 2,
      failedCount: 0,
      skippedCount: 0,
    });
  });
});

// La clave de idempotencia del proveedor (ADR-116 regla 18). El lote sigue entregando «al menos una
// vez» (decisión abierta 13): lo que cambia es que el correo repetido lleva la misma clave.
describe("la clave con la que un correo de campaña llega al proveedor (ADR-116 regla 18)", () => {
  it("es por campaña y persona, y el correo que salió sin poderse registrar vuelve a salir con la misma", async () => {
    const roster = await seedRoster(3);
    const id = await scheduleCampaign(5);
    // Sale por Resend, y el proveedor acepta el segundo correo con un id que la base no puede guardar.
    useTransports({
      overflow: null,
      primary: (_mail, call) => (call === 2 ? "resend_\u0000" : `resend_${call}`),
    });

    expect(await settle(runCampaignTick(minute(0)))).toEqual(expect.any(String));
    expect(await runCampaignTick(minute(CLAIM_MINUTES))).toEqual({ started: 0, sent: 2 });

    const host = new URL(getEnv().APP_URL).host;
    const keysTo = (member: Member) =>
      delivered.primary
        .filter((mail) => mail.to === member.email)
        .map((mail) => mail.idempotencyKey);
    for (const member of roster) {
      const expected = `${host}/campaign:${id}/${member.id}`;
      expect(new Set(keysTo(member))).toEqual(new Set([expected]));
    }
    // Tres destinatarios, cuatro correos: el repetido salió las dos veces con su clave.
    expect(roster.map((member) => keysTo(member).length).sort()).toEqual([1, 1, 2]);
    expect(new Set(delivered.primary.map((mail) => mail.idempotencyKey)).size).toBe(3);
  });
});
