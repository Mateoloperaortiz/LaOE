import { and, desc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createCampaignAs,
  createTemplate,
  getCampaign,
  liftCampaignQuotaCutAs,
  runCampaignTick,
  scheduleCampaignAs,
  setMailTransportsForTests,
} from "@/modules/comms";
import { campaignRecipient } from "@/modules/comms/schema";
import { segment } from "@/modules/people/schema";
import { getConfig, setConfig } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { type MailMessage, QuotaExceededError } from "@/shared/adapters/mail";
import { t } from "@/shared/copy";
import { seedMember } from "../factories";
import { truncateAll } from "./db";

// DT-117 (ADR-116 regla 19, que enmienda ADR-115 regla 6): el corte de las campañas guarda la causa del
// rechazo y dura según cuál. Todo por el tick que exporta `comms`, con el reloj de cada tick inyectado
// y un Resend de pruebas, sin desbordamiento: es por donde salen hoy las campañas.

const KEY = "campaigns.quotaCut";
/** Donde lo dejaban las versiones anteriores a ADR-116, como una fecha sola. Ya no se escribe. */
const LEGACY_KEY = "campaigns.quotaExhaustedAt";

// Las 22:00 del 9 de marzo de 2031 en Colombia: en UTC ya es 10.
const NIGHT = new Date("2031-03-10T03:00:00.000Z");
const after = (minutes: number): Date => new Date(NIGHT.getTime() + minutes * 60_000);
/**
 * La medianoche del proveedor que le sigue a `NIGHT`, y el minuto anterior. Su día va en UTC (ADR-121
 * regla 5): termina a las 19:00 del 10 en Colombia, no a la medianoche de Colombia.
 */
const MIDNIGHT = new Date("2031-03-11T00:00:00.000Z");
const BEFORE_MIDNIGHT = new Date("2031-03-10T23:59:00.000Z");
/** El primer instante de abril en Colombia, y el minuto anterior. */
const APRIL = new Date("2031-04-01T05:00:00.000Z");
const BEFORE_APRIL = new Date("2031-04-01T04:59:00.000Z");

const delivered: MailMessage[] = [];

/** Qué hace el proveedor con cada correo, en orden de llegada: devuelve su id o lo rechaza. */
type Accept = (mail: MailMessage, call: number) => string | Promise<string>;

function stubResend(accept: Accept = (_mail, call) => `resend_${call}`): void {
  let calls = 0;
  setMailTransportsForTests({
    primary: {
      name: "resend",
      async send(mail) {
        calls += 1;
        const id = await accept(mail, calls);
        delivered.push(mail);
        return { id };
      },
    },
    overflow: null,
  });
}

/**
 * Un proveedor que acepta el primer correo, rechaza el segundo con ese error y desde ahí acepta todo:
 * si un lote le pregunta durante el corte, el correo sale y la prueba lo ve.
 */
function rejectSecondWith(error: QuotaExceededError): { calls: () => number } {
  let seen = 0;
  stubResend((_mail, call) => {
    seen = call;
    if (call === 2) {
      throw error;
    }
    return `resend_${call}`;
  });
  return { calls: () => seen };
}

function setPerMinute(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", value));
}

const NAMES = ["Ana", "Beto", "Caro", "Dani"];

/** Una campaña a esas personas, programada para `NIGHT`. Devuelve su id y el de cada persona. */
async function seedCampaign(size: number): Promise<{ id: string; people: string[] }> {
  const people: string[] = [];
  for (const firstName of NAMES.slice(0, size)) {
    people.push(await seedMember(`${firstName.toLowerCase()}@eafit.edu.co`, { firstName }));
  }
  const [row] = await getDb()
    .insert(segment)
    .values({ name: "Todos", filter: {} })
    .returning({ id: segment.id });
  if (!row) throw new Error("seed segment");
  const { id: templateId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug: "novedades",
      name: "Novedades",
      subject: "Novedades para {nombre}",
      body: "Hola **{nombre}**.",
    }),
  );
  const { id } = await createCampaignAs(SYSTEM_ACTOR, {
    name: "Novedades",
    templateId,
    segmentId: row.id,
  });
  await scheduleCampaignAs(SYSTEM_ACTOR, id, NIGHT);
  return { id, people };
}

/** Destinatarios de la campaña que siguen pendientes y que ningún lote tiene reclamados. */
async function unclaimedPending(campaignId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: campaignRecipient.id })
    .from(campaignRecipient)
    .where(
      and(
        eq(campaignRecipient.campaignId, campaignId),
        eq(campaignRecipient.status, "PENDING"),
        isNull(campaignRecipient.claimedAt),
      ),
    );
  return rows.length;
}

function configAudits() {
  return getDb()
    .select({
      actorId: auditLog.actorId,
      ip: auditLog.ip,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .where(and(eq(auditLog.action, "config.updated"), eq(auditLog.entityId, KEY)))
    .orderBy(desc(auditLog.at));
}

// El lote por minuto no se repone a mano al terminar: el vaciado de la prueba siguiente devuelve la
// configuración a la foto de la migración (ADR-124 regla 3).
beforeEach(async () => {
  await truncateAll();
  delivered.length = 0;
  await setPerMinute(10);
  stubResend();
});
afterAll(async () => {
  setMailTransportsForTests(undefined);
  await closeDb();
});

describe("el corte por cuota dura según su causa (ADR-116 regla 19)", () => {
  it("una ráfaga que no cedió corta quince minutos, y la campaña sigue el mismo día", async () => {
    const { id } = await seedCampaign(4);
    const provider = rejectSecondWith(
      new QuotaExceededError("rate_limit_exceeded: demasiadas solicitudes", "BURST"),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    const cut = await getConfig(KEY);

    // El proveedor ya aceptaría, pero durante el corte no se le pregunta.
    expect(await runCampaignTick(after(1))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(after(14))).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);

    expect(await runCampaignTick(after(15))).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
    expect(cut).toEqual({
      provider: "resend",
      reason: "BURST",
      at: NIGHT.toISOString(),
      until: after(15).toISOString(),
    });
  });

  it("una ráfaga con la espera que pidió el proveedor corta ese tiempo, en minutos enteros", async () => {
    const { id } = await seedCampaign(4);
    const provider = rejectSecondWith(
      new QuotaExceededError("rate_limit_exceeded: demasiadas solicitudes", "BURST", 90_000),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    const cut = await getConfig(KEY);

    expect(await runCampaignTick(after(1))).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);
    expect(await runCampaignTick(after(2))).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4 });
    expect(cut).toMatchObject({ reason: "BURST", until: after(2).toISOString() });
  });

  it("el cupo del día agotado corta hasta el otro día del proveedor, que empieza a las 19:00 de Colombia", async () => {
    const { id } = await seedCampaign(4);
    const provider = rejectSecondWith(
      new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy", "DAILY"),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    const cut = await getConfig(KEY);

    expect(await runCampaignTick(after(15))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(BEFORE_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);

    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
    expect(cut).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT.toISOString(),
      until: MIDNIGHT.toISOString(),
    });
  });

  it("el cupo del mes agotado corta hasta el primer día del mes siguiente de Colombia", async () => {
    const { id } = await seedCampaign(4);
    const provider = rejectSecondWith(
      new QuotaExceededError("monthly_quota_exceeded: se acabó el cupo del mes", "MONTHLY"),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    const cut = await getConfig(KEY);

    // Al otro día no prueba un correo más: el cupo del mes no cede con la medianoche.
    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(BEFORE_APRIL)).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 1 });

    expect(await runCampaignTick(APRIL)).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
    expect(cut).toEqual({
      provider: "resend",
      reason: "MONTHLY",
      at: NIGHT.toISOString(),
      until: APRIL.toISOString(),
    });
  });

  it("una causa que no se reconoce queda guardada como la del cupo del día, y el lote suelta lo que tenía reclamado", async () => {
    const { id } = await seedCampaign(4);
    const provider = rejectSecondWith(
      new QuotaExceededError("quota_exceeded: una cuota que nadie conoce", "OTRA" as never, 90_000),
    );

    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    // Lo que no se reconoce no llega a la configuración: queda un corte que se puede guardar y leer.
    expect(await getConfig(KEY)).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT.toISOString(),
      until: MIDNIGHT.toISOString(),
    });
    expect(await unclaimedPending(id)).toBe(3);

    expect(await runCampaignTick(after(15))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(BEFORE_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);

    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 3 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
  });

  it("el valor viejo del corte, una fecha sola, se sigue leyendo como el del cupo del día", async () => {
    const { id } = await seedCampaign(2);
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, LEGACY_KEY, NIGHT.toISOString()));

    expect(await runCampaignTick(after(1))).toEqual({ started: 1, sent: 0 });
    expect(await runCampaignTick(BEFORE_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(delivered).toEqual([]);

    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2 });
  });

  it("un corte no se acorta: la ráfaga de un lote que venía en vuelo no pisa el del cupo del mes", async () => {
    const { id } = await seedCampaign(2);
    await setPerMinute(1);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    stubResend(async (_mail, call) => {
      if (call === 1) {
        arrived();
        await held;
        throw new QuotaExceededError("rate_limit_exceeded: demasiadas solicitudes", "BURST");
      }
      throw new QuotaExceededError("monthly_quota_exceeded: se acabó el cupo del mes", "MONTHLY");
    });

    // El primer lote toma a una persona y queda esperando al proveedor; al segundo le rechazan a la
    // otra por el cupo del mes; recién ahí al primero le llega su rechazo por ráfaga.
    const first = runCampaignTick(NIGHT);
    await inFlight;
    await runCampaignTick(after(1));
    release();
    await first;

    const cut = await getConfig(KEY);
    stubResend();
    expect(await runCampaignTick(after(16))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 0 });
    expect(cut).toMatchObject({
      reason: "MONTHLY",
      at: after(1).toISOString(),
      until: APRIL.toISOString(),
    });
  });

  it("tampoco se acorta el que dejó una versión anterior: la ráfaga de un lote en vuelo no lo pisa", async () => {
    const { id } = await seedCampaign(2);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    stubResend(async () => {
      arrived();
      await held;
      throw new QuotaExceededError("rate_limit_exceeded: demasiadas solicitudes", "BURST");
    });

    // El lote queda esperando al proveedor; mientras tanto una versión anterior, que corre a la vez
    // durante un despliegue, deja en su clave el corte por el cupo del día. Recién ahí al lote le llega
    // su rechazo por ráfaga, que duraría quince minutos.
    const batch = runCampaignTick(after(1));
    await inFlight;
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, LEGACY_KEY, NIGHT.toISOString()));
    release();
    await batch;

    stubResend();
    expect(await getConfig(KEY)).toBeNull();
    expect(await runCampaignTick(after(17))).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(BEFORE_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(delivered).toEqual([]);

    expect(await runCampaignTick(MIDNIGHT)).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2 });
  });
});

describe("a quién detiene el corte por cuota (ADR-116 regla 19)", () => {
  it("es del proveedor que rechazó: si las campañas pasan a otro transporte, el lote sale antes de que termine", async () => {
    const { id } = await seedCampaign(4);
    const resend = rejectSecondWith(
      new QuotaExceededError("monthly_quota_exceeded: se acabó el cupo del mes", "MONTHLY"),
    );
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    const cut = await getConfig(KEY);

    // Mientras salgan por Resend, su corte las detiene.
    expect(await runCampaignTick(after(1))).toEqual({ started: 0, sent: 0 });

    // Aparece el desbordamiento, que es por donde sale una campaña cuando existe. Resend sigue de
    // primario y aceptaría: si el lote le pregunta, la prueba lo ve.
    const viaResend: MailMessage[] = [];
    const viaSes: MailMessage[] = [];
    setMailTransportsForTests({
      primary: {
        name: "resend",
        async send(mail) {
          viaResend.push(mail);
          return { id: `resend_tarde_${viaResend.length}` };
        },
      },
      overflow: {
        name: "ses",
        async send(mail) {
          viaSes.push(mail);
          return { id: `ses_${viaSes.length}` };
        },
      },
    });

    expect(await runCampaignTick(after(2))).toEqual({ started: 0, sent: 3 });

    expect(viaSes).toHaveLength(3);
    expect(viaResend).toEqual([]);
    expect(resend.calls()).toBe(2);
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 4, failedCount: 0 });
    // El corte de Resend sigue guardado como quedó, hasta abril: no era de quien envió.
    expect(cut).toEqual({
      provider: "resend",
      reason: "MONTHLY",
      at: NIGHT.toISOString(),
      until: APRIL.toISOString(),
    });
    expect(await getConfig(KEY)).toEqual(cut);
  });
});

describe("levantar el corte por cuota (ADR-116 regla 19)", () => {
  const daily = () =>
    new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy", "DAILY");

  it("el corte con causa queda en su propia clave y la de las versiones anteriores no se toca: volver a una de ellas no pide borrar nada", async () => {
    await seedCampaign(3);
    rejectSecondWith(daily());
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect(await getConfig(KEY)).toMatchObject({ provider: "resend", reason: "DAILY" });
    // La versión anterior valida esta clave como una fecha sola: con otra forma, su tick fallaría entero.
    expect(await getConfig(LEGACY_KEY)).toBeNull();
  });

  it("levanta también el corte que dejó la versión anterior, sin tocar su fecha", async () => {
    const { id, people } = await seedCampaign(2);
    const [admin] = people;
    if (!admin) throw new Error("seed people");
    await runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, LEGACY_KEY, NIGHT.toISOString()));
    expect(await runCampaignTick(after(1))).toEqual({ started: 1, sent: 0 });

    expect(
      await liftCampaignQuotaCutAs({ personId: admin, ip: null }, { by: "ADMIN" }, after(5)),
    ).toBe(true);

    // Lo levanta el corte de la clave nueva, que nace con la hora del de antes y termina ahora.
    expect(await getConfig(LEGACY_KEY)).toBe(NIGHT.toISOString());
    expect(await getConfig(KEY)).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: NIGHT.toISOString(),
      until: after(5).toISOString(),
    });
    expect(await runCampaignTick(after(6))).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 2 });
    // Y levantarlo otra vez ya no encuentra nada vigente.
    expect(
      await liftCampaignQuotaCutAs({ personId: admin, ip: null }, { by: "ADMIN" }, after(7)),
    ).toBe(false);
  });

  it("lo levanta quien declara el alcance de ADMIN: queda en la auditoría y el lote siguiente sale el mismo día", async () => {
    const { id, people } = await seedCampaign(3);
    const [admin] = people;
    if (!admin) throw new Error("seed people");
    rejectSecondWith(daily());
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });

    expect(
      await liftCampaignQuotaCutAs(
        { personId: admin, ip: "203.0.113.7" },
        { by: "ADMIN" },
        after(5),
      ),
    ).toBe(true);

    // Levantarlo es adelantarle el final: el corte queda guardado con su causa y ya no detiene a nadie.
    const lifted = {
      provider: "resend",
      reason: "DAILY",
      at: NIGHT.toISOString(),
      until: after(5).toISOString(),
    };
    expect(await getConfig(KEY)).toEqual(lifted);
    const [audit] = await configAudits();
    expect(audit).toMatchObject({
      actorId: admin,
      ip: "203.0.113.7",
      before: { ...lifted, until: MIDNIGHT.toISOString() },
      after: lifted,
    });
    expect(await runCampaignTick(after(6))).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 3 });
  });

  it.each([
    ["sin alcance", undefined],
    ["con el alcance de un comité", { by: "COMMITTEE" }],
    ["con un alcance que no se reconoce", { by: "admin" }],
  ])("%s no levanta nada", async (_case, scope) => {
    const { people } = await seedCampaign(3);
    const [someone] = people;
    if (!someone) throw new Error("seed people");
    const provider = rejectSecondWith(daily());
    await runCampaignTick(NIGHT);
    const audits = (await configAudits()).length;

    await expect(
      liftCampaignQuotaCutAs({ personId: someone, ip: null }, scope as never, after(5)),
    ).rejects.toThrow(t("T-032"));

    expect(await getConfig(KEY)).toMatchObject({ reason: "DAILY" });
    expect(await configAudits()).toHaveLength(audits);
    expect(await runCampaignTick(after(6))).toEqual({ started: 0, sent: 0 });
    expect(provider.calls()).toBe(2);
  });

  it("sin una persona que responda por la acción no levanta nada", async () => {
    await seedCampaign(3);
    rejectSecondWith(daily());
    await runCampaignTick(NIGHT);

    await expect(
      liftCampaignQuotaCutAs(SYSTEM_ACTOR as never, { by: "ADMIN" }, after(5)),
    ).rejects.toThrow(t("T-032"));
    expect(await getConfig(KEY)).toMatchObject({ reason: "DAILY" });
  });

  it("sin corte vigente responde que no había y no escribe nada", async () => {
    const { people } = await seedCampaign(3);
    const [admin] = people;
    if (!admin) throw new Error("seed people");

    expect(
      await liftCampaignQuotaCutAs({ personId: admin, ip: null }, { by: "ADMIN" }, NIGHT),
    ).toBe(false);

    // Tampoco con uno que ya venció: el de ayer ya no detiene a nadie.
    rejectSecondWith(daily());
    await runCampaignTick(NIGHT);
    const audits = (await configAudits()).length;
    expect(
      await liftCampaignQuotaCutAs({ personId: admin, ip: null }, { by: "ADMIN" }, MIDNIGHT),
    ).toBe(false);
    expect(await getConfig(KEY)).toMatchObject({ reason: "DAILY" });
    expect(await configAudits()).toHaveLength(audits);
  });

  it("si el proveedor vuelve a rechazar después de levantarlo, el corte se escribe otra vez", async () => {
    const { people } = await seedCampaign(4);
    const [admin] = people;
    if (!admin) throw new Error("seed people");
    let open = 1;
    stubResend((_mail, call) => {
      if (open === 0) {
        throw daily();
      }
      open -= 1;
      return `resend_${call}`;
    });
    expect(await runCampaignTick(NIGHT)).toEqual({ started: 1, sent: 1 });
    await liftCampaignQuotaCutAs({ personId: admin, ip: null }, { by: "ADMIN" }, after(5));

    expect(await runCampaignTick(after(6))).toEqual({ started: 0, sent: 0 });

    expect(await getConfig(KEY)).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: after(6).toISOString(),
      until: MIDNIGHT.toISOString(),
    });
    expect(await runCampaignTick(after(7))).toEqual({ started: 0, sent: 0 });
  });
});
