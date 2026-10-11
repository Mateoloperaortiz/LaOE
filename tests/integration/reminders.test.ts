import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { permanenceDecided } from "@/domain-events/permanence";
import {
  saveSubscriptionAs,
  setMailTransportsForTests,
  setPushSenderForTests,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { runReminders } from "@/modules/participation";
import { membership } from "@/modules/people/schema";
import { runNotices } from "@/modules/permanence";
import { outbox } from "@/modules/system/schema";
import { conventionalTermDates } from "@/modules/terms";
import type { MailMessage, MailTransport } from "@/shared/adapters/mail";
import { tList } from "@/shared/copy";
import { itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Recordatorios (ADR-038 regla 9) y avisos de permanencia (regla 10): audiencia por comité o solo
// nuevos, una vez por ocasión y slot, y el correo T-202 solo a quien cumple.

const db = () => getDb();

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */
const keys = () => ({ p256dh: "p".repeat(32), auth: "a".repeat(16) });

async function subscribe(personId: string, endpoint: string) {
  await saveSubscriptionAs({ personId, ip: null }, { endpoint, keys: keys() }, null);
}

/** Hoy a la hora dada en Bogotá (UTC-5), como instante. */
function todayBogota(hour: number, minute = 0): Date {
  const now = new Date();
  const local = new Date(now.getTime() - 5 * 60 * 60_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour + 5, minute),
  );
}

describe("recordatorios de participación", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    // La fecha del proceso queda quieta en las 07:00 de hoy: un recordatorio vence cuando su ocasión
    // empieza (ADR-122 regla 9) y `drainOutbox` entrega con la hora que haya. Con el reloj real, estas
    // pruebas pasarían o fallarían según la hora a la que corrieran.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(todayBogota(7));
    await truncateAll();
    delivered.length = 0;
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("a las 07:00 avisa la actividad de hoy a su comité (o a los nuevos) una sola vez", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-pixel", "Pixel");
    const dentro = await seedMember("dentro@eafit.edu.co");
    const fuera = await seedMember("fuera@eafit.edu.co");
    const veterano = await seedMember("veterano@eafit.edu.co");
    await seedCommitteeMembership(dentro, committeeId, termId);
    await db()
      .update(membership)
      .set({ firstTermId: (await seedTerm("2024-1")) as string })
      .where(eq(membership.personId, veterano));
    for (const [person, endpoint] of [
      [dentro, "dentro"],
      [fuera, "fuera"],
      [veterano, "veterano"],
    ] as const) {
      await subscribe(person, `https://fcm.googleapis.com/fcm/send/${endpoint}`);
    }
    const tick = todayBogota(7);
    const deComite = await seedOccasion(termId, {
      title: "Reunión general de Pixel",
      committeeId,
      startsAt: todayBogota(18),
      checkInOpensAt: todayBogota(17, 30),
      checkInClosesAt: todayBogota(21),
    });
    const soloNuevos = await seedOccasion(termId, {
      title: "Integración de nuevos",
      newMembersOnly: true,
      startsAt: todayBogota(19),
      checkInOpensAt: todayBogota(18, 30),
      checkInClosesAt: todayBogota(22),
    });
    const result = await runReminders(tick);
    expect(result).toEqual({ due: 2, enqueued: 2 });
    await drainOutbox();
    const rows = await db().select().from(message);
    const byKey = (key: string) =>
      rows.filter((row) => row.dedupeKey === key).map((row) => row.personId);
    expect(byKey(`reminder:TODAY:${deComite.id}`)).toEqual([dentro]);
    expect(byKey(`reminder:TODAY:${soloNuevos.id}`).sort()).toEqual([dentro, fuera].sort());
    expect(
      rows.every(
        (row) => row.kind === "REMINDER" && itemPattern(tList("T-182")[0]).test(row.subject),
      ),
    ).toBe(true);
    expect(
      rows.find((row) => row.dedupeKey === `reminder:TODAY:${deComite.id}`)?.subject,
    ).toContain("Reunión general de Pixel");

    // El mismo tick otra vez: el outbox no duplica y comms no vuelve a mandar.
    expect((await runReminders(tick)).enqueued).toBe(2);
    await drainOutbox();
    expect(await db().select().from(message)).toHaveLength(rows.length);
    expect(delivered).toHaveLength(3);
    // A las 08:00 no hay nada que avisar.
    expect((await runReminders(todayBogota(8))).due).toBe(0);
    const pending = await db().select().from(outbox);
    expect(pending.every((row) => row.processedAt !== null)).toBe(true);
  });

  it("los avisos de permanencia corren sin reglas sin encolar nada", async () => {
    const termId = await seedTerm();
    const activa = await seedMember("activa@eafit.edu.co");
    await seedCommitteeMembership(activa, await seedCommittee("e2e-a3", "A3"), termId);
    // Un mes después del inicio del término: antes de la mitad, cuando empieza el aviso MID_TERM.
    const now = new Date(`${conventionalTermDates(currentTermCode()).startsOn}T17:00:00Z`);
    now.setUTCDate(now.getUTCDate() + 30);
    const result = await runNotices(now);
    expect(result.people).toBe(1);
    expect(result.enqueued).toBe(0);
  });
});

describe("resultado de permanencia por correo (T-202)", () => {
  const sent: MailMessage[] = [];
  const transport: MailTransport = {
    name: "resend",
    async send(mail) {
      sent.push(mail);
      return { id: `re_${sent.length}` };
    },
  };
  beforeEach(async () => {
    await truncateAll();
    sent.length = 0;
    setMailTransportsForTests({ primary: transport, overflow: null });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("manda T-202 solo en la fila por persona con CONTINUES y no repite al reintentar", async () => {
    const termId = await seedTerm();
    const ana = await seedMember("ana.cierre@eafit.edu.co", { firstName: "Ana" });
    const payload = (decision: string, committeeId: string | null) => ({
      actorId: null,
      personId: ana,
      termId,
      committeeId,
      decision,
      reason: "",
    });
    await enqueueEvent(db(), eventOf(permanenceDecided, payload("CONTINUES", "c1")));
    await enqueueEvent(db(), eventOf(permanenceDecided, payload("PROBATION", null)));
    await enqueueEvent(db(), eventOf(permanenceDecided, payload("CONTINUES", null)));
    await enqueueEvent(db(), eventOf(permanenceDecided, payload("CONTINUES", null)));
    await drainOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana.cierre@eafit.edu.co");
    expect(sent[0]?.subject).toMatch(itemPattern(tList("T-202")[0]));
    expect(sent[0]?.text).toContain("/app/permanencia");
    const rows = await db().select().from(message).where(eq(message.personId, ana));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "EMAIL", kind: "TRANSACTIONAL" });
  });
});
