/** biome-ignore-all lint/suspicious/noArrayIndexKey: El corpus es inmutable durante la lectura; filas, celdas y párrafos no tienen estado y conservan su posición. */
import Link from "next/link";
import {
  type ArticleRow,
  chaptersOf,
  DOCUMENT_KINDS,
  type DocumentBlock,
  type DocumentRow,
  getMedia,
  Imagen,
} from "@/modules/content";
import { BarraTitulo, Cartel } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

type Props = {
  detail: {
    document: Pick<DocumentRow, "id" | "title" | "kind" | "version">;
    articles: ArticleRow[];
  };
  backHref: string;
  backLabel: string;
  /** Enlace al PDF original; nombra la pantalla donde está montado el lector (ADR-113, regla 10). */
  pdfHref: string;
  /** Se volvió a esta pantalla porque el PDF pidió sesión: el lector avisa junto al enlace. */
  downloadPending: boolean;
  showHeader?: boolean;
};

function blocksOf(unit: ArticleRow): DocumentBlock[] {
  return unit.blocks.length > 0 ? unit.blocks : [{ type: "text", text: unit.body }];
}

function unitTitle(unit: ArticleRow): string {
  return unit.unitType === "SECTION"
    ? unit.title
    : `${t("T-397", { n: unit.number ?? "" })}${unit.title ? ` · ${unit.title}` : ""}`;
}

/** Lector único de normativa: quien lo compone ya resolvió el acceso y el onboarding. */
export async function DocumentReader({
  detail,
  backHref,
  backLabel,
  pdfHref,
  downloadPending,
  showHeader = true,
}: Props) {
  const kinds = tList("T-394");
  const chapters = chaptersOf(detail.articles);
  const imageIds = [
    ...new Set(
      detail.articles.flatMap((unit) =>
        blocksOf(unit).flatMap((block) => (block.type === "image" ? [block.assetId] : [])),
      ),
    ),
  ];
  const images = new Map(
    await Promise.all(imageIds.map(async (id) => [id, await getMedia(id)] as const)),
  );
  const articleCount = detail.articles.filter((unit) => unit.unitType === "ARTICLE").length;
  return (
    <div className="flex min-w-0 flex-col gap-10" lang="es">
      {showHeader ? (
        <Cartel
          variante="navy"
          nivel="h1"
          tamano="hero"
          eyebrow={kinds[DOCUMENT_KINDS.indexOf(detail.document.kind)] ?? detail.document.kind}
          titulo={<span className="block hyphens-auto break-words">{detail.document.title}</span>}
          subtitulo={t("T-395", { v: detail.document.version })}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <a href={pdfHref} target="_blank" rel="noreferrer" className="boton-secundario">
          {t("T-396")}
        </a>
        <p className="text-sm text-tinta-suave">
          {t("T-1281", {
            articulos: articleCount,
            secciones: detail.articles.length - articleCount,
          })}
        </p>
        {downloadPending ? (
          <output className="block w-full text-sm font-semibold text-titulo">{t("T-3211")}</output>
        ) : null}
      </div>
      {chapters.length === 0 ? <p>{t("T-1286")}</p> : null}
      {chapters.length > 0 ? (
        <nav aria-labelledby="indice" className="flex flex-col gap-4">
          <BarraTitulo color="amarillo" className="self-start">
            <span id="indice">{t("T-398")}</span>
          </BarraTitulo>
          <ol className="flex list-none flex-col gap-4 p-0">
            {chapters.map((chapter) => (
              <li key={chapter.key} className="flex min-w-0 flex-col gap-2">
                {chapter.title ? <p className="eyebrow text-xs">{chapter.title}</p> : null}
                <ul className="flex list-none flex-col gap-2 p-0">
                  {chapter.articles.map((unit) => (
                    <li key={unit.articleKey}>
                      <a href={`#${unit.articleKey}`} className="break-words text-sm">
                        {unitTitle(unit)}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {chapters.map((chapter) => (
        <section key={chapter.key} className="flex min-w-0 flex-col gap-8">
          {chapter.title ? (
            <BarraTitulo color="azul" className="max-w-full self-start break-words">
              {chapter.title}
            </BarraTitulo>
          ) : null}
          {chapter.articles.map((unit) => {
            const Heading = chapter.title ? "h3" : "h2";
            const title = unitTitle(unit);
            return (
              <article
                key={unit.articleKey}
                id={unit.articleKey}
                className="flex min-w-0 scroll-mt-24 flex-col gap-4"
              >
                <Heading className="text-display-md break-words">{title}</Heading>
                {unit.pages.length > 0 ? (
                  <p className="text-xs text-tinta-suave">
                    {t("T-1280", { paginas: unit.pages.join(", ") })}
                  </p>
                ) : null}
                {blocksOf(unit).map((block, index) => {
                  const key = `${unit.articleKey}-${index}`;
                  if (block.type === "table") {
                    const caption = t("T-1289", { seccion: title });
                    return (
                      <section
                        key={key}
                        aria-label={caption}
                        // biome-ignore lint/a11y/noNoninteractiveTabindex: región desplazable que el teclado debe poder recorrer
                        tabIndex={0}
                        className="max-w-full overflow-x-auto rounded-xl border border-borde"
                      >
                        <table className="w-full text-left text-sm">
                          <caption className="sr-only">{caption}</caption>
                          <thead className="bg-fondo-suave">
                            <tr>
                              {block.headers.map((header, column) => (
                                <th key={`${key}-h-${column}`} scope="col" className="px-4 py-3">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, rowIndex) => (
                              <tr key={`${key}-r-${rowIndex}`} className="border-t border-borde">
                                {row.map((cell, column) => (
                                  <td
                                    key={`${key}-r-${rowIndex}-${column}`}
                                    className="whitespace-pre-line px-4 py-3 align-top"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </section>
                    );
                  }
                  if (block.type === "image") {
                    const asset = images.get(block.assetId);
                    return (
                      <figure key={key} className="flex max-w-4xl flex-col gap-2">
                        {asset?.status === "READY" ? (
                          <Imagen
                            asset={asset}
                            alt={block.alt}
                            sizes="(min-width: 1024px) 896px, 100vw"
                            className="h-auto w-full rounded-xl border border-borde bg-white"
                          />
                        ) : (
                          <p>{t("T-1288")}</p>
                        )}
                        <figcaption className="text-sm text-tinta-suave">{block.alt}</figcaption>
                      </figure>
                    );
                  }
                  return block.text.split(/\n\n+/).map((paragraph, paragraphIndex) => (
                    <p
                      key={`${key}-${paragraphIndex}`}
                      className="max-w-prose whitespace-pre-line break-words leading-relaxed"
                    >
                      {paragraph}
                    </p>
                  ));
                })}
              </article>
            );
          })}
        </section>
      ))}
      <Link href={backHref} className="self-start">
        {backLabel}
      </Link>
    </div>
  );
}
