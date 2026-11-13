import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOperator } from "@/app/_authz/occasion";
import { ASSEMBLY_POLL_STATUSES, listPolls } from "@/modules/participation";
import { ConsultasEnVivo } from "@/modules/participation/components/ConsultasEnVivo";
import { t, tLabels, tList } from "@/shared/copy";

// Una asamblea en el proyector (ADR-180, ADR-181): las consultas que no son borrador, con sus
// resultados en vivo; las secretas abiertas solo dicen cuántos han votado.

export const metadata: Metadata = { title: tList("T-4992")[0] ?? "" };

export default async function PresentarAsambleaPage({
  params,
}: PageProps<"/presentar/asamblea/[id]">) {
  const { id } = await params;
  const found = await requireOperator(id, `/presentar/asamblea/${id}`);
  if (!found || found.occasion.kind !== "ASSEMBLY") notFound();
  const polls = (await listPolls(id)).filter((poll) => poll.status !== "DRAFT");
  const statuses = tLabels("T-4999", ASSEMBLY_POLL_STATUSES);
  return (
    <>
      <h1 className="presentacion-titulo">{found.occasion.title}</h1>
      <ConsultasEnVivo
        url={`/api/asambleas/${id}/vivo`}
        initial={polls}
        occasionId={id}
        labels={{ statuses: { ...statuses }, votes: t("T-5000"), secret: t("T-5001"), empty: "" }}
        big
      />
    </>
  );
}
