import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { boardCalendarPush } from "@/domain-events/people";
import { type Env, getEnv } from "@/env";
import {
  cancelBoardEventAs,
  createBoardEventAs,
  listBoardEventsBetween,
  updateBoardEventAs,
} from "@/modules/people";
import { pullBoardCalendar, pushBoardEvent } from "@/modules/people/domain/board-calendar";
import { boardCalendarEvent } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import {
  type GoogleCalendarEvent,
  setGoogleCalendarTransport,
} from "@/shared/adapters/google-calendar";
import { tList } from "@/shared/copy";
import { seedAppointment, seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

// El calendario de la junta (ADR-197 regla 6): agenda quien tiene un cargo de la junta, por su área o
// por la junta en pleno; lo edita quien lo agregó o quien decide por su área; lo de la casa se escribe
// en Google y lo de Google llega a la casa; cada evento gana donde nació.

const guard = (index: number) => tList("T-5120")[index] ?? "";

/** Un Google Calendar en memoria: guarda los eventos y responde como la API. */
class FakeCalendar {
  events = new Map<string, GoogleCalendarEvent>();
  calls: string[] = [];
  private next = 1;
  transport = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${url.split("?")[0]}`);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "token-sintetico", expires_in: 3600 });
    }
    const path = new URL(url).pathname;
    const id = decodeURIComponent(path.split("/events/")[1] ?? "");
    const stamp = new Date().toISOString();
    if (method === "POST") {
      const body = JSON.parse(String(init.body)) as GoogleCalendarEvent;
      const created = {
        ...body,
        id: `g${this.next++}`,
        updated: stamp,
        htmlLink: "https://calendar.google.com/e",
      };
      this.events.set(created.id, created);
      return Response.json(created);
    }
    if (method === "PATCH") {
      const current = this.events.get(id);
      if (!current) return new Response(null, { status: 404 });
      const updated = { ...current, ...(JSON.parse(String(init.body)) as object), updated: stamp };
      this.events.set(id, updated);
      return Response.json(updated);
    }
    if (method === "DELETE") {
      const current = this.events.get(id);
      if (!current) return new Response(null, { status: 410 });
      this.events.set(id, { ...current, status: "cancelled", updated: stamp });
      return new Response(null, { status: 204 });
    }
    return Response.json({ items: [...this.events.values()] });
  };
  /** Lo que alguien hace directamente en Google Calendar. */
  put(event: GoogleCalendarEvent) {
    this.events.set(event.id, { ...event, updated: new Date().toISOString() });
  }
}

const week = {
  title: "Reunión de junta",
  area: "BOARD" as const,
  startsAt: "2099-03-02T18:00",
  endsAt: "2099-03-02T20:00",
  location: "Bloque 29",
  description: "Orden del día por compartir",
};

async function setup() {
  const termId = await seedTerm();
  const presidentId = await seedMember("presidencia.calendario@eafit.edu.co");
  await seedAppointment(presidentId, termId, "PRESIDENT");
  const ghId = await seedMember("gh.calendario@eafit.edu.co");
  await seedAppointment(ghId, termId, "VP_GH");
  const memberId = await seedMember("miembro.calendario@eafit.edu.co");
  return {
    president: { personId: presidentId, ip: null },
    gh: { personId: ghId, ip: null },
    member: { personId: memberId, ip: null },
    ghId,
  };
}

async function rowOf(id: string) {
  const [row] = await getDb()
    .select()
    .from(boardCalendarEvent)
    .where(eq(boardCalendarEvent.id, id));
  return row;
}

async function pushes(): Promise<string[]> {
  return (
    await getDb().select().from(outbox).where(eq(outbox.eventType, boardCalendarPush.type))
  ).map((row) => (row.payload as { eventId: string }).eventId);
}

describe("agendar en el calendario de la junta", () => {
  let original: Env;
  beforeEach(async () => {
    original = { ...getEnv() };
    await truncateAll();
  });
  afterEach(() => {
    Object.assign(getEnv(), original);
    setGoogleCalendarTransport(null);
  });
  afterAll(() => closeDb());

  it("agenda quien tiene un cargo, por su área o por la junta en pleno, y pide escribirlo en Google", async () => {
    const f = await setup();

    await expect(createBoardEventAs(f.member, week)).rejects.toThrow(guard(0));
    await expect(createBoardEventAs(f.gh, { ...week, area: "VP_FINANCE" })).rejects.toThrow(
      guard(1),
    );
    await expect(createBoardEventAs(f.gh, { ...week, endsAt: "2099-03-02T17:00" })).rejects.toThrow(
      guard(4),
    );

    const { id } = await createBoardEventAs(f.gh, {
      ...week,
      area: "VP_GH",
      title: "Cierre de GH",
    });
    expect(await rowOf(id)).toMatchObject({ area: "VP_GH", origin: "CASA", createdById: f.ghId });
    expect(await pushes()).toEqual([id]);
  });

  it("lo edita quien lo agregó o quien decide por su área, y quitarlo no lo borra de la casa", async () => {
    const f = await setup();
    const { id } = await createBoardEventAs(f.gh, { ...week, area: "VP_GH" });

    await expect(updateBoardEventAs(f.member, id, { ...week, area: "VP_GH" })).rejects.toThrow(
      guard(3),
    );
    // La Presidencia no decide por una VP que está: no edita lo de GH.
    await expect(updateBoardEventAs(f.president, id, { ...week, area: "VP_GH" })).rejects.toThrow(
      guard(3),
    );

    await updateBoardEventAs(f.gh, id, {
      ...week,
      area: "VP_GH",
      title: "Cierre de GH, nueva hora",
    });
    expect((await rowOf(id))?.title).toBe("Cierre de GH, nueva hora");

    await cancelBoardEventAs(f.gh, id);
    expect((await rowOf(id))?.cancelledAt).toBeInstanceOf(Date);
    expect(
      await listBoardEventsBetween(
        new Date("2099-03-01T00:00:00Z"),
        new Date("2099-03-04T00:00:00Z"),
      ),
    ).toEqual([]);
  });
});

describe("la sincronización con Google Calendar", () => {
  let original: Env;
  let google: FakeCalendar;
  beforeEach(async () => {
    original = { ...getEnv() };
    getEnv().GOOGLE_CALENDAR_JUNTA_ID = "junta-sintetica@group.calendar.google.com";
    google = new FakeCalendar();
    setGoogleCalendarTransport(google.transport);
    await truncateAll();
  });
  afterEach(() => {
    Object.assign(getEnv(), original);
    setGoogleCalendarTransport(null);
  });
  afterAll(() => closeDb());

  it("sin el calendario configurado no llama a Google", async () => {
    const f = await setup();
    delete getEnv().GOOGLE_CALENDAR_JUNTA_ID;
    const { id } = await createBoardEventAs(f.president, week);

    await pushBoardEvent(id);
    expect(await pullBoardCalendar()).toEqual({ read: 0, queued: 0 });
    expect(google.calls).toEqual([]);
  });

  it("lo de la casa se escribe allá con su marca, se actualiza y se borra", async () => {
    const f = await setup();
    const { id } = await createBoardEventAs(f.president, week);

    await pushBoardEvent(id);
    const row = await rowOf(id);
    expect(row).toMatchObject({ googleEventId: "g1", syncError: "" });
    expect(google.events.get("g1")).toMatchObject({
      summary: "Reunión de junta",
      location: "Bloque 29",
      start: { dateTime: "2099-03-02T23:00:00.000Z", timeZone: "America/Bogota" },
      extendedProperties: { private: { casaId: id } },
    });

    await updateBoardEventAs(f.president, id, {
      ...week,
      title: "Reunión de junta extraordinaria",
    });
    await pushBoardEvent(id);
    expect(google.events.get("g1")?.summary).toBe("Reunión de junta extraordinaria");

    await cancelBoardEventAs(f.president, id);
    await pushBoardEvent(id);
    expect(google.events.get("g1")?.status).toBe("cancelled");
  });

  it("lo que nace en Google llega a la casa, cambia y se quita, y no se edita aquí", async () => {
    const f = await setup();
    google.put({
      id: "externo1",
      status: "confirmed",
      summary: "Visita de Desarrollo Estudiantil",
      start: { dateTime: "2099-03-03T14:00:00-05:00" },
      end: { dateTime: "2099-03-03T15:00:00-05:00" },
      htmlLink: "https://calendar.google.com/externo1",
    });

    expect(await pullBoardCalendar()).toEqual({ read: 1, queued: 0 });
    const [llegado] = await getDb()
      .select()
      .from(boardCalendarEvent)
      .where(eq(boardCalendarEvent.googleEventId, "externo1"));
    expect(llegado).toMatchObject({
      origin: "GOOGLE",
      area: "BOARD",
      title: "Visita de Desarrollo Estudiantil",
      startsAt: new Date("2099-03-03T19:00:00Z"),
    });
    await expect(updateBoardEventAs(f.president, llegado?.id ?? "", week)).rejects.toThrow(
      guard(2),
    );

    google.put({
      ...(google.events.get("externo1") as GoogleCalendarEvent),
      summary: "Visita aplazada",
    });
    await pullBoardCalendar();
    expect((await rowOf(llegado?.id ?? ""))?.title).toBe("Visita aplazada");

    google.put({ ...(google.events.get("externo1") as GoogleCalendarEvent), status: "cancelled" });
    await pullBoardCalendar();
    expect((await rowOf(llegado?.id ?? ""))?.cancelledAt).toBeInstanceOf(Date);
  });

  it("lo que nació en la casa y cambiaron o borraron en Google se vuelve a escribir como está aquí", async () => {
    const f = await setup();
    const { id } = await createBoardEventAs(f.president, week);
    await pushBoardEvent(id);
    const before = (await pushes()).length;

    // Sin cambios allá, leer no vuelve a escribir.
    expect((await pullBoardCalendar()).queued).toBe(0);

    google.put({
      ...(google.events.get("g1") as GoogleCalendarEvent),
      summary: "Cambiado en Google",
    });
    expect((await pullBoardCalendar()).queued).toBe(1);
    expect((await pushes()).length).toBe(before + 1);
    await pushBoardEvent(id);
    expect(google.events.get("g1")?.summary).toBe("Reunión de junta");

    google.put({ ...(google.events.get("g1") as GoogleCalendarEvent), status: "cancelled" });
    expect((await pullBoardCalendar()).queued).toBe(1);
    await pushBoardEvent(id);
    // Se crea otra vez, con otro identificador de Google.
    expect((await rowOf(id))?.googleEventId).toBe("g2");
    expect(google.events.get("g2")?.status).toBe("confirmed");
  });

  it("si Google falla, deja el error en la fila y relanza para que el outbox reintente", async () => {
    const f = await setup();
    const { id } = await createBoardEventAs(f.president, week);
    setGoogleCalendarTransport(async (url) =>
      url.includes("oauth2")
        ? Response.json({ access_token: "token-sintetico", expires_in: 3600 })
        : new Response(null, { status: 500 }),
    );

    await expect(pushBoardEvent(id)).rejects.toThrow();
    expect(await rowOf(id)).toMatchObject({ googleEventId: null, syncError: "REJECTED 500" });
  });
});
