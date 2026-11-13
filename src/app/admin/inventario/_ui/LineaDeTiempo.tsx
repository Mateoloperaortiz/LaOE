import { withQuery } from "@/app/_lib/search";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { addDays } from "@/shared/lib/dates-pure";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { chipClass } from "@/shared/ui/Chip";
import { TIMELINE_DAYS, type TimelineRow } from "./timeline";

const TONE = {
  exito: "bg-exito-fondo text-exito",
  info: "bg-info-fondo text-estado-tinta",
  error: "bg-error-fondo text-error",
} as const;

const LANE_REM = 1.75;

type Props = {
  rows: TimelineRow[];
  days: string[];
  today: string;
  timeZone: string;
  /** La pantalla donde vive, para moverse por semanas y abrir una reserva. */
  basePath: string;
};

// La línea de tiempo (ADR-191 regla 4), al estilo de un calendario de recursos: cada material es una
// fila, cada día una columna y cada reserva una barra que se abre en el detalle. La cuadrícula se
// desplaza de lado en el celular; los nombres se quedan quietos.
export function LineaDeTiempo({ rows, days, today, timeZone, basePath }: Props) {
  const [titulo, anteriores, siguientes, hoyLabel] = tList("T-5065");
  const first = days[0] ?? today;
  const dayLabel = new Intl.DateTimeFormat("es-CO", {
    timeZone,
    weekday: "short",
    day: "numeric",
  });
  const columns = `minmax(9rem, 12rem) repeat(${days.length}, minmax(2.75rem, 1fr))`;
  return (
    <section aria-labelledby="linea-de-tiempo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="linea-de-tiempo" className="titulo-seccion">
          {titulo}
        </h2>
        <nav aria-label={titulo} className="flex flex-wrap gap-1">
          <Link
            href={withQuery(basePath, { desde: addDays(first, -TIMELINE_DAYS) })}
            scroll={false}
            className={chipClass({ area: "operacion" })}
          >
            {anteriores}
          </Link>
          <Link
            href={basePath}
            scroll={false}
            aria-current={first === today ? "true" : undefined}
            className={chipClass({ area: "operacion", selected: first === today })}
          >
            {hoyLabel}
          </Link>
          <Link
            href={withQuery(basePath, { desde: addDays(first, TIMELINE_DAYS) })}
            scroll={false}
            className={chipClass({ area: "operacion" })}
          >
            {siguientes}
          </Link>
        </nav>
      </div>
      <div className="overflow-x-auto rounded-tarjeta bg-superficie sombra-flota">
        <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: columns }}>
          <div className="sticky left-0 z-10 border-b border-linea-tenue bg-superficie p-2" />
          {days.map((day) => (
            <div
              key={day}
              className={`border-b border-l border-linea-tenue p-2 text-center text-xs ${
                day === today ? "font-semibold text-titulo" : "text-tinta-secundaria"
              }`}
            >
              {dayLabel.format(new Date(`${day}T12:00:00Z`))}
            </div>
          ))}
          {rows.map((row) => (
            <div key={row.itemId} className="contents">
              <div className="sticky left-0 z-10 flex items-center border-b border-linea-tenue bg-superficie p-2 text-sm font-semibold">
                {row.itemName}
              </div>
              <div
                className="relative border-b border-linea-tenue"
                style={{
                  gridColumn: `2 / span ${days.length}`,
                  height: `${row.lanes * LANE_REM + 0.5}rem`,
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 grid"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.map((day) => (
                    <span
                      key={day}
                      className={`border-l border-linea-tenue ${day === today ? "bg-relleno" : ""}`}
                    />
                  ))}
                </div>
                {row.bars.map((bar) => (
                  <Link
                    key={`${bar.reservationId}-${row.itemId}`}
                    href={withQuery(basePath, { reserva: bar.reservationId })}
                    scroll={false}
                    aria-label={t("T-5066", {
                      frente: bar.scopeLabel,
                      persona: bar.requesterName,
                      cantidad: String(bar.quantity),
                      material: row.itemName,
                      desde: formatDateTime(bar.startsAt),
                      hasta: formatDateTime(bar.endsAt),
                    })}
                    className={`absolute flex min-h-6 items-center overflow-hidden whitespace-nowrap rounded-full px-2 text-xs font-semibold no-underline ${TONE[bar.tone]}`}
                    style={{
                      left: `calc(${(bar.start / days.length) * 100}% + 2px)`,
                      width: `calc(${(bar.span / days.length) * 100}% - 4px)`,
                      top: `${bar.lane * LANE_REM + 0.25}rem`,
                    }}
                  >
                    {bar.quantity} · {bar.scopeLabel}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
