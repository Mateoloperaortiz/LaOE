import type { listReservations } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { formatDateRange } from "@/shared/lib/dates";

const statusCodes = {
  CONFIRMED: "T-4327",
  OUT: "T-4328",
  RETURNED: "T-4329",
  CANCELLED: "T-4330",
} as const;

export function ReservationList({
  rows,
  cancelAction,
}: {
  rows: Awaited<ReturnType<typeof listReservations>>;
  cancelAction?: (form: FormData) => Promise<void>;
}) {
  if (rows.length === 0) return <p className="inventory-muted">{t("T-4321")}</p>;
  return rows.map((row) => (
    <article key={row.id} className="inventory-reservation">
      <div className="inventory-heading">
        <h3>{row.scopeLabel}</h3>
        <span className="inventory-state">{t(statusCodes[row.status])}</span>
      </div>
      <p>
        <time dateTime={row.startsAt.toISOString()}>
          {formatDateRange(row.startsAt, row.endsAt)}
        </time>
      </p>
      <div className="inventory-summary">
        <dl>
          <div>
            <dt>{t("T-4323")}</dt>
            <dd>{row.requesterName}</dd>
          </div>
          <div>
            <dt>{t("T-4324")}</dt>
            <dd>{row.collectorName}</dd>
          </div>
        </dl>
      </div>
      {row.overdue ? <p className="inventory-notice">{t("T-4331")}</p> : null}
      {row.conflicted ? <p className="inventory-notice">{t("T-4502")}</p> : null}
      <ul>
        {row.lines.map((line) => (
          <li key={line.id}>
            {line.quantity} × {line.itemName}
            {row.status === "OUT" ? ` · ${t("T-4377")}: ${line.outstanding}` : ""}
          </li>
        ))}
      </ul>
      {row.canCancel && cancelAction ? (
        <details>
          <summary>{t("T-4325")}</summary>
          <form action={cancelAction} className="inventory-fields">
            <input type="hidden" name="reservationId" value={row.id} />
            <label className="inventory-field">
              <span>{t("T-4326")}</span>
              <input name="reason" maxLength={500} required />
            </label>
            <div className="inventory-actions">
              <button type="submit" className="boton-secundario">
                {t("T-4325")}
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  ));
}
