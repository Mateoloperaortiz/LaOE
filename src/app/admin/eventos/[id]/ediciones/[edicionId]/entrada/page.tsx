import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEdition } from "@/modules/events";
import { ticketCounts } from "@/modules/forms";
import { requireAdminActor } from "@/modules/identity";
import { LectorCarnet } from "@/modules/participation/components/LectorCarnet";
import { t, tList } from "@/shared/copy";
import { scanTicketAction } from "./actions";

// La puerta de una edición (ADR-187, regla 8 de ADR-085): quien opera escanea la entrada propia de
// cada inscrito, también de quien no es de la OE. La primera lectura marca la llegada; la segunda dice
// a qué hora entró.

const ID = /^[a-z0-9-]{10,40}$/;

export const metadata: Metadata = { title: tList("T-5025")[0] ?? "" };

export default async function EntradaPage({
  params,
}: PageProps<"/admin/eventos/[id]/ediciones/[edicionId]/entrada">) {
  const { id, edicionId } = await params;
  await requireAdminActor(`/admin/eventos/${id}/ediciones/${edicionId}/entrada`);
  const edicion = ID.test(edicionId) ? await getEdition(edicionId) : null;
  if (!edicion || edicion.eventId !== id) {
    notFound();
  }
  const counts = await ticketCounts(edicion.id);
  const [titulo, explicacion] = tList("T-5025");
  const [scan, stop, upload] = tList("T-616");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="admin-page-title">
          {titulo} · {edicion.eventName} · {edicion.name}
        </h1>
        <p className="text-tinta-secundaria">{explicacion}</p>
      </header>
      <output className="block text-lg font-semibold">
        {t("T-5029", { adentro: counts.inside, total: counts.total })}
      </output>
      <section aria-label={scan} className="flex flex-col gap-3">
        <LectorCarnet
          labels={{
            scan: scan ?? "",
            stop: stop ?? "",
            upload: upload ?? "",
            cameraError: t("T-617"),
            photoError: t("T-3256"),
            scanError: t("T-3251"),
          }}
          onScan={scanTicketAction.bind(null, id, edicion.id)}
        />
      </section>
    </div>
  );
}
