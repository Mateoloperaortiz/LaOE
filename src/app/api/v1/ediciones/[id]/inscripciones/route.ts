import { z } from "zod";
import { getEnv } from "@/env";
import { getEdition } from "@/modules/events";
import { findOpenRegistrationForm, submitFormAs } from "@/modules/forms";
import { writeCorsHeaders } from "@/shared/lib/cors";
import { ipFromHeaders } from "@/shared/lib/request";

// Inscribirse a una edición desde un frontend delgado (ADR-187, P2 de ADR-085): la primera escritura
// pública de la API v1. Pasa por el mismo `submitFormAs` del formulario propio, con su campo trampa,
// su tope por IP, su consentimiento y su política de datos, y responde el enlace de la entrada. Nunca
// lee la sesión: quien se inscribe por aquí es siempre alguien de afuera.

const ID = /^[a-z0-9-]{10,40}$/;

const bodySchema = z.object({
  firstName: z.string().max(200).default(""),
  lastName: z.string().max(200).default(""),
  email: z.string().max(320).default(""),
  answers: z.record(z.string(), z.unknown()).default({}),
  consent: z.boolean().default(false),
  /** El campo trampa del formulario: una persona lo deja vacío. */
  website: z.string().max(200).optional(),
});

const STATUS = {
  CLOSED: 409,
  FULL: 409,
  DUPLICATE: 409,
  RATE_LIMITED: 429,
  CONSENT: 422,
  INVALID: 422,
  POLICY_PENDING: 503,
} as const;

function headers(request: Request): Record<string, string> {
  return {
    ...writeCorsHeaders(getEnv().PUBLIC_API_ORIGINS, request.headers.get("origin")),
    "cache-control": "no-store",
  };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/v1/ediciones/[id]/inscripciones">,
): Promise<Response> {
  const { id } = await params;
  const edition = ID.test(id) ? await getEdition(id) : null;
  const form =
    edition?.publicationStatus === "PUBLISHED" ? await findOpenRegistrationForm(edition.id) : null;
  if (!form || form.audience !== "PUBLIC") {
    return Response.json(
      { version: 1, error: "NOT_FOUND" },
      { status: 404, headers: headers(request) },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { version: 1, error: "INVALID", fields: {} },
      { status: 400, headers: headers(request) },
    );
  }
  const body = parsed.data;
  const result = await submitFormAs(null, form, {
    identity: { firstName: body.firstName, lastName: body.lastName, email: body.email },
    answers: body.answers,
    consent: body.consent,
    honeypot: body.website ?? null,
    ip: ipFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
  });
  if (!result.ok) {
    return Response.json(
      { version: 1, error: result.code, fields: result.errors },
      { status: STATUS[result.code], headers: headers(request) },
    );
  }
  return Response.json(
    {
      version: 1,
      registered: result.registered,
      ticketUrl: result.ticket ? `${getEnv().APP_URL}/entrada/${result.ticket}` : null,
    },
    { status: 201, headers: headers(request) },
  );
}
