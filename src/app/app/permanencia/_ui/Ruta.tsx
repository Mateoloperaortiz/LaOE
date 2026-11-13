import type { CommitteeResult } from "@/modules/permanence";
import { t, tLabels } from "@/shared/copy";
import { CircleCheckIcon } from "@/shared/ui/icons/CircleCheckIcon";
import { CircleDotIcon } from "@/shared/ui/icons/CircleDotIcon";
import { routeStops, STOP_STATES } from "./route-stops";

// La ruta de permanencia (plan maestro §7, ola 2, inspirada en Duolingo): por cada comité, sus
// criterios como paradas de un camino que termina en la meta, el umbral. Solo presentación: los números
// son los mismos del desglose que va debajo.

export function Ruta({
  results,
  committeeNames,
}: {
  results: CommitteeResult[];
  committeeNames: Map<string, string>;
}) {
  const states = tLabels("T-4943", STOP_STATES);
  const titulo = t("T-4942");
  if (results.length === 0) return null;
  return (
    <section aria-labelledby="ruta-titulo" className="flex flex-col gap-4">
      <h2 id="ruta-titulo" className="titulo-seccion">
        {titulo}
      </h2>
      {results.map((result) => {
        const stops = routeStops(result);
        const reached = result.total >= result.threshold;
        return (
          <div key={result.committeeId} className="ruta">
            {results.length > 1 ? (
              <p className="font-semibold">{committeeNames.get(result.committeeId) ?? ""}</p>
            ) : null}
            <ol className="ruta-camino">
              {stops.map((stop) => (
                <li key={stop.key} className="ruta-parada" data-estado={stop.state}>
                  <span className="ruta-marca" aria-hidden="true">
                    {stop.state === "done" ? (
                      <CircleCheckIcon size={20} />
                    ) : (
                      <CircleDotIcon size={20} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">{stop.label}</span>
                    <span className="text-secundario text-tinta-secundaria">
                      {states[stop.state]} · {t("T-4944", { n: stop.achieved, peso: stop.weight })}
                    </span>
                  </span>
                </li>
              ))}
              <li className="ruta-parada ruta-meta" data-estado={reached ? "done" : "todo"}>
                <span className="ruta-marca" aria-hidden="true">
                  {reached ? <CircleCheckIcon size={20} /> : <CircleDotIcon size={20} />}
                </span>
                <span className="font-semibold">
                  {t("T-4945", { umbral: result.threshold, total: Math.round(result.total) })}
                </span>
              </li>
            </ol>
          </div>
        );
      })}
    </section>
  );
}
