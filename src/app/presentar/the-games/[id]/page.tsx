import type { Metadata } from "next";
import { requireCompetitionStaff } from "@/app/_authz/competition";
import { listStandings } from "@/modules/competition";
import { TablaEnVivo } from "@/modules/competition/components/TablaEnVivo";
import { tList } from "@/shared/copy";

// La tabla de The Games en el proyector (ADR-181): para el personal de la competencia, en vivo.

export const metadata: Metadata = { title: "The Games" };

export default async function PresentarTheGamesPage({
  params,
}: PageProps<"/presentar/the-games/[id]">) {
  const { id } = await params;
  const { competition } = await requireCompetitionStaff(id, `/presentar/the-games/${id}`);
  const standings = await listStandings(id);
  const [puntos, sinEquipos] = tList("T-5004");
  return (
    <>
      <h1 className="presentacion-titulo">{competition.name}</h1>
      <TablaEnVivo
        url={`/api/the-games/${id}/vivo`}
        initial={standings.overall}
        labels={{ points: puntos ?? "", empty: sinEquipos ?? "" }}
        big
      />
    </>
  );
}
