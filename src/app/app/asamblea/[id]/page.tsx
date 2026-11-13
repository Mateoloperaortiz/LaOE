import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { ASSEMBLY_POLL_STATUSES, getOccasion, listPollsForMember } from "@/modules/participation";
import { ConsultasEnVivo } from "@/modules/participation/components/ConsultasEnVivo";
import { t, tLabels, tList } from "@/shared/copy";
import { voteAction } from "./actions";

// Las votaciones de una asamblea desde el celular (ADR-180 regla 4): vota quien tiene su asistencia
// aprobada, una vez por consulta. Las consultas cambian en vivo (ADR-179).

export const metadata: Metadata = { title: tList("T-5002")[0] ?? "" };

export default async function AsambleaPage({
  params,
  searchParams,
}: PageProps<"/app/asamblea/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const actor = await requireActor(`/app/asamblea/${id}`);
  const occasion = await getOccasion(id);
  if (!occasion || occasion.kind !== "ASSEMBLY") notFound();
  const { present, polls } = await listPollsForMember(actor.personId, id);
  const [titulo, yaVotaste, nadaAbierto, votar, sinAsistencia] = tList("T-5002");
  const statuses = tLabels("T-4999", ASSEMBLY_POLL_STATUSES);
  const error = single(search.error);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-secundario text-tinta-secundaria">{occasion.title}</p>
      </header>
      {single(search.votado) === "1" ? (
        <output className="block font-semibold text-titulo">{yaVotaste}</output>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
      {present ? null : <p className="text-tinta-secundaria">{sinAsistencia}</p>}
      <ConsultasEnVivo
        url={`/api/asambleas/${id}/vivo`}
        initial={polls}
        occasionId={id}
        labels={{
          statuses: { ...statuses },
          votes: t("T-5000"),
          secret: t("T-5001"),
          empty: nadaAbierto ?? "",
        }}
        {...(present
          ? { member: { action: voteAction, vote: votar ?? "", voted: yaVotaste ?? "" } }
          : {})}
      />
    </div>
  );
}
