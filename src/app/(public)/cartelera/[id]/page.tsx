import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { excerpt, getPublicAnnouncement } from "@/modules/content";
import { BarraTitulo } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";

// Un anuncio de la cartelera: la URL que se comparte (y que usará el push de la fase 6).

const ID = /^[a-z0-9]{10,40}$/;

async function cargar(id: string) {
  return ID.test(id) ? getPublicAnnouncement(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/cartelera/[id]">): Promise<Metadata> {
  const { id } = await params;
  const anuncio = await cargar(id);
  return anuncio ? { title: anuncio.title, description: excerpt(anuncio.body, 160) } : {};
}

export default async function AnuncioPage({ params }: PageProps<"/cartelera/[id]">) {
  const { id } = await params;
  const anuncio = await cargar(id);
  if (!anuncio) {
    notFound();
  }
  return (
    <article className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <p className="eyebrow">
        {t("T-313", { fecha: formatDate(anuncio.publishedAt) })}
        {anuncio.pinned ? ` · ${t("T-303")}` : null}
      </p>
      <BarraTitulo nivel="h1" color="azul" className="self-start">
        {anuncio.title}
      </BarraTitulo>
      <Markdown source={anuncio.body} />
      <Link href="/cartelera" className="boton-secundario self-start">
        {t("T-316")}
      </Link>
    </article>
  );
}
