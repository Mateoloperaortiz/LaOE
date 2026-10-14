import type { Metadata } from "next";
import Link from "next/link";
import {
  DOCUMENT_KINDS,
  HIGHLIGHT,
  listPublishedDocuments,
  searchArticles,
} from "@/modules/content";
import { requireActor } from "@/modules/identity";
import { BarraTitulo, Cartel, feedVariant } from "@/shared/brand";
import { t, tLabels } from "@/shared/copy";
import { Vacio } from "../_ui/Vacio";

// Normativa (ADR-034 regla 9): los documentos publicados y un buscador sobre sus artículos.

export const metadata: Metadata = { title: t("T-389") };

/** Convierte los marcadores de ts_headline en <mark> sin HTML crudo. */
function resaltar(headline: string) {
  const parts = headline.split(HIGHLIGHT.start);
  return parts.flatMap((part, index) => {
    if (index === 0) {
      return [part];
    }
    const end = part.indexOf(HIGHLIGHT.end);
    if (end === -1) {
      return [part];
    }
    return [
      <mark
        key={`${index}-${part.slice(0, end)}`}
        className="rounded bg-oe-yellow px-0.5 text-oe-navy"
      >
        {part.slice(0, end)}
      </mark>,
      part.slice(end + HIGHLIGHT.end.length),
    ];
  });
}

export default async function NormativaPage({ searchParams }: PageProps<"/app/normativa">) {
  await requireActor("/app/normativa");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const [documents, hits] = await Promise.all([
    listPublishedDocuments(),
    q ? searchArticles(q) : Promise.resolve([]),
  ]);
  const kinds = tLabels("T-394", DOCUMENT_KINDS);
  const kindLabel = (kind: (typeof DOCUMENT_KINDS)[number]) => kinds[kind] ?? kind;
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-389")}</h1>
        <p className="max-w-prose text-lg">{t("T-130")}</p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 basis-72 flex-col gap-1 sm:grow-0">
          <label htmlFor="q" className="eyebrow text-xs">
            {t("T-390")}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            className="w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none"
          />
        </div>
        <button type="submit" className="boton-secundario">
          {t("T-250")}
        </button>
      </form>
      {q ? (
        <section aria-labelledby="resultados" className="flex flex-col gap-6">
          <BarraTitulo color="amarillo" className="self-start">
            <span id="resultados">{t("T-391", { q })}</span>
          </BarraTitulo>
          {hits.length === 0 ? (
            <Vacio texto={t("T-392")} elemento="asterisco" color="text-oe-navy" />
          ) : (
            <ol className="flex list-none flex-col gap-3 p-0">
              {hits.map((hit) => (
                <li
                  key={`${hit.documentId}-${hit.articleKey}`}
                  className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
                >
                  <Link
                    href={`/app/normativa/${hit.documentId}#${hit.articleKey}`}
                    className="text-display-md break-words"
                  >
                    {hit.documentTitle} ·{" "}
                    {hit.unitType === "SECTION" ? (
                      hit.title
                    ) : (
                      <>
                        {t("T-397", { n: hit.number ?? "" })}
                        {hit.title ? ` · ${hit.title}` : ""}
                      </>
                    )}
                  </Link>
                  <p className="text-sm">{resaltar(hit.headline)}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
      {documents.length === 0 ? (
        <Vacio texto={t("T-393")} elemento="estrella" color="text-oe-yellow" />
      ) : (
        <ul className="grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((item, index) => (
            <li key={item.id}>
              <Link href={`/app/normativa/${item.id}`} className="block no-underline">
                <Cartel
                  variante={feedVariant(index)}
                  nivel="h2"
                  eyebrow={kindLabel(item.kind)}
                  titulo={<span className="block break-words">{item.title}</span>}
                  subtitulo={t("T-395", { v: item.version })}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
