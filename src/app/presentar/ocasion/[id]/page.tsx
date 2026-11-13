import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOperator } from "@/app/_authz/occasion";
import { buildLiveSnapshot } from "@/modules/participation";
import { PresentacionOcasion } from "@/modules/participation/components/PresentacionOcasion";
import { t } from "@/shared/copy";

// La consola de una ocasión en el proyector (ADR-181): para quien la opera.

export const metadata: Metadata = { title: t("T-586") };

export default async function PresentarOcasionPage({
  params,
}: PageProps<"/presentar/ocasion/[id]">) {
  const { id } = await params;
  const found = await requireOperator(id, `/presentar/ocasion/${id}`);
  if (!found) notFound();
  const snapshot = await buildLiveSnapshot(found.occasion);
  return (
    <>
      <h1 className="presentacion-titulo">{found.occasion.title}</h1>
      <PresentacionOcasion
        occasionId={id}
        initial={{ qrSvg: snapshot.qrSvg, code: snapshot.code, counts: snapshot.counts }}
        labels={{ scan: t("T-586"), registered: t("T-5003") }}
      />
    </>
  );
}
