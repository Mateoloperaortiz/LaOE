import { randomUUID } from "node:crypto";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single, withQuery } from "@/app/_lib/search";
import { listReservations } from "@/modules/inventory";
import { t } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { Field, TextInput } from "@/shared/ui/Field";
import { SplitView } from "@/shared/ui/SplitView";
import { EmptyState } from "@/shared/ui/States";
import { WorkTable } from "@/shared/ui/WorkTable";
import { reservationTone, statusLabel } from "../_ui/estado";
import { InventarioMarco } from "../_ui/Marco";
import { cancelReservationAction, writeOffAction } from "../actions";

// Las reservas y los préstamos de toda la OE (ADR-150 reglas 4 y 6): quién reservó, quién recoge, el
// estado y lo que falta por devolver. La VP cancela una reserva con su motivo y declara una pérdida con
// su resolución; ninguna de las dos devuelve existencias por sí sola.

export default async function InventarioPrestamosPage({
  searchParams,
}: PageProps<"/admin/inventario/prestamos">) {
  const { session } = await requireInventoryAccess("/admin/inventario/prestamos", "MANAGE");
  const [query, reservations] = await Promise.all([
    searchParams,
    listReservations(session.personId),
  ]);
  const selected = reservations.find((row) => row.id === single(query.reserva));
  const close = "/admin/inventario/prestamos";

  const detail = selected ? (
    <DetailPanel
      title={selected.scopeLabel}
      eyebrow={<Badge tone={reservationTone(selected)}>{statusLabel(selected)}</Badge>}
      closeHref={close}
      closeLabel={t("T-4407")}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-tinta-secundaria">{t("T-4323")}</dt>
        <dd>{selected.requesterName}</dd>
        <dt className="text-tinta-secundaria">{t("T-4324")}</dt>
        <dd>{selected.collectorName}</dd>
        <dt className="text-tinta-secundaria">{t("T-4305")}</dt>
        <dd>{formatDateTime(selected.startsAt)}</dd>
        <dt className="text-tinta-secundaria">{t("T-4306")}</dt>
        <dd>{formatDateTime(selected.endsAt)}</dd>
      </dl>
      <ul className="flex list-none flex-col gap-1 p-0 text-sm">
        {selected.lines.map((line) => (
          <li key={line.id}>
            {line.quantity} × {line.itemName}
            {selected.status === "OUT" && line.outstanding > 0
              ? ` · ${t("T-4377")}: ${line.outstanding}`
              : ""}
          </li>
        ))}
      </ul>
      {selected.conflicted ? <p className="text-sm text-error">{t("T-4502")}</p> : null}
      {selected.canCancel ? (
        <form action={cancelReservationAction} className="flex flex-col gap-3">
          <input type="hidden" name="reservationId" value={selected.id} />
          <Field id="cancelar-motivo" label={t("T-4326")}>
            <TextInput id="cancelar-motivo" name="reason" minLength={5} maxLength={1000} required />
          </Field>
          <Button type="submit" variant="secundaria" area="operacion" className="self-start">
            {t("T-4325")}
          </Button>
        </form>
      ) : null}
      {selected.status === "OUT"
        ? selected.lines
            .filter((line) => line.outstanding > 0)
            .map((line) => (
              <form key={line.id} action={writeOffAction} className="flex flex-col gap-3">
                <input type="hidden" name="reservationId" value={selected.id} />
                <input type="hidden" name="requestId" value={randomUUID()} />
                <input type="hidden" name="lineId" value={line.id} />
                <input type="hidden" name="mode" value={line.mode} />
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 font-semibold">
                    {t("T-4401")} · {line.itemName}
                  </legend>
                  {line.mode === "UNIT" ? (
                    line.units.map((unit) => (
                      <label key={unit.id} className="flex items-center gap-2 text-sm">
                        <input name="unitId" type="checkbox" value={unit.id} />
                        <code>{unit.barcode}</code>
                      </label>
                    ))
                  ) : (
                    <Field id={`perdida-${line.id}`} label={t("T-4313")}>
                      <TextInput
                        id={`perdida-${line.id}`}
                        name="quantity"
                        type="number"
                        min="1"
                        max={line.outstanding}
                        step="1"
                        required
                      />
                    </Field>
                  )}
                </fieldset>
                <Field id={`perdida-${line.id}-motivo`} label={t("T-4326")}>
                  <TextInput
                    id={`perdida-${line.id}-motivo`}
                    name="reason"
                    minLength={5}
                    maxLength={1000}
                    required
                  />
                </Field>
                <Button type="submit" variant="secundaria" area="operacion" className="self-start">
                  {t("T-4401")}
                </Button>
              </form>
            ))
        : null}
    </DetailPanel>
  ) : null;

  return (
    <InventarioMarco active="prestamos" query={query}>
      <SplitView
        list={
          <WorkTable
            caption={t("T-4320")}
            columns={[
              { key: "frente", label: t("T-4315") },
              { key: "reservo", label: t("T-4323") },
              { key: "recoge", label: t("T-4324") },
              { key: "desde", label: t("T-4305") },
              { key: "hasta", label: t("T-4306") },
              { key: "estado", label: t("T-4362") },
            ]}
            rows={reservations.map((row) => ({
              id: row.id,
              current: row.id === selected?.id,
              cells: {
                frente: (
                  <Link
                    href={withQuery(close, { reserva: row.id })}
                    scroll={false}
                    className="font-semibold text-tinta no-underline hover:underline"
                  >
                    {row.scopeLabel}
                  </Link>
                ),
                reservo: row.requesterName,
                recoge: row.collectorName,
                desde: formatDateTime(row.startsAt),
                hasta: formatDateTime(row.endsAt),
                estado: <Badge tone={reservationTone(row)}>{statusLabel(row)}</Badge>,
              },
            }))}
            empty={<EmptyState title={t("T-4321")} />}
          />
        }
        detail={detail}
      />
    </InventarioMarco>
  );
}
