import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { listReservations, readCatalog } from "@/modules/inventory";
import { Feedback } from "@/modules/inventory/components/Feedback";
import { MovementScanner } from "@/modules/inventory/components/MovementScanner";
import { t } from "@/shared/copy";
import { checkoutAction, recordIncidentAction, returnAction } from "./actions";
import "@/modules/inventory/components/inventory.css";

export default async function CmlPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session } = await requireInventoryAccess("/app/cml", "OPERATE");
  const [query, reservations, items] = await Promise.all([
    searchParams,
    listReservations(session.personId),
    readCatalog(),
  ]);
  const operating = reservations.filter(
    (reservation) => reservation.status === "CONFIRMED" || reservation.status === "OUT",
  );
  const withHistory = reservations.filter(
    (reservation) => reservation.status === "OUT" || reservation.status === "RETURNED",
  );
  return (
    <div className="inventory">
      <header className="inventory-heading">
        <h1>{t("T-4301")}</h1>
        <Link href="/app/inventario" className="boton-secundario">
          {t("T-4407")}
        </Link>
      </header>
      <Feedback
        error={typeof query.error === "string" ? query.error : undefined}
        saved={typeof query.guardado === "string" ? query.guardado : undefined}
      />
      {operating.length > 0 ? (
        <MovementScanner
          reservations={operating}
          items={items}
          initialRequestId={randomUUID()}
          checkout={checkoutAction}
          receive={returnAction}
        />
      ) : (
        <p>{t("T-4321")}</p>
      )}
      {withHistory.length > 0 ? (
        <section>
          <h2>{t("T-4381")}</h2>
          <form action={recordIncidentAction} className="inventory-fields">
            <label className="inventory-field">
              <span>{t("T-4320")}</span>
              <select name="reservationId" required>
                {withHistory.map((reservation) => (
                  <option key={reservation.id} value={reservation.id}>
                    {reservation.collectorName} · {reservation.scopeLabel} ·{" "}
                    {reservation.id.slice(-6)}
                  </option>
                ))}
              </select>
            </label>
            <label className="inventory-field">
              <span>{t("T-4380")}</span>
              <textarea name="note" minLength={5} maxLength={2000} required />
            </label>
            <div className="inventory-actions">
              <button type="submit" className="boton-calido">
                {t("T-4381")}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
