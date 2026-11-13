import type { Metadata } from "next";
import { listOpenOpportunitiesFor, OPPORTUNITY_KINDS } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { t, tLabels, tList } from "@/shared/copy";
import { bogotaHourToUtc, formatDate } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";

// Oportunidades de los aliados (ADR-186): las publicadas que no han cerrado, para miembros o para
// egresados (ADR-184) según a quién van. El enlace sale de la casa: la postulación es con el aliado.

export const metadata: Metadata = { title: tList("T-5020")[0] ?? "" };

export default async function OportunidadesPage() {
  const actor = await requireActor("/app/oportunidades");
  const items = await listOpenOpportunitiesFor(actor.access);
  const [titulo, intro, vacio, ver] = tList("T-5020");
  const kinds = tLabels("T-5018", OPPORTUNITY_KINDS);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
      </header>
      {items.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <article
              aria-labelledby={`oportunidad-${item.id}`}
              className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4"
            >
              <p className="etiqueta-corta text-tinta-secundaria">
                {[kinds[item.kind], item.organizationName].join(" · ")}
              </p>
              <h2 id={`oportunidad-${item.id}`} className="titulo-seccion">
                {item.title}
              </h2>
              {item.closesOn ? (
                <p className="text-secundario text-tinta-secundaria">
                  {t("T-5021", { fecha: formatDate(bogotaHourToUtc(item.closesOn, 12)) })}
                </p>
              ) : null}
              {item.description ? <Markdown source={item.description} /> : null}
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start font-semibold underline"
                >
                  {ver}
                </a>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
