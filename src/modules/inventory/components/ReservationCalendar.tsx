import Link from "next/link";
import type { listReservations } from "@/modules/inventory";
import { t, tList } from "@/shared/copy";
import { reservationOnCalendarDay } from "./calendar-pure";

export function ReservationCalendar({
  month,
  selectedDay,
  rows,
}: {
  month: string;
  selectedDay: string;
  rows: Awaited<ReturnType<typeof listReservations>>;
}) {
  const first = new Date(`${month}-01T12:00:00Z`);
  if (!Number.isFinite(first.getTime())) return null;
  const offset = (first.getUTCDay() + 6) % 7;
  const day = new Date(first);
  day.setUTCDate(day.getUTCDate() - offset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const current = new Date(day);
    current.setUTCDate(current.getUTCDate() + index);
    const key = current.toISOString().slice(0, 10);
    return {
      key,
      number: current.getUTCDate(),
      bookings: rows.filter(
        (row) => row.status !== "CANCELLED" && reservationOnCalendarDay(row, key),
      ),
    };
  });
  const shift = (delta: number) => {
    const target = new Date(first);
    target.setUTCMonth(target.getUTCMonth() + delta);
    const key = target.toISOString().slice(0, 10);
    return `/app/inventario?desde=${key}T08:00&hasta=${key}T18:00`;
  };
  return (
    <div className="inventory-calendar-region">
      <nav className="inventory-heading" aria-label={t("T-4320")}>
        <Link href={shift(-1)}>{t("T-4388")}</Link>
        <Link href={shift(1)}>{t("T-4389")}</Link>
      </nav>
      <table className="inventory-table inventory-calendar">
        <caption>
          {new Intl.DateTimeFormat("es-CO", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(first)}
        </caption>
        <thead>
          <tr>
            {tList("T-4354").map((name) => (
              <th key={name} scope="col">
                <abbr title={name}>{name.slice(0, 3)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={days[week * 7]?.key}>
              {days.slice(week * 7, week * 7 + 7).map((entry) => (
                <td key={entry.key} data-other-month={!entry.key.startsWith(month)}>
                  <Link
                    href={`/app/inventario?desde=${entry.key}T08:00&hasta=${entry.key}T18:00`}
                    aria-current={selectedDay === entry.key ? "date" : undefined}
                    aria-label={`${entry.key} · ${t("T-4390")}`}
                  >
                    {entry.number}
                  </Link>
                  <ul>
                    {entry.bookings.slice(0, 2).map((booking) => (
                      <li key={booking.id}>
                        {booking.requesterName} · {booking.scopeLabel}
                      </li>
                    ))}
                    {entry.bookings.length > 2 ? <li>+{entry.bookings.length - 2}</li> : null}
                  </ul>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
