import { and, eq, gte, lt } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createCampaignAs,
  createTemplate,
  getCampaign,
  getCampaignQuotaStatus,
  runCampaignTick,
  scheduleCampaignAs,
  sendTransactionalEmail,
  setMailTransportsForTests,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { segment } from "@/modules/people/schema";
import { getConfig, setConfig } from "@/modules/system";
import { type MailProvider, type MailTransport, QuotaExceededError } from "@/shared/adapters/mail";
import { formatDateTime } from "@/shared/lib/dates";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// DT-125 (ADR-121 regla 5): el cupo del día del correo se cuenta por el día del proveedor. Resend lo
// cuenta por día calendario UTC y lo reinicia a la medianoche UTC, que en Colombia son las 7:00 p. m.
// La casa lo contaba desde la medianoche de Colombia: una campaña que mandaba su cupo después de las
// 7:00 p. m. volvía a mandarlo cinco horas después, en el mismo día del proveedor. Todo por lo que
// exporta `comms`, con el reloj inyectado y transportes de pruebas.

const RESERVE_KEY = "campaigns.transactionalReserve";
const CUT_KEY = "campaigns.quotaCut";
const DAILY_LIMIT = Number(process.env.RESEND_DAILY_LIMIT ?? 95);

// El día del proveedor que se mira es el 10 de marzo de 2031 en UTC: va de las 7:00 p. m. del 9 a las
// 7:00 p. m. del 10 en Colombia.
/** Las 7:00 p. m. del 9 en Colombia: empieza el día 10 del proveedor. */
const PROVIDER_DAY = new Date("2031-03-10T00:00:00.000Z");
/** Las 8:00 p. m. del 9 en Colombia. */
const EVENING = new Date("2031-03-10T01:00:00.000Z");
/** Las 12:05 a. m. del 10 en Colombia: otro día acá, el mismo para el proveedor. */
const PAST_LOCAL_MIDNIGHT = new Date("2031-03-10T05:05:00.000Z");
/** Las 6:59 p. m. del 10 en Colombia: el último minuto de ese día del proveedor. */
const LAST_MINUTE = new Date("2031-03-10T23:59:00.000Z");
/** Las 7:00 p. m. del 10 en Colombia: empieza el día 11 del proveedor. */
const NEXT_PROVIDER_DAY = new Date("2031-03-11T00:00:00.000Z");

/** Qué hace el proveedor con cada correo, en orden de llegada: lo acepta o lo rechaza. */
type Accept = (call: number) => void;

/** Lo que cada transporte de pruebas recibió, en orden. */
const calls: Record<"resend" | "ses", number> = { resend: 0, ses: 0 };

function fakeTransport(name: "resend" | "ses", accept: Accept = () => {}): MailTransport {
  return {
    name,
    async send() {
      calls[name] += 1;
      accept(calls[name]);
      return { id: `${name}_${calls[name]}` };
    },
  };
}

/** Resend solo, que es por donde salen hoy las campañas, o con SES de desbordamiento. */
function useTransports(options: { overflow: boolean; resend?: Accept }): void {
  setMailTransportsForTests({
    primary: fakeTransport("resend", options.resend),
    overflow: options.overflow ? fakeTransport("ses") : null,
  });
}

function setPerMinute(value: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, "campaigns.perMinute", value));
}

/** Deja el cupo de las campañas en `ceiling` correos al día. */
function setCampaignCeiling(ceiling: number): Promise<void> {
  return runCommand(SYSTEM_ACTOR, (ctx) => setConfig(ctx, RESERVE_KEY, DAILY_LIMIT - ceiling));
}

const NAMES = ["Ana", "Beto", "Caro", "Dani", "Eli"];

async function seedPeople(size: number): Promise<string[]> {
  const people: string[] = [];
  for (const firstName of NAMES.slice(0, size)) {
    people.push(await seedMember(`${firstName.toLowerCase()}@eafit.edu.co`, { firstName }));
  }
  return people;
}

/** Una campaña a todas las personas de la prueba, programada para esa hora. */
async function seedCampaign(at: Date): Promise<string> {
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
  await scheduleCampaignAs(SYSTEM_ACTOR, id, at);
  return id;
}

/** Correos que ya salieron a esa hora, sin pasar por el transporte: lo que cuenta el cupo. */
async function seedSent(
  personId: string,
  amount: number,
  sentAt: Date,
  provider: MailProvider = "resend",
): Promise<void> {
  await getDb()
    .insert(message)
    .values(
      Array.from({ length: amount }, (_, index) => ({
        personId,
        channel: "EMAIL" as const,
        kind: "TRANSACTIONAL" as const,
        subject: `Previo ${index}`,
        status: "SENT" as const,
        provider,
        sentAt,
      })),
    );
}

/** Cuántos correos aceptó Resend en ese día suyo, según lo que quedó registrado. */
async function acceptedInProviderDay(from: Date, to: Date): Promise<number> {
  const rows = await getDb()
    .select({ id: message.id })
    .from(message)
    .where(
      and(
        eq(message.provider, "resend"),
        eq(message.status, "SENT"),
        gte(message.sentAt, from),
        lt(message.sentAt, to),
      ),
    );
  return rows.length;
}

// El lote por minuto no se repone a mano al terminar: el vaciado de la prueba siguiente devuelve la
// configuración a la foto de la migración (ADR-124 regla 3).
beforeEach(async () => {
  await truncateAll();
  await setPerMinute(10);
  calls.resend = 0;
  calls.ses = 0;
  useTransports({ overflow: false });
});
afterAll(async () => {
  setMailTransportsForTests(undefined);
  await closeDb();
});

describe("el cupo del día del correo es el del día del proveedor, que va en UTC (ADR-121 regla 5)", () => {
  it("una campaña que mandó su cupo a las 8:00 p. m. de Colombia no manda otro a la medianoche de Colombia: sigue a las 7:00 p. m., cuando el proveedor empieza su día", async () => {
    await seedPeople(5);
    const id = await seedCampaign(EVENING);
    await setCampaignCeiling(2);

    expect(await runCampaignTick(EVENING)).toEqual({ started: 1, sent: 2 });

    // En Colombia ya es otro día; para el proveedor es el mismo, y su cupo de campañas ya salió.
    expect(await runCampaignTick(PAST_LOCAL_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(LAST_MINUTE)).toEqual({ started: 0, sent: 0 });
    expect(await acceptedInProviderDay(PROVIDER_DAY, NEXT_PROVIDER_DAY)).toBe(2);
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 2 });

    // A las 7:00 p. m. el proveedor empieza otro día y la campaña sigue donde quedó.
    expect(await runCampaignTick(NEXT_PROVIDER_DAY)).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENDING", sentCount: 4 });
  });

  it("lo transaccional elige por dónde sale con esa misma cuenta: con el cupo gastado después de las 7:00 p. m., a la medianoche de Colombia sigue saliendo por el desbordamiento", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    // El desbordamiento a SES está apagado en todos los entornos y si vuelve es la decisión abierta 52:
    // esto no la adelanta, solo fija que el día que mira es el mismo del lote y de la pantalla.
    useTransports({ overflow: true });
    await seedSent(ana, DAILY_LIMIT, EVENING);
    const mail = { personId: ana, to: "ana@eafit.edu.co", subject: "Hola", text: "x" };

    expect(await sendTransactionalEmail(mail, PAST_LOCAL_MIDNIGHT)).toMatchObject({
      status: "SENT",
      provider: "ses",
    });
    expect(await sendTransactionalEmail(mail, LAST_MINUTE)).toMatchObject({ provider: "ses" });
    expect(calls).toEqual({ resend: 0, ses: 2 });

    // Con el día nuevo del proveedor vuelve al primario.
    expect(await sendTransactionalEmail(mail, NEXT_PROVIDER_DAY)).toMatchObject({
      status: "SENT",
      provider: "resend",
    });
  });

  it("la pantalla del cupo cuenta lo mismo que el lote y dice la hora en que vuelve a empezar: las 7:00 p. m. de Colombia", async () => {
    const [ana] = await seedPeople(1);
    if (!ana) throw new Error("seed people");
    // Las 7:00 p. m. en punto ya son del día del proveedor; un segundo antes es de su día anterior,
    // aunque en Colombia sea la misma tarde. Lo de otro proveedor no cuenta.
    await seedSent(ana, 4, PROVIDER_DAY);
    await seedSent(ana, 3, new Date(PROVIDER_DAY.getTime() - 1_000));
    await seedSent(ana, 2, new Date("2031-03-10T05:01:00.000Z"));
    await seedSent(ana, 9, EVENING, "ses");

    const { daily } = await getCampaignQuotaStatus(PAST_LOCAL_MIDNIGHT);

    expect(daily).toMatchObject({ sentToday: 6, resetsAt: NEXT_PROVIDER_DAY });
    if (!daily) throw new Error("sin cuenta del día");
    // Lo que la pantalla escribe con esa hora: las siete de la noche del 10, no la medianoche.
    expect(formatDateTime(daily.resetsAt)).toMatch(/10.*7:00\sp\.\sm\./);
  });

  it("un rechazo por el cupo del día a las 8:00 p. m. de Colombia corta los lotes hasta las 7:00 p. m. del otro día: a la medianoche de Colombia no se le pregunta otra vez al proveedor", async () => {
    await seedPeople(3);
    const id = await seedCampaign(EVENING);
    let exhausted = true;
    useTransports({
      overflow: false,
      resend: (call) => {
        if (call > 1 && exhausted) {
          throw new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy", "DAILY");
        }
      },
    });

    expect(await runCampaignTick(EVENING)).toEqual({ started: 1, sent: 1 });
    expect(await getConfig(CUT_KEY)).toEqual({
      provider: "resend",
      reason: "DAILY",
      at: EVENING.toISOString(),
      until: NEXT_PROVIDER_DAY.toISOString(),
    });

    // El proveedor aceptaría si le preguntaran, pero su día no ha terminado: nadie le pregunta.
    exhausted = false;
    expect(await runCampaignTick(PAST_LOCAL_MIDNIGHT)).toEqual({ started: 0, sent: 0 });
    expect(await runCampaignTick(LAST_MINUTE)).toEqual({ started: 0, sent: 0 });
    expect(calls.resend).toBe(2);

    expect(await runCampaignTick(NEXT_PROVIDER_DAY)).toEqual({ started: 0, sent: 2 });
    expect(await getCampaign(id)).toMatchObject({ status: "SENT", sentCount: 3, failedCount: 0 });
  });
});
