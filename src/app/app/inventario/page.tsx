import { createId } from "@paralleldrive/cuid2";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { single } from "@/app/_lib/search";
import { listEventApprovals } from "@/modules/finance";
import {
  getAvailability,
  listLoanApprovals,
  listReservations,
  remainingLoanLines,
} from "@/modules/inventory";
import { getPersonRecord, listAllCommittees, listInternalRoster } from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { buttonClass } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/States";
import { reservationTone, statusLabel } from "../../admin/inventario/_ui/estado";
import { Carrito } from "./_ui/Carrito";
import { LoanDetails } from "./_ui/LoanDetails";
import { cancelReservationAction, requestLoanAction, reserveAction } from "./actions";
import { inventoryRange } from "./range";

// El inventario en Mi OE (ADR-150 regla 4, ADR-191 regla 5), pensado para el celular: eliges las
// fechas, ves lo disponible y quién tiene qué, y si tienes el permiso de la VP armas la reserva como un
// carrito. Lo que reservaste queda abajo, con su estado.

type Reservation = Awaited<ReturnType<typeof listReservations>>[number];

function Reserva({ row, own }: { row: Reservation; own: boolean }) {
  return (
    <li className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4 sombra-flota">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold">{row.scopeLabel}</p>
        <Badge tone={reservationTone(row)}>{statusLabel(row)}</Badge>
      </div>
      <p className="text-sm text-tinta-secundaria">
        {formatDateTime(row.startsAt)} · {formatDateTime(row.endsAt)}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
        <dt className="text-tinta-secundaria">{t("T-4323")}</dt>
        <dd>{row.requesterName}</dd>
        <dt className="text-tinta-secundaria">{t("T-4324")}</dt>
        <dd>{row.collectorName}</dd>
      </dl>
      <ul className="flex list-none flex-col p-0 text-sm">
        {row.lines.map((line) => (
          <li key={line.id}>
            {line.quantity} × {line.itemName}
            {row.status === "OUT" && line.outstanding > 0
              ? ` · ${t("T-4377")}: ${line.outstanding}`
              : ""}
          </li>
        ))}
      </ul>
      {own && row.canCancel ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{t("T-4325")}</summary>
          <form action={cancelReservationAction} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="reservationId" value={row.id} />
            <label className="flex flex-col gap-1 text-sm">
              <span>{t("T-4326")}</span>
              <input name="reason" maxLength={1000} className="campo min-h-11" />
            </label>
            <button type="submit" className="boton-secundario self-start">
              {t("T-4325")}
            </button>
          </form>
        </details>
      ) : null}
    </li>
  );
}

export default async function InventarioPage({ searchParams }: PageProps<"/app/inventario">) {
  const { session, context } = await requireInventoryAccess("/app/inventario");
  const query = await searchParams;
  const day = utcToBogotaInput(new Date(Date.now() + 86_400_000)).slice(0, 10);
  const startsAt = single(query.desde) || `${day}T08:00`;
  const endsAt = single(query.hasta) || `${day}T18:00`;
  const range = inventoryRange(startsAt, endsAt);
  const [items, reservations, who] = await Promise.all([
    range
      ? getAvailability({ startsAt: range.start.toISOString(), endsAt: range.end.toISOString() })
      : [],
    listReservations(session.personId),
    getPersonRecord(session.personId),
  ]);
  const grants = context.sources.filter(
    (source) => source.granted && source.personId === session.personId,
  );
  const committees = grants.some((source) => source.committeeId) ? await listAllCommittees() : [];
  // En un comité recoge quien reservó o alguien activo de su comité; en un macroevento, solo quien
  // reservó (ADR-150 regla 6).
  const sources = await Promise.all(
    grants.map(async (source) => {
      const committee = committees.find((entry) => entry.id === source.committeeId);
      const roster = committee ? await listInternalRoster(committee.slug) : null;
      const delegates = source.editionId
        ? []
        : (roster?.members ?? [])
            .filter((member) => member.status === "ACTIVE" && member.personId !== session.personId)
            .map((member) => ({ id: member.personId, name: member.fullName }));
      const approved = source.committeeId
        ? await listEventApprovals({ committeeId: source.committeeId, status: "APPROVED" })
        : [];
      return {
        value: `${source.kind}:${source.id}`,
        label: source.label,
        delegates,
        macro: !!source.editionId,
        events: approved.map(({ id, title, eventOn }) => ({ id, title, eventOn })),
      };
    }),
  );
  const ownApprovals = await listLoanApprovals({ requesterId: session.personId });
  const labels = tList("T-5189");
  const live = (row: Reservation) => row.status === "CONFIRMED" || row.status === "OUT";
  const inRange = range
    ? reservations.filter(
        (row) => live(row) && row.startsAt < range.end && row.endsAt > range.start,
      )
    : [];
  const mine = reservations.filter(
    (row) =>
      live(row) && (row.requesterId === session.personId || row.collectorId === session.personId),
  );
  const error = single(query.error) || (range ? "" : t("T-4408"));
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1>{t("T-4300")}</h1>
        <p className="text-tinta-secundaria">{t("T-4304")}</p>
        {context.canManage || context.canOperate ? (
          <div className="flex flex-wrap gap-2">
            {context.canManage ? (
              <Link href="/admin/inventario" className={buttonClass({ variant: "secundaria" })}>
                {t("T-4303")}
              </Link>
            ) : null}
            {context.canOperate ? (
              <Link
                href="/admin/inventario/entregas"
                className={buttonClass({ variant: "secundaria" })}
              >
                {t("T-4301")}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "solicitud" ? (
        <Banner tone="exito" title={labels[17]} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={t("T-4302")} />
      ) : null}
      {!who?.cardUid ? (
        <Banner tone="aviso" title={t("T-4104")}>
          <Link href="/app/ajustes#mis-datos" className="font-semibold">
            {t("T-4105")}
          </Link>
        </Banner>
      ) : null}
      <form method="get" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-4305")}</span>
          <input
            type="datetime-local"
            name="desde"
            defaultValue={startsAt}
            required
            className="campo min-h-11"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-4306")}</span>
          <input
            type="datetime-local"
            name="hasta"
            defaultValue={endsAt}
            required
            className="campo min-h-11"
          />
        </label>
        <button type="submit" className="boton-secundario min-h-11">
          {t("T-4307")}
        </button>
        <p className="text-sm text-tinta-secundaria sm:col-span-3">{t("T-4387")}</p>
      </form>
      <section aria-labelledby="disponibles" className="flex flex-col gap-3">
        <h2 id="disponibles">{t("T-4309")}</h2>
        {!range ? null : items.length === 0 ? (
          <EmptyState title={t("T-4358")} />
        ) : context.canReserve && sources.length > 0 ? (
          <Carrito
            action={requestLoanAction}
            requestKey={createId()}
            items={items}
            sources={sources}
            startsAt={startsAt}
            endsAt={endsAt}
          />
        ) : (
          <>
            <ul className="flex list-none flex-col gap-2 p-0">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-tarjeta bg-superficie p-3 sombra-flota"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-tinta-secundaria">
                      {item.location} · {item.box}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{item.available}</p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-tinta-secundaria">{t("T-4319")}</p>
          </>
        )}
      </section>
      {ownApprovals.length > 0 && (
        <section className="grid gap-3">
          <h2>{labels[0]}</h2>
          {
            await Promise.all(
              ownApprovals.map(async (row) => {
                const source = sources.find((s) => s.value === `${row.sourceKind}:${row.sourceId}`);
                const remaining =
                  row.status === "APPROVED" && source && row.endsAt > new Date()
                    ? await remainingLoanLines(row)
                    : [];
                return (
                  <article
                    key={row.id}
                    id={row.id}
                    className="grid gap-3 rounded-tarjeta bg-superficie p-4"
                  >
                    <LoanDetails row={row} />
                    {source && remaining.some((line) => line.remaining > 0) && (
                      <form action={reserveAction} className="grid gap-2">
                        <input type="hidden" name="requestKey" value={createId()} />
                        <input type="hidden" name="approvalId" value={row.id} />
                        <input type="hidden" name="source" value={source.value} />
                        <input
                          type="hidden"
                          name="startsAt"
                          value={utcToBogotaInput(row.startsAt)}
                        />
                        <input type="hidden" name="endsAt" value={utcToBogotaInput(row.endsAt)} />
                        {remaining
                          .filter((line) => line.remaining > 0)
                          .map((line) => (
                            <label key={line.itemId}>
                              {tList("T-5193")[6]} · {line.name}
                              <input type="hidden" name="itemId" value={line.itemId} />
                              <input
                                className="campo"
                                name={`quantity-${line.itemId}`}
                                type="number"
                                min={0}
                                max={line.remaining}
                                defaultValue={line.remaining}
                              />
                            </label>
                          ))}
                        <label>
                          {t("T-4316")}
                          <select name="collectorId" className="campo">
                            <option value="">{t("T-4317")}</option>
                            {source.delegates.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="boton-primario">
                          {labels[16]}
                        </button>
                      </form>
                    )}
                  </article>
                );
              }),
            )
          }
        </section>
      )}
      <section aria-labelledby="reservadas" className="flex flex-col gap-3">
        <h2 id="reservadas">{t("T-4320")}</h2>
        {inRange.length === 0 ? (
          <p className="text-tinta-secundaria">{t("T-4321")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {inRange.map((row) => (
              <Reserva key={row.id} row={row} own={false} />
            ))}
          </ul>
        )}
      </section>
      {mine.length > 0 ? (
        <section aria-labelledby="mis-reservas" className="flex flex-col gap-3">
          <h2 id="mis-reservas">{t("T-4405")}</h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {mine.map((row) => (
              <Reserva key={row.id} row={row} own={row.requesterId === session.personId} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
