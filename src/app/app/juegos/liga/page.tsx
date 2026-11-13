import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { LEAGUE_TIERS, myLeague } from "@/modules/participation";
import { MomentoExito } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

// «Tu liga» (ADR-178): la tabla de la semana de la liga de la persona, con quienes tienen la actividad
// prendida (ADR-175). Si subió, la casa lo celebra esa semana con el momento de marca, que vibra una vez.

export const metadata: Metadata = { title: tList("T-4982")[0] ?? "" };

export default async function LigaPage() {
  const actor = await requireActor("/app/juegos/liga");
  const league = await myLeague(actor.personId);
  const [titulo, comoEntrar, tablaTitulo, comoSubir] = tList("T-4982");
  const tiers = tLabels("T-4983", LEAGUE_TIERS);
  if (!league) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p>{comoEntrar}</p>
        <Link href="/app/ajustes#notificaciones" className="boton-primario self-start">
          {tList("T-4965")[0]}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">
          {titulo} · {tiers[league.tier]}
        </h1>
        <p className="text-secundario text-tinta-secundaria">
          {t("T-4985", { n: league.myPoints })} · {comoSubir}
        </p>
      </header>
      {league.promoted ? (
        <section aria-live="polite" className="flex flex-col items-start gap-2">
          <p className="text-display-md">{t("T-4984", { liga: tiers[league.tier] ?? "" })}</p>
          <MomentoExito clave={`liga:${league.weekStart}`} />
        </section>
      ) : null}
      <section aria-labelledby="liga-tabla" className="flex flex-col gap-2">
        <h2 id="liga-tabla" className="titulo-seccion">
          {tablaTitulo}
        </h2>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {league.table.map((row, index) => (
            <li
              key={row.personId}
              className="flex items-center justify-between gap-3 rounded-control px-3 py-2"
              data-yo={row.me ? "true" : undefined}
              aria-current={row.me ? "true" : undefined}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-right tabular-nums text-tinta-secundaria">
                  {index + 1}
                </span>
                <span className={row.me ? "font-semibold" : undefined}>{row.name}</span>
              </span>
              <span className="tabular-nums">{row.points}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
