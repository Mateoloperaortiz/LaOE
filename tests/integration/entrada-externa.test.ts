import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { getEnv } from "@/env";
import { getPublicForm, getTicket, submitFormAs, ticketCounts } from "@/modules/forms";
import { checkInTicketAs } from "@/modules/forms/domain/tickets";
import { t } from "@/shared/copy";
import { seedEdition, seedEvent, seedForm } from "../factories";
import { truncateAll } from "./db";

// La entrada externa y la inscripción por la API (ADR-187): cada inscripción a una edición lleva su
// entrada; la puerta la lee una vez; y un frontend delgado inscribe por `POST /api/v1/…`.

const { GET } = await import("@/app/api/v1/ediciones/[id]/route");
const { POST } = await import("@/app/api/v1/ediciones/[id]/inscripciones/route");

beforeEach(truncateAll);
afterAll(() => closeDb());

const admin = { personId: null, ip: null };
const fields = [{ key: "colegio", label: "Colegio", type: "TEXT", required: true }];

async function edicionConFormulario(publicationStatus: "PUBLISHED" | "DRAFT" = "PUBLISHED") {
  const eventId = await seedEvent("dias-eafit", "Días EAFIT", { publicationStatus: "PUBLISHED" });
  const editionId = await seedEdition(eventId, "2026-2", "2026-2", {
    startsAt: new Date(Date.now() + 10 * 86_400_000),
    publicationStatus,
  });
  await seedForm("inscripcion-dias", {
    fields,
    consentRequired: false,
    actions: { createPerson: true, editionId },
  });
  const view = await getPublicForm("inscripcion-dias");
  if (!view) throw new Error("form");
  return { editionId, view };
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("la entrada externa", () => {
  it("quien se inscribe recibe su entrada y la puerta la lee una sola vez", async () => {
    const { editionId, view } = await edicionConFormulario();
    const result = await submitFormAs(null, view, {
      identity: { firstName: "Sara", lastName: "Visitante", email: "sara@example.com" },
      answers: { colegio: "Colegio de prueba" },
      consent: false,
      ip: null,
    });
    if (!result.ok || !result.ticket) throw new Error("sin entrada");
    expect(await getTicket(result.ticket)).toMatchObject({
      editionId,
      name: "Sara Visitante",
      checkedInAt: null,
    });

    const enlace = `${getEnv().APP_URL}/entrada/${result.ticket}`;
    expect(await checkInTicketAs(admin, editionId, enlace)).toEqual({
      ok: true,
      message: t("T-5028", { nombre: "Sara Visitante" }),
    });
    const segunda = await checkInTicketAs(admin, editionId, result.ticket);
    expect(segunda.ok).toBe(false);
    expect(segunda.message).toContain("Sara Visitante");
    expect(await checkInTicketAs(admin, "otra-edicion-0000", result.ticket)).toEqual({
      ok: false,
      message: t("T-5026"),
    });
    expect(await ticketCounts(editionId)).toEqual({ inside: 1, total: 1 });
    expect((await getTicket(result.ticket))?.checkedInAt).toBeInstanceOf(Date);
  });
});

describe("la API de ediciones", () => {
  it("lee la edición con sus campos e inscribe con el mismo formulario, una vez por correo", async () => {
    const { editionId } = await edicionConFormulario();
    const lectura = await GET(
      new Request(`http://casa.test/api/v1/ediciones/${editionId}`),
      context(editionId),
    );
    expect(lectura.status).toBe(200);
    const edicion = await lectura.json();
    expect(edicion).toMatchObject({
      version: 1,
      edition: { id: editionId, event: "Días EAFIT", name: "2026-2" },
      registration: {
        consentRequired: false,
        fields: [expect.objectContaining({ key: "colegio" })],
      },
    });

    const inscribir = (body: unknown) =>
      POST(
        new Request(`http://casa.test/api/v1/ediciones/${editionId}/inscripciones`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": "10.0.0.7" },
          body: JSON.stringify(body),
        }),
        context(editionId),
      );
    const datos = {
      firstName: "Tomás",
      lastName: "Afuera",
      email: "tomas@example.com",
      answers: { colegio: "Colegio de prueba" },
    };
    const creada = await inscribir(datos);
    expect(creada.status).toBe(201);
    const cuerpo = await creada.json();
    expect(cuerpo).toMatchObject({ version: 1, registered: true });
    expect(cuerpo.ticketUrl).toMatch(/\/entrada\/[A-Za-z0-9_-]{24}$/);

    expect((await inscribir(datos)).status).toBe(409);
    const sinColegio = await inscribir({ ...datos, email: "otra@example.com", answers: {} });
    expect(sinColegio.status).toBe(422);
    expect((await sinColegio.json()).fields).toHaveProperty("colegio");
    const basura = await POST(
      new Request(`http://casa.test/api/v1/ediciones/${editionId}/inscripciones`, {
        method: "POST",
        body: "no es json",
      }),
      context(editionId),
    );
    expect(basura.status).toBe(400);
  });

  it("una edición en borrador no existe para la API", async () => {
    const { editionId } = await edicionConFormulario("DRAFT");
    const lectura = await GET(
      new Request(`http://casa.test/api/v1/ediciones/${editionId}`),
      context(editionId),
    );
    expect(lectura.status).toBe(404);
    const escritura = await POST(
      new Request(`http://casa.test/api/v1/ediciones/${editionId}/inscripciones`, {
        method: "POST",
        body: "{}",
      }),
      context(editionId),
    );
    expect(escritura.status).toBe(404);
  });
});
