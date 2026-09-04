import { notFound, redirect } from "next/navigation";
import { getOccasion, isPublicId } from "@/modules/participation";
import { resolveAlias } from "@/modules/system";

// Alias legado de GHPOINTS (ADR-018, ADR-035 regla 3): /asamblea/{publicId} resuelve a la ocasión
// nueva y redirige a /a/[publicId]; sin sesión, el proxy pide entrar allá.

export default async function AsambleaAliasPage({ params }: PageProps<"/asamblea/[publicId]">) {
  const { publicId } = await params;
  const alias = isPublicId(publicId) ? await resolveAlias(`/asamblea/${publicId}`) : null;
  const target = alias ? await getOccasion(alias.targetId) : null;
  if (!target) {
    notFound();
  }
  redirect(`/a/${target.publicId}`);
}
