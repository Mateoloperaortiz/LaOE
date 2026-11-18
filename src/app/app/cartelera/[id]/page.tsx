import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { canReadCreativeBoard } from "@/app/_authz/creative";
import { getMemberAnnouncement } from "@/modules/content";
import { getActor, requireActor } from "@/modules/identity";
import { listCommitteesByIds } from "@/modules/people";
import { BarraTitulo, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Markdown } from "@/shared/ui/Markdown";

// Un anuncio de miembros o de comité dentro de Mi OE (ADR-038 regla 6): la URL que abre su push.

const ID = /^[a-z0-9]{10,40}$/;

const cargar = cache(async (id: string) => {
  const row = ID.test(id) ? await getMemberAnnouncement(id) : null;
  if (!row?.creativeApprovalId) return row;
  const actor = await getActor();
  return actor && row.committeeId && (await canReadCreativeBoard(actor, row.committeeId))
    ? row
    : null;
});

export async function generateMetadata({
  params,
}: PageProps<"/app/cartelera/[id]">): Promise<Metadata> {
  const { id } = await params;
  const anuncio = await cargar(id);
  return anuncio ? { title: anuncio.title } : {};
}

export default async function AnuncioInternoPage({ params }: PageProps<"/app/cartelera/[id]">) {
  const { id } = await params;
  await requireActor(`/app/cartelera/${id}`);
  const anuncio = await cargar(id);
  if (!anuncio) {
    notFound();
  }
  const [comite] = anuncio.committeeId ? await listCommitteesByIds([anuncio.committeeId]) : [];
  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow">{t("T-313", { fecha: formatDate(anuncio.publishedAt) })}</span>
        {anuncio.pinned ? <Insignia fondo="amarillo">{t("T-303")}</Insignia> : null}
        {anuncio.audience === "MEMBERS" ? <Insignia fondo="sky">{t("T-380")}</Insignia> : null}
        {comite ? (
          <Link href={`/app/comites/${comite.slug}`} className="no-underline">
            <Insignia fondo="navy">{comite.name}</Insignia>
          </Link>
        ) : null}
      </div>
      <BarraTitulo nivel="h1" color="naranja" className="self-start">
        {anuncio.title}
      </BarraTitulo>
      {anuncio.creativeApprovalId ? (
        <>
          {anuncio.body && <p className="whitespace-pre-wrap break-words">{anuncio.body}</p>}
          <a
            href={`/api/piezas/${anuncio.creativeApprovalId}`}
            download
            className="boton-primario self-start"
          >
            {tList("T-5182")[3]}
          </a>
        </>
      ) : (
        <Markdown source={anuncio.body} />
      )}
      <Link href="/app" className="boton-secundario self-start">
        {t("T-1094")}
      </Link>
    </article>
  );
}
