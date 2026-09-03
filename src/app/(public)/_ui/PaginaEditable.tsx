import type { ReactNode } from "react";
import type { PublicPage } from "@/modules/content";
import { BarraTitulo, Elemento } from "@/shared/brand";
import { t } from "@/shared/copy";
import { Markdown } from "@/shared/ui/Markdown";

type Props = {
  pagina: PublicPage;
  children?: ReactNode;
};

// Página fija del portal: título con barra, cuerpo en Markdown o "en preparación" mientras esté en borrador.
export function PaginaEditable({ pagina, children }: Props) {
  const publicada = pagina.status === "PUBLISHED" && pagina.body.trim().length > 0;
  return (
    <article className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {pagina.title}
        </BarraTitulo>
      </header>
      {publicada ? (
        <Markdown source={pagina.body} />
      ) : (
        <div className="flex max-w-2xl items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
          <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
          <p className="text-lg">{t("T-300")}</p>
        </div>
      )}
      {children}
    </article>
  );
}
