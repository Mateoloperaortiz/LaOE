import type { Metadata } from "next";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import {
  CALENDAR_LAYERS,
  type CalendarLayer,
  type CalendarView,
  daysCovered,
  parseDayKey,
  parseLayers,
  shiftMonth,
  visibleDays,
} from "@/app/admin/_kit/calendar-grid";
import { listEditionsBetween } from "@/modules/events";
import { listReservations } from "@/modules/inventory";
import { dayKeyFor, listOccasionsBetween } from "@/modules/participation";
import { t, tLabels, tList } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { addDays, atHourIn } from "@/shared/lib/dates-pure";
import { AppLink as Link } from "@/shared/ui/AppLink";

// El Calendario de la Operación (ADR-169 regla 1): semana o mes, con capas por tipo que se prenden y se
// apagan en la dirección. Junta lo que hoy vive en pantallas separadas: actividades, asambleas y
// sesiones de macroeventos (ocasiones) y las ediciones de los macroeventos. Cada elemento lleva a su
// pantalla. ADMIN y la junta ven todo; la dirección de un comité ve las ocasiones de sus comités, y
// todos ven las asambleas y las ediciones, que son de toda la OE.

export const metadata: Metadata = { title: tList("T-4918")[0] ?? "" };

const APP_TZ = "America/Bogota";
const MAX_PER_DAY = 3;

type Item = {
  id: string;
  layer: CalendarLayer;
  title: string;
  time: string | null;
  href: string;
  days: string[];
};

export default async function CalendarioPage({ searchParams }: PageProps<"/admin/calendario">) {
  const roles = await requireAdminAreaRoles("/admin/calendario");
  const search = await searchParams;
  const view: CalendarView = single(search.vista) === "mes" ? "mes" : "semana";
  const today = dayKeyFor(new Date());
  const anchor = parseDayKey(single(search.fecha)) ?? today;
  const layers = parseLayers(search.capas);
  const days = visibleDays(view, anchor);
  const first = days[0] ?? anchor;
  const last = days[days.length - 1] ?? anchor;
  const from = atHourIn(APP_TZ, first, 0);
  const to = atHourIn(APP_TZ, addDays(last, 1), 0);
  const seesAll = roles.isAdmin || roles.isBoard;
  const mine = new Set(roles.committees.map((item) => item.committee.id));
  const [occasions, editions, reservations] = await Promise.all([
    layers.some(
      (layer) => layer === "ACTIVITY" || layer === "ASSEMBLY" || layer === "EDITION_SESSION",
    )
      ? listOccasionsBetween(from, to)
      : [],
    layers.includes("EDITION") ? listEditionsBetween(from, to) : [],
    // Las reservas son de toda la OE: cualquiera ve quién reservó y para qué frente (ADR-150 regla 4).
    layers.includes("RESERVATION") ? listReservations(roles.actor.personId) : [],
  ]);
  const items: Item[] = [
    ...occasions
      .filter((row) => layers.includes(row.kind))
      .filter(
        (row) =>
          seesAll ||
          row.kind === "ASSEMBLY" ||
          (row.committeeId !== null && mine.has(row.committeeId)),
      )
      .map((row) => ({
        id: row.id,
        layer: row.kind,
        title: row.title,
        time: formatTime(row.startsAt),
        href: `/admin/ocasiones/${row.id}`,
        days: [dayKeyFor(row.startsAt)],
      })),
    ...editions.map((row) => ({
      id: row.id,
      layer: "EDITION" as const,
      title: `${row.eventName} · ${row.name}`,
      time: null,
      href: `/admin/eventos/${row.eventId}/ediciones?editar=${row.id}`,
      days: daysCovered(dayKeyFor(row.startsAt), dayKeyFor(row.endsAt ?? row.startsAt), days),
    })),
    ...reservations
      .filter(
        (row) =>
          (row.status === "CONFIRMED" || row.status === "OUT") &&
          row.startsAt < to &&
          row.endsAt > from,
      )
      .map((row) => ({
        id: row.id,
        layer: "RESERVATION" as const,
        title: `${row.scopeLabel} · ${row.requesterName}`,
        time: formatTime(row.startsAt),
        href: roles.managesInventory
          ? `/admin/inventario/prestamos?reserva=${row.id}`
          : "/app/inventario",
        days: daysCovered(
          dayKeyFor(row.startsAt),
          dayKeyFor(new Date(row.endsAt.getTime() - 1)),
          days,
        ),
      })),
  ];
  const byDay = new Map<string, Item[]>();
  for (const item of items) {
    for (const day of item.days) byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const layerLabels = tLabels("T-4919", CALENDAR_LAYERS);
  const [titulo, semanaLabel, mesLabel, hoyLabel, anterior, siguiente, capasLabel, aplicar] =
    tList("T-4918");
  const weekdays = tList("T-4920");
  const masLabel = (n: number) => t("T-4921", { n });
  const href = (params: Record<string, string>) => {
    const query = new URLSearchParams({
      vista: view,
      fecha: anchor,
      ...(layers.length < CALENDAR_LAYERS.length ? { capas: layers.join(",") } : {}),
      ...params,
    });
    return `/admin/calendario?${query}`;
  };
  const previous = view === "semana" ? addDays(anchor, -7) : shiftMonth(anchor, -1);
  const next = view === "semana" ? addDays(anchor, 7) : shiftMonth(anchor, 1);
  const month = anchor.slice(0, 7);
  const rangeLabel = new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    ...(view === "mes" ? { month: "long", year: "numeric" } : { day: "numeric", month: "long" }),
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="admin-page-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>{titulo}</h1>
          <p className="text-secundario text-tinta-secundaria">
            {view === "mes"
              ? rangeLabel.format(new Date(`${anchor}T12:00:00Z`))
              : `${rangeLabel.format(new Date(`${first}T12:00:00Z`))} – ${rangeLabel.format(new Date(`${last}T12:00:00Z`))}`}
          </p>
        </div>
        <nav aria-label={titulo} className="flex flex-wrap items-center gap-2">
          <Link
            href={href({ fecha: previous })}
            className="boton-secundario min-h-11 px-3 py-2 text-sm"
          >
            {anterior}
          </Link>
          <Link
            href={href({ fecha: today })}
            className="boton-secundario min-h-11 px-3 py-2 text-sm"
          >
            {hoyLabel}
          </Link>
          <Link
            href={href({ fecha: next })}
            className="boton-secundario min-h-11 px-3 py-2 text-sm"
          >
            {siguiente}
          </Link>
          <span className="admin-calendar-switch">
            <Link
              href={href({ vista: "semana" })}
              aria-current={view === "semana" ? "page" : undefined}
            >
              {semanaLabel}
            </Link>
            <Link href={href({ vista: "mes" })} aria-current={view === "mes" ? "page" : undefined}>
              {mesLabel}
            </Link>
          </span>
        </nav>
      </header>

      <form action="/admin/calendario" method="get" className="admin-calendar-layers">
        <input type="hidden" name="vista" value={view} />
        <input type="hidden" name="fecha" value={anchor} />
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="etiqueta-corta mr-2 text-tinta-secundaria">{capasLabel}</legend>
          {CALENDAR_LAYERS.map((layer) => (
            <label key={layer} className="admin-calendar-layer" data-capa={layer}>
              <input
                type="checkbox"
                name="capas"
                value={layer}
                defaultChecked={layers.includes(layer)}
              />
              {layerLabels[layer]}
            </label>
          ))}
          <button type="submit" className="boton-secundario min-h-9 px-3 py-1 text-sm">
            {aplicar}
          </button>
        </fieldset>
      </form>

      <div className="admin-calendar" data-vista={view}>
        {weekdays.map((label) => (
          <div key={label} className="admin-calendar-weekday" aria-hidden="true">
            {label}
          </div>
        ))}
        {days.map((day) => {
          const dayItems = byDay.get(day) ?? [];
          const shown = view === "mes" ? dayItems.slice(0, MAX_PER_DAY) : dayItems;
          const date = new Date(`${day}T12:00:00Z`);
          return (
            <section
              key={day}
              aria-label={new Intl.DateTimeFormat("es-CO", {
                timeZone: "UTC",
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(date)}
              className="admin-calendar-day"
              data-hoy={day === today ? "true" : undefined}
              data-fuera={view === "mes" && day.slice(0, 7) !== month ? "true" : undefined}
            >
              <p className="admin-calendar-date">{Number(day.slice(8, 10))}</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {shown.map((item) => (
                  <li key={`${item.id}-${day}`}>
                    <Link href={item.href} className="admin-calendar-item" data-capa={item.layer}>
                      {item.time ? <span className="admin-calendar-time">{item.time}</span> : null}
                      <span>{item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {dayItems.length > shown.length ? (
                <Link
                  href={href({ vista: "semana", fecha: day })}
                  className="text-xs font-semibold"
                >
                  {masLabel(dayItems.length - shown.length)}
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
