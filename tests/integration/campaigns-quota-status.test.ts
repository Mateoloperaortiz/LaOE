import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createCampaignAs,
  createTemplate,
  getCampaignBacklog,
  getCampaignQuotaStatus,
  liftCampaignQuotaCutAs,
  resetTransactionalReserveAs,
  runCampaignTick,
  scheduleCampaignAs,
  setMailTransportsForTests,
  setTransactionalReserveAs,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { segment } from "@/modules/people/schema";
import { getConfig, setConfig } from "@/modules/system";
import { appConfig, auditLog } from "@/modules/system/schema";
import { type MailProvider, QuotaExceededError } from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// DT-115 (ADR-116 regla 20): lo que la pantalla de una campaña y la del cupo de correo le muestran a un
// ADMIN, y el comando con el que cambia el margen. Todo por lo que exporta `comms`, con el reloj
// inyectado y un transporte de pruebas.

const RESERVE_KEY = "campaigns.transactionalReserve";
const CUT_KEY = "campaigns.quotaCut";

const DAILY_LIMIT = Number(process.env.RESEND_DAILY_LIMIT ?? 95);
const DEFAULT_RESERVE = Math.ceil(DAILY_LIMIT / 3);
const DEFAULT_CEILING = DAILY_LIMIT - DEFAULT_RESERVE;

// Las 22:00 del 9 de marzo de 2031 en Colombia: en UTC ya es 10.
const NIGHT = new Date("2031-03-10T03:00:00.000Z");
const after = (minutes: number): Date => new Date(NIGHT.getTime() + minutes * 60_000);
/** Más temprano en ese mismo día del proveedor, que va en UTC (ADR-121 regla 5): las 19:30 del 9 en Colombia. */
const EARLIER = new Date("2031-03-10T00:30:00.000Z");
/** La medianoche del proveedor que le sigue a `NIGHT`: las 19:00 del 10 en Colombia. */
const MIDNIGHT = new Date("2031-03-11T00:00:00.000Z");
const APRIL = new Date("2031-04-01T05:00:00.000Z");

/** Qué hace el proveedor con un correo: lo acepta, espera o lo rechaza. */
type Accept = () => void | Promise<void>;

function stubMail(name: MailProvider, accept: Accept = () => {}): void {
  setMailTransportsForTests({
    primary: {
      name,
      async send() {
        await accept();
        return { id: null };
      },
    },
    overflow: null,
  });
}

const rejecting = (error: QuotaExceededError): Accept => {
  return () => {
    throw error;
  };
};

function setPerMinute(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", value));
}

const NAMES = ["Ana", "Beto", "Caro"];

async function seedPeople(size: number): Promise<string[]> {
  const people: string[] = [];
  for (const firstName of NAMES.slice(0, size)) {
    people.push(await seedMember(`${firstName.toLowerCase()}@eafit.edu.co`, { firstName }));
  }
  return people;
}

/** Una campaña a todas las personas de la prueba, programada para `NIGHT`; `suffix` distingue una segunda. */
async function seedCampaign(suffix = ""): Promise<string> {
  const [row] = await getDb()
    .insert(segment)
    .values({ name: `Todos${suffix}`, filter: {} })
    .returning({ id: segment.id });
  if (!row) throw new Error("seed segment");
  const { id: templateId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug: `novedades${suffix}`,
      name: `Novedades${suffix}`,
      subject: "Novedades para {nombre}",
      body: "Hola **{nombre}**.",
    }),
  );
  const { id } = await createCampaignAs(SYSTEM_ACTOR, {
    name: `Novedades${suffix}`,
    templateId,
    segmentId: row.id,
  });
  await scheduleCampaignAs(SYSTEM_ACTOR, id, NIGHT);
  return id;
}

/** Correos que ya salieron a esa hora, sin pasar por el transporte: lo que cuenta el cupo. */
async function seedSent(
  personId: string,
  kind: "TRANSACTIONAL" | "CAMPAIGN",
  amount: number,
  sentAt: Date,
  provider: MailProvider = "resend",
): Promise<void> {
  if (amount === 0) return;
  await getDb()
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

function reserveAudits() {
  return getDb()
    .select({
      actorId: auditLog.actorId,
      ip: auditLog.ip,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, "config.updated"), eq(auditLog.entityId, RESERVE_KEY)))
    .orderBy(desc(auditLog.at));
}

// El lote por minuto no se repone a mano al terminar: el vaciado de la prueba siguiente devuelve la
// configuración a la foto de la migración (ADR-124 regla 3).
beforeEach(async () => {
  await truncateAll();
  await setPerMinute(10);
  stubMail("resend");
});
afterAll(async () => {
  setMailTransportsForTests(undefined);
  await closeDb();
});

describe("el cupo de correo que ve un ADMIN (ADR-116 regla 20)", () => {
  it("sin margen fijado muestra el cupo del día, el margen por defecto, lo enviado en el día del proveedor y lo que cabe", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    await seedSent(ana, "TRANSACTIONAL", 10, EARLIER);
    // La medianoche del proveedor en punto ya es de hoy; un segundo antes es de ayer, aunque en
    // Colombia sea la misma tarde, y lo de otro proveedor no cuenta.
    await seedSent(ana, "CAMPAIGN", 5, new Date("2031-03-10T00:00:00.000Z"));
    await seedSent(ana, "TRANSACTIONAL", 7, new Date("2031-03-09T23:59:59.000Z"));
    await seedSent(ana, "TRANSACTIONAL", 9, EARLIER, "ses");

    expect(await getCampaignQuotaStatus(NIGHT)).toEqual({
      provider: "resend",
      reserveSetting: null,
      daily: {
        limit: DAILY_LIMIT,
        reserve: DEFAULT_RESERVE,
        ceiling: DEFAULT_CEILING,
        sentToday: 15,
        claimed: 0,
        room: DEFAULT_CEILING - 15,
        resetsAt: MIDNIGHT,
      },
      cut: null,
    });
  });

  it("lo que un lote tiene reclamado y sin resultado ya no cabe", async () => {
    await seedPeople(3);
    await seedCampaign();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    stubMail("resend", async () => {
      arrived();
      await held;
    });

    const tick = runCampaignTick(NIGHT);
    await inFlight;
    const during = await getCampaignQuotaStatus(after(1));
    release();
    await tick;

    expect(during.daily).toMatchObject({ sentToday: 0, claimed: 3, room: DEFAULT_CEILING - 3 });
    expect((await getCampaignQuotaStatus(after(2))).daily).toMatchObject({
      sentToday: 3,
      claimed: 0,
      room: DEFAULT_CEILING - 3,
    });
  });

  it("por un transporte sin cupo del día no hay cuenta, y el margen fijado se sigue viendo", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, 20);
    stubMail("console");

    expect(await getCampaignQuotaStatus(NIGHT)).toEqual({
      provider: "console",
      reserveSetting: 20,
      daily: null,
      cut: null,
    });
  });

  it("muestra el corte vigente con su causa, y deja de mostrarlo cuando termina o cuando lo levantan", async () => {
    const [ana] = await seedPeople(2);
    if (!ana) throw new Error("seed people");
    await seedCampaign();
    stubMail(
      "resend",
      rejecting(new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy", "DAILY")),
    );
    await runCampaignTick(NIGHT);

    expect((await getCampaignQuotaStatus(after(1))).cut).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT,
      until: MIDNIGHT,
    });
    expect((await getCampaignQuotaStatus(MIDNIGHT)).cut).toBeNull();

    await liftCampaignQuotaCutAs({ personId: ana, ip: null }, { by: "ADMIN" }, after(5));
    expect((await getCampaignQuotaStatus(after(6))).cut).toBeNull();
  });

  it("no muestra el corte de otro proveedor, ni lo levanta: si las campañas pasan a otro transporte, el de Resend no es el suyo", async () => {
    const [ana] = await seedPeople(2);
    if (!ana) throw new Error("seed people");
    await seedCampaign();
    stubMail(
      "resend",
      rejecting(new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy", "DAILY")),
    );
    await runCampaignTick(NIGHT);
    const stored = {
      provider: "resend",
      reason: "DAILY",
      at: NIGHT.toISOString(),
      until: MIDNIGHT.toISOString(),
    };
    expect((await getCampaignQuotaStatus(after(1))).cut).toMatchObject({ provider: "resend" });

    stubMail("ses");

    expect(await getCampaignQuotaStatus(after(1))).toEqual({
      provider: "ses",
      reserveSetting: null,
      daily: null,
      cut: null,
    });
    // Tampoco hay nada que levantar: el corte de Resend queda guardado como estaba.
    expect(
      await liftCampaignQuotaCutAs({ personId: ana, ip: null }, { by: "ADMIN" }, after(1)),
    ).toBe(false);
    expect(await getConfig(CUT_KEY)).toEqual(stored);

    // Y si vuelven a Resend antes de su final, las detiene otra vez.
    stubMail("resend");
    expect((await getCampaignQuotaStatus(after(2))).cut).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT,
      until: MIDNIGHT,
    });
  });

  it("lee la base y no la caché: ve lo que otro proceso acaba de escribir", async () => {
    await seedPeople(1);
    // Este proceso ya leyó las dos claves y las tiene en caché sin valor.
    expect(await getConfig(CUT_KEY)).toBeNull();
    expect(await getConfig(RESERVE_KEY)).toBeNull();
    // Otro proceso las escribe: acá, directo en la base, sin pasar por la caché de este.
    await getDb()
      .insert(appConfig)
      .values([
        { key: RESERVE_KEY, value: 50 },
        {
          key: CUT_KEY,
          value: {
            provider: "resend",
            reason: "MONTHLY",
            at: NIGHT.toISOString(),
            until: APRIL.toISOString(),
          },
        },
      ]);

    expect(await getCampaignQuotaStatus(after(1))).toMatchObject({
      reserveSetting: 50,
      daily: { reserve: 50, ceiling: DAILY_LIMIT - 50 },
      cut: { reason: "MONTHLY", until: APRIL },
    });
  });
});

describe("cambiar el margen para lo transaccional (ADR-116 regla 20)", () => {
  it("lo cambia quien declara el alcance de ADMIN: rige enseguida y queda en la auditoría", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");

    await setTransactionalReserveAs({ personId: ana, ip: "203.0.113.7" }, { by: "ADMIN" }, 40);

    expect(await getCampaignQuotaStatus(NIGHT)).toMatchObject({
      reserveSetting: 40,
      daily: { reserve: 40, ceiling: DAILY_LIMIT - 40, room: DAILY_LIMIT - 40 },
    });
    expect(await getConfig(RESERVE_KEY)).toBe(40);
    expect(await reserveAudits()).toEqual([
      { actorId: ana, ip: "203.0.113.7", before: null, after: 40 },
    ]);
  });

  it("volver al margen por defecto quita el fijado: rige otra vez un tercio del cupo y queda en la auditoría", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, 40);
    // Leerlo antes deja el 40 en la caché del proceso: quitarlo tiene que soltarla también.
    expect(await getConfig(RESERVE_KEY)).toBe(40);

    expect(
      await resetTransactionalReserveAs({ personId: ana, ip: "203.0.113.7" }, { by: "ADMIN" }),
    ).toBe(true);

    expect(await getConfig(RESERVE_KEY)).toBeNull();
    const reserve = Math.ceil(DAILY_LIMIT / 3);
    expect(await getCampaignQuotaStatus(NIGHT)).toMatchObject({
      reserveSetting: null,
      daily: { reserve, ceiling: DAILY_LIMIT - reserve },
    });
    expect(await reserveAudits()).toHaveLength(2);
    expect(await reserveAudits()).toContainEqual({
      actorId: ana,
      ip: "203.0.113.7",
      before: 40,
      after: null,
    });

    // Sin margen fijado no hay nada que quitar, y no deja otra fila en la auditoría.
    expect(await resetTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" })).toBe(
      false,
    );
    expect(await reserveAudits()).toHaveLength(2);
  });

  it.each([
    ["sin alcance", undefined],
    ["con el alcance de un comité", { by: "COMMITTEE" }],
    ["con un alcance que no se reconoce", { by: "admin" }],
  ])("%s no vuelve al margen por defecto", async (_case, scope) => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, 40);

    await expect(
      resetTransactionalReserveAs({ personId: ana, ip: null }, scope as never),
    ).rejects.toThrow(t("T-032"));

    expect(await getConfig(RESERVE_KEY)).toBe(40);
    expect(await reserveAudits()).toHaveLength(1);
  });

  it("el lote siguiente ya cuenta con el margen nuevo", async () => {
    const people = await seedPeople(3);
    const [ana] = people;
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    // Con el margen nuevo caben dos correos de campaña, y hoy ya salió uno transaccional.
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 2);
    await seedSent(ana, "TRANSACTIONAL", 1, EARLIER);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    expect(await getCampaignBacklog(id, after(1))).toEqual({
      pending: 2,
      hold: { by: "ROOM", until: MIDNIGHT },
    });
  });

  it.each([
    ["sin alcance", undefined],
    ["con el alcance de un comité", { by: "COMMITTEE" }],
    ["con un alcance que no se reconoce", { by: "admin" }],
  ])("%s no cambia nada", async (_case, scope) => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");

    await expect(
      setTransactionalReserveAs({ personId: ana, ip: null }, scope as never, 40),
    ).rejects.toThrow(t("T-032"));

    expect(await getConfig(RESERVE_KEY)).toBeNull();
    expect(await reserveAudits()).toEqual([]);
  });

  it("sin una persona que responda por el cambio no cambia nada", async () => {
    await expect(
      setTransactionalReserveAs(SYSTEM_ACTOR as never, { by: "ADMIN" }, 40),
    ).rejects.toThrow(t("T-032"));
    expect(await getConfig(RESERVE_KEY)).toBeNull();
  });

  it.each([
    ["negativo", -1],
    ["con decimales", 1.5],
    ["que no es un número", Number.NaN],
    ["infinito", Number.POSITIVE_INFINITY],
    ["escrito como texto", "40"],
  ])("un margen %s se rechaza con su texto y no cambia nada", async (_case, value) => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");

    await expect(
      setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, value as never),
    ).rejects.toThrow(t("T-3235"));

    expect(await getConfig(RESERVE_KEY)).toBeNull();
    expect(await reserveAudits()).toEqual([]);
  });
});

describe("lo pendiente de una campaña en curso (ADR-116 regla 20)", () => {
  it("con lugar en el cupo y sin corte, nada lo detiene", async () => {
    await seedPeople(3);
    const id = await seedCampaign();
    await setPerMinute(1);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 2, hold: null });
  });

  it("sin lugar en el cupo de hoy, espera hasta la medianoche del proveedor", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await seedSent(ana, "TRANSACTIONAL", DEFAULT_CEILING, EARLIER);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });

    expect(await getCampaignBacklog(id, after(1))).toEqual({
      pending: 3,
      hold: { by: "ROOM", until: MIDNIGHT },
    });
  });

  it("con un corte vigente, espera hasta su final y dice la causa, también si además no hay lugar", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    stubMail(
      "resend",
      rejecting(new QuotaExceededError("monthly_quota_exceeded: se acabó el mes", "MONTHLY")),
    );
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });
    const cut = { by: "CUT", provider: "resend", reason: "MONTHLY", until: APRIL };

    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 3, hold: cut });

    await seedSent(ana, "TRANSACTIONAL", DEFAULT_CEILING, EARLIER);
    expect(await getCampaignBacklog(id, after(2))).toEqual({ pending: 3, hold: cut });
  });

  it("el corte de otro proveedor no detiene lo pendiente", async () => {
    await seedPeople(3);
    const id = await seedCampaign();
    stubMail(
      "resend",
      rejecting(new QuotaExceededError("monthly_quota_exceeded: se acabó el mes", "MONTHLY")),
    );
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });
    expect(await getCampaignBacklog(id, after(1))).toMatchObject({
      pending: 3,
      hold: { by: "CUT", provider: "resend" },
    });

    stubMail("ses");

    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 3, hold: null });
  });

  it("con un margen que cubre todo el cupo, espera a que lo bajen", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });

    expect((await getCampaignQuotaStatus(after(1))).daily).toMatchObject({ ceiling: 0, room: 0 });
    expect(await getCampaignBacklog(id, after(1))).toEqual({
      pending: 3,
      hold: { by: "RESERVE" },
    });
  });

  it("con lugar para una parte, dice cuántos salen hoy y cuántos siguen a la medianoche del proveedor", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    // Caben dos correos de campaña y el lote manda uno por minuto: sale uno y queda lugar para otro.
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 2);
    await setPerMinute(1);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect((await getCampaignQuotaStatus(after(1))).daily).toMatchObject({ ceiling: 2, room: 1 });
    expect(await getCampaignBacklog(id, after(1))).toEqual({
      pending: 2,
      hold: { by: "PARTIAL", fits: 1, waiting: 1, until: MIDNIGHT },
    });
  });

  it("con lugar justo para todos los pendientes, nada lo detiene", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 3);
    await setPerMinute(1);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect((await getCampaignQuotaStatus(after(1))).daily).toMatchObject({ ceiling: 3, room: 2 });
    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 2, hold: null });
  });

  // DT-187 (5): el lugar es de todas las campañas en curso y los lotes atienden primero a la que
  // empezó antes. La cuenta de una pantalla no resta lo que las demás tienen pendiente: entre las dos
  // anuncian más de lo que cabe, y por eso T-3257 dice «hasta» y no una cifra exacta.
  it("con dos campañas en curso, cada una cuenta contra todo el lugar que queda, sin restar lo pendiente de la otra", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const first = await seedCampaign();
    const second = await seedCampaign("-dos");
    // Caben dos correos de campaña entre las dos y el lote manda uno por minuto.
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 2);
    await setPerMinute(1);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 2, sent: 1 });

    expect((await getCampaignQuotaStatus(after(1))).daily).toMatchObject({ ceiling: 2, room: 1 });
    const backlogs = [
      await getCampaignBacklog(first, after(1)),
      await getCampaignBacklog(second, after(1)),
    ];
    expect(backlogs.map((backlog) => backlog.pending).sort()).toEqual([2, 3]);
    // Queda lugar para uno, y las dos pantallas lo cuentan como suyo.
    for (const backlog of backlogs) {
      expect(backlog.hold).toEqual({
        by: "PARTIAL",
        fits: 1,
        waiting: backlog.pending - 1,
        until: MIDNIGHT,
      });
    }
  });

  it("lo que un lote tiene en vuelo cuenta entre lo que sale hoy, no entre lo que espera", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 2);
    await setPerMinute(1);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    stubMail("resend", async () => {
      arrived();
      await held;
    });

    const tick = runCampaignTick(NIGHT);
    await inFlight;
    // El reclamado ya tiene su lugar; de los otros dos cabe uno.
    const during = await getCampaignBacklog(id, after(1));
    release();
    await tick;

    expect(during).toEqual({
      pending: 3,
      hold: { by: "PARTIAL", fits: 2, waiting: 1, until: MIDNIGHT },
    });
    expect(await getCampaignBacklog(id, after(2))).toEqual({
      pending: 2,
      hold: { by: "PARTIAL", fits: 1, waiting: 1, until: MIDNIGHT },
    });
  });

  it("con un corte vigente manda el corte, aunque hoy quepa una parte", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await setTransactionalReserveAs({ personId: ana, ip: null }, { by: "ADMIN" }, DAILY_LIMIT - 2);
    stubMail(
      "resend",
      rejecting(new QuotaExceededError("monthly_quota_exceeded: se acabó el mes", "MONTHLY")),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 0 });

    expect((await getCampaignQuotaStatus(after(1))).daily).toMatchObject({ ceiling: 2, room: 2 });
    expect(await getCampaignBacklog(id, after(1))).toEqual({
      pending: 3,
      hold: { by: "CUT", provider: "resend", reason: "MONTHLY", until: APRIL },
    });
  });

  it("por un transporte sin cupo del día, lo pendiente no espera el cupo", async () => {
    const [ana] = await seedPeople(3);
    if (!ana) throw new Error("seed people");
    const id = await seedCampaign();
    await seedSent(ana, "TRANSACTIONAL", DAILY_LIMIT, EARLIER);
    stubMail("console");
    await setPerMinute(1);

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 2, hold: null });
  });

  it("una campaña sin pendientes no espera nada", async () => {
    await seedPeople(2);
    const id = await seedCampaign();

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 2 });

    expect(await getCampaignBacklog(id, after(1))).toEqual({ pending: 0, hold: null });
  });
});
