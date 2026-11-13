import { getEnv } from "@/env";
import { getEdition } from "@/modules/events";
import { findOpenRegistrationForm } from "@/modules/forms";
import { corsHeaders } from "@/shared/lib/cors";

// La edición para un frontend delgado (ADR-187, P2 de ADR-085): lo público de una edición publicada y,
// si tiene un formulario público abierto, los campos para inscribirse por la API. Sin datos personales
// ni sesión.

const ID = /^[a-z0-9-]{10,40}$/;

function headers(request: Request, cache: string): Record<string, string> {
  return {
    ...corsHeaders(getEnv().PUBLIC_API_ORIGINS, request.headers.get("origin")),
    "cache-control": cache,
  };
}

export function OPTIONS(request: Request): Response {
  return new Response(null, { status: 204, headers: headers(request, "public, max-age=86400") });
}

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/v1/ediciones/[id]">,
): Promise<Response> {
  const { id } = await params;
  const edition = ID.test(id) ? await getEdition(id) : null;
  if (!edition || edition.publicationStatus !== "PUBLISHED") {
    return Response.json(
      { version: 1, error: "NOT_FOUND" },
      { status: 404, headers: headers(request, "public, max-age=30, s-maxage=30") },
    );
  }
  const form = await findOpenRegistrationForm(edition.id);
  const registration =
    form && form.audience === "PUBLIC"
      ? {
          title: form.title,
          fields: form.parsedFields,
          consentRequired: form.consentRequired,
          privacyPolicyUrl: `${getEnv().APP_URL}/privacidad`,
        }
      : null;
  return Response.json(
    {
      version: 1,
      edition: {
        id: edition.id,
        event: edition.eventName,
        name: edition.name,
        description: edition.description,
        startsAt: edition.startsAt.toISOString(),
        endsAt: edition.endsAt?.toISOString() ?? null,
        location: edition.location,
      },
      registration,
    },
    { headers: headers(request, "public, max-age=30, s-maxage=30, stale-while-revalidate=60") },
  );
}
