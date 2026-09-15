import { z } from "zod";
import { getActor } from "@/modules/identity";
import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIN_BYTES,
  loadGamificationSettings,
  prepareEvidenceUpload,
} from "@/modules/participation";
import { getMembershipRef } from "@/modules/people";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";

// Subida de evidencia de una misión (ADR-067 regla 6): sesión, gamificación activa y membresía
// elegible; el POST prefirmado apunta a `evidence/<personId>/` con tipo y tamaño acotados.

export const dynamic = "force-dynamic";

const schema = z.object({
  contentType: z.string().trim().min(3).max(100),
  byteSize: z.number().int().positive(),
});

export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: "Sin sesión" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    return Response.json({ error: t("T-2442") }, { status: 403 });
  }
  const membership = await getMembershipRef(actor.personId);
  if (!membership || (membership.status !== "ACTIVE" && membership.status !== "HONORARY")) {
    return Response.json({ error: t("T-2440") }, { status: 403 });
  }
  try {
    const upload = await prepareEvidenceUpload(parsed.data, { personId: actor.personId });
    return Response.json(upload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DomainError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
