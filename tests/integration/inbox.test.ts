import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personAnonymized } from "@/domain-events/people";
import {
  countUnreadInbox,
  DEFAULT_PREFERENCES,
  deliverNotification,
  listInbox,
  markInboxRead,
  openInboxItem,
  updatePreferencesAs,
} from "@/modules/comms";
import { pruneInbox, recordInbox } from "@/modules/comms/domain/inbox";
import { inboxItem } from "@/modules/comms/schema";
import { person } from "@/modules/people/schema";
import { seedInboxItem, seedMember } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// El centro de avisos de Mi OE (ADR-166): lo que entra, una sola vez; lo que no entra; quién lo lee y
// cuánto dura.

const DAY = 24 * 60 * 60 * 1000;

function request(personIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    kind: "WORDLE" as const,
    recipients: personIds.map((personId) => ({ personId })),
    title: "El Wordle de hoy",
    body: "Ya está la palabra",
    url: "/app/juegos/wordle",
    dedupeKey: "wordle:2026-11-13",
    ...overrides,
  };
}

describe("centro de avisos", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("lo del bus entra una vez por persona, aunque no tenga dispositivo ni quiera ese push", async () => {
    const ana = await seedMember("ana.avisos@oe-sintetica.example");
    const beto = await seedMember("beto.avisos@oe-sintetica.example");
    await updatePreferencesAs(
      { personId: beto, ip: null },
      { ...DEFAULT_PREFERENCES, pushWordle: false },
    );
    await deliverNotification(request([ana, beto]));
    await deliverNotification(request([ana, beto]));
    for (const personId of [ana, beto]) {
      const items = await listInbox(personId, null);
      expect(items.map((item) => [item.kind, item.title, item.href])).toEqual([
        ["WORDLE", "El Wordle de hoy", "/app/juegos/wordle"],
      ]);
    }
  });

  it("guarda el enlace general del pedido, nunca el propio de la persona (el de una encuesta trae su token)", async () => {
    const ana = await seedMember("ana.encuesta@oe-sintetica.example");
    await deliverNotification({
      ...request([ana], { kind: "SURVEY", url: "/app", dedupeKey: "survey:x" }),
      recipients: [{ personId: ana, url: "/app/encuesta/token-sintetico" }],
    });
    expect((await listInbox(ana, null)).map((item) => item.href)).toEqual(["/app"]);
  });

  it("un pedido con inbox: false no entra, y un enlace a otro dominio se guarda sin enlace", async () => {
    const ana = await seedMember("ana.acceso@oe-sintetica.example");
    await deliverNotification(
      request([ana], { kind: "TRANSACTIONAL", dedupeKey: "access-grant:x", inbox: false }),
    );
    expect(await listInbox(ana, null)).toEqual([]);
    await recordInbox(ana, {
      kind: "ANNOUNCEMENT",
      title: "Afuera",
      body: "",
      href: "https://otro.example/x",
      dedupeKey: "afuera",
    });
    expect((await listInbox(ana, null))[0]?.href).toBeNull();
  });

  it("no le guarda nada a una persona anonimizada", async () => {
    const ana = await seedMember("ana.anon@oe-sintetica.example");
    await getDb().update(person).set({ anonymizedAt: new Date() }).where(eq(person.id, ana));
    expect(
      await recordInbox(ana, { kind: "POINTS", title: "x", body: "", href: null, dedupeKey: "k" }),
    ).toBe(false);
    expect(await getDb().select().from(inboxItem)).toEqual([]);
  });

  it("filtra por tipo, abre solo lo propio y marca leído", async () => {
    const ana = await seedMember("ana.filtro@oe-sintetica.example");
    const beto = await seedMember("beto.filtro@oe-sintetica.example");
    const juego = await seedInboxItem(ana, {
      kind: "WORDLE",
      title: "Juego",
      href: "/app/juegos",
      dedupeKey: "j",
    });
    await seedInboxItem(ana, { kind: "CAMPAIGN", title: "Campaña", dedupeKey: "c" });
    expect((await listInbox(ana, "campanas")).map((item) => item.title)).toEqual(["Campaña"]);
    expect(await countUnreadInbox(ana)).toBe(2);
    expect(await openInboxItem(beto, juego)).toBeNull();
    expect(await countUnreadInbox(ana)).toBe(2);
    expect(await openInboxItem(ana, juego)).toEqual({ href: "/app/juegos" });
    expect(await countUnreadInbox(ana)).toBe(1);
    expect(await markInboxRead(ana)).toBe(1);
    expect(await countUnreadInbox(ana)).toBe(0);
  });

  it("la limpieza borra lo que llegó hace más de 90 días, leído o no", async () => {
    const ana = await seedMember("ana.limpieza@oe-sintetica.example");
    const now = new Date("2026-11-13T12:00:00Z");
    await seedInboxItem(ana, {
      kind: "POINTS",
      title: "Viejo",
      dedupeKey: "viejo",
      createdAt: new Date(now.getTime() - 91 * DAY),
    });
    await seedInboxItem(ana, {
      kind: "POINTS",
      title: "Reciente",
      dedupeKey: "reciente",
      createdAt: new Date(now.getTime() - 89 * DAY),
      readAt: now,
    });
    expect(await pruneInbox(now)).toBe(1);
    expect((await listInbox(ana, null)).map((item) => item.title)).toEqual(["Reciente"]);
  });

  it("al anonimizar a la persona se van todos sus avisos", async () => {
    const ana = await seedMember("ana.borrado@oe-sintetica.example");
    const beto = await seedMember("beto.borrado@oe-sintetica.example");
    await seedInboxItem(ana, { kind: "POINTS", title: "De Ana", dedupeKey: "a" });
    await seedInboxItem(beto, { kind: "POINTS", title: "De Beto", dedupeKey: "b" });
    await enqueueEvent(getDb(), eventOf(personAnonymized, { actorId: null, personId: ana }));
    await drainOutbox();
    expect(await listInbox(ana, null)).toEqual([]);
    expect((await listInbox(beto, null)).map((item) => item.title)).toEqual(["De Beto"]);
  });
});
