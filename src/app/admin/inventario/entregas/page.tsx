import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single, withQuery } from "@/app/_lib/search";
import { listReservations, readCatalog } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { buttonClass } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/States";
import { reservationTone, statusLabel } from "../_ui/estado";
import { ConsolaEntrega } from "./_ui/ConsolaEntrega";
import { checkoutAction, recordIncidentAction, returnAction } from "./actions";

// Entregas y devoluciones (ADR-150 reglas 5 y 6, ADR-191 regla 6): la pantalla de campo del CML y de
// la VP. Sin una reserva abierta, lista lo que hay por entregar o recibir; con una, abre la consola.

export default async function EntregasPage({
  searchParams,
}: PageProps<"/admin/inventario/entregas">) {
  const { session } = await requireInventoryAccess("/admin/inventario/entregas", "OPERATE");
  const [query, reservations, items] = await Promise.all([
    searchParams,
    listReservations(session.personId),
    readCatalog(),
  ]);
  const operable = reservations.filter((row) => row.status === "CONFIRMED" || row.status === "OUT");
  const selected = reservations.find((row) => row.id === single(query.reserva));
  const places = Object.fromEntries(
    items.map((item) => [item.id, { location: item.location, box: item.box }]),
  );
  const error = single(query.error);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{t("T-4301")}</h1>
        {selected ? (
          <Link href="/admin/inventario/entregas" className="self-start text-sm font-semibold">
            {t("T-4407")}
          </Link>
        ) : (
          <p className="text-tinta-secundaria">{t("T-4382")}</p>
        )}
      </header>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      {selected ? (
        <>
          <section className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4 sombra-flota">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold">{selected.scopeLabel}</h2>
              <Badge tone={reservationTone(selected)}>{statusLabel(selected)}</Badge>
            </div>
            <p className="text-sm text-tinta-secundaria">
              {formatDateTime(selected.startsAt)} · {formatDateTime(selected.endsAt)}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-tinta-secundaria">{t("T-4323")}</dt>
              <dd>{selected.requesterName}</dd>
              <dt className="text-tinta-secundaria">{t("T-4324")}</dt>
              <dd className="font-semibold">{selected.collectorName}</dd>
            </dl>
          </section>
          {selected.status === "CONFIRMED" || selected.status === "OUT" ? (
            <ConsolaEntrega
              reservation={{
                id: selected.id,
                status: selected.status,
                collectorId: selected.collectorId,
                lines: selected.lines,
              }}
              places={places}
              checkout={checkoutAction}
              receive={returnAction}
            />
          ) : null}
          {selected.status === "OUT" || selected.status === "RETURNED" ? (
            <details className="rounded-tarjeta bg-superficie p-4 sombra-flota">
              <summary className="cursor-pointer font-semibold">{t("T-4381")}</summary>
              <form action={recordIncidentAction} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="reservationId" value={selected.id} />
                <label className="flex flex-col gap-1">
                  <span>{t("T-4380")}</span>
                  <textarea
                    name="note"
                    minLength={5}
                    maxLength={2000}
                    required
                    rows={3}
                    className="campo"
                  />
                </label>
                <button type="submit" className="boton-secundario self-start">
                  {t("T-4381")}
                </button>
              </form>
            </details>
          ) : null}
        </>
      ) : operable.length === 0 ? (
        <EmptyState title={t("T-4321")} />
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {operable.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4 sombra-flota"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold">{row.scopeLabel}</p>
                <Badge tone={reservationTone(row)}>{statusLabel(row)}</Badge>
              </div>
              <p className="text-sm text-tinta-secundaria">
                {t("T-4324")}: {row.collectorName} · {formatDateTime(row.startsAt)}
              </p>
              <Link
                href={withQuery("/admin/inventario/entregas", { reserva: row.id })}
                className={buttonClass({ area: "operacion", className: "self-start" })}
              >
                {t(row.status === "CONFIRMED" ? "T-4375" : "T-4376")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
