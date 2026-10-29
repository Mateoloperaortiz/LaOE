import Link from "next/link";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { getAvailability, listReservations } from "@/modules/inventory";
import { Feedback } from "@/modules/inventory/components/Feedback";
import { ReservationCalendar } from "@/modules/inventory/components/ReservationCalendar";
import { ReservationComposer } from "@/modules/inventory/components/ReservationComposer";
import { ReservationList } from "@/modules/inventory/components/ReservationList";
import { listAllCommittees, listInternalRoster } from "@/modules/people";
import { t } from "@/shared/copy";
import { utcToBogotaInput } from "@/shared/lib/dates";
import { cancelReservationAction, reserveAction } from "./actions";
import { inventoryRange } from "./range";
import "@/modules/inventory/components/inventory.css";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { session, context } = await requireInventoryAccess("/app/inventario");
  const query = await searchParams;
  const now = new Date();
  const next = new Date(now.getTime() + 86_400_000);
  const day = utcToBogotaInput(next).slice(0, 10);
  const startsAt = typeof query.desde === "string" ? query.desde : `${day}T08:00`;
  const endsAt = typeof query.hasta === "string" ? query.hasta : `${day}T18:00`;
  const range = inventoryRange(startsAt, endsAt);
  const valid = range !== null;
  const [items, reservations] = await Promise.all([
    range
      ? getAvailability({ startsAt: range.start.toISOString(), endsAt: range.end.toISOString() })
      : [],
    listReservations(session.personId),
  ]);
  const grants = context.sources.filter(
    (source) => source.granted && source.personId === session.personId,
  );
  const committees = grants.some((source) => source.committeeId) ? await listAllCommittees() : [];
  const sources = await Promise.all(
    grants.map(async (source) => {
      const committee = committees.find((entry) => entry.id === source.committeeId);
      const roster = committee ? await listInternalRoster(committee.slug) : null;
      const delegates = source.editionId
        ? []
        : (roster?.members ?? [])
            .filter((member) => member.status === "ACTIVE")
            .map((member) => ({ id: member.personId, name: member.fullName }));
      return {
        value: `${source.kind}:${source.id}`,
        label: source.label,
        delegates: delegates.filter((member) => member.id !== session.personId),
      };
    }),
  );
  const matching = range
    ? reservations.filter((row) => row.startsAt < range.end && row.endsAt > range.start)
    : [];
  const own = reservations.filter(
    (row) => row.requesterId === session.personId && !matching.some((entry) => entry.id === row.id),
  );
  return (
    <div className="inventory">
      <header className="inventory-heading">
        <div>
          <h1>{t("T-4300")}</h1>
          <p>{t("T-4304")}</p>
        </div>
        <div className="inventory-actions">
          {context.canManage ? (
            <Link href="/admin/inventario" className="boton-secundario">
              {t("T-4303")}
            </Link>
          ) : null}
          {context.canOperate ? (
            <Link href="/app/cml" className="boton-secundario">
              {t("T-4301")}
            </Link>
          ) : null}
        </div>
      </header>
      <Feedback
        error={typeof query.error === "string" ? query.error : !valid ? t("T-4408") : undefined}
        saved={typeof query.guardado === "string" ? query.guardado : undefined}
      />
      <form className="inventory-fields" method="get">
        <label className="inventory-field">
          <span>{t("T-4305")}</span>
          <input type="datetime-local" name="desde" defaultValue={startsAt} required />
        </label>
        <label className="inventory-field">
          <span>{t("T-4306")}</span>
          <input type="datetime-local" name="hasta" defaultValue={endsAt} required />
        </label>
        <div className="inventory-actions">
          <button type="submit" className="boton-calido">
            {t("T-4307")}
          </button>
        </div>
      </form>
      <p className="inventory-muted">{t("T-4387")}</p>
      {valid && items.length > 0 && context.canReserve && sources.length > 0 ? (
        <ReservationComposer
          action={reserveAction}
          items={items}
          sources={sources}
          startsAt={startsAt}
          endsAt={endsAt}
        />
      ) : (
        <section>
          <h2>{t("T-4332")}</h2>
          {items.length === 0 ? (
            <p>{t("T-4358")}</p>
          ) : (
            <table className="inventory-table inventory-table-responsive">
              <thead>
                <tr>
                  <th scope="col">{t("T-4308")}</th>
                  <th scope="col">{t("T-4309")}</th>
                  <th scope="col">{t("T-4311")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td data-label={t("T-4309")}>{item.available}</td>
                    <td data-label={t("T-4311")}>
                      {item.location} · {item.box}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!context.canReserve ? <p className="inventory-muted">{t("T-4319")}</p> : null}
        </section>
      )}
      <section>
        <h2>{t("T-4320")}</h2>
        <ReservationCalendar
          month={valid ? startsAt.slice(0, 7) : day.slice(0, 7)}
          selectedDay={startsAt.slice(0, 10)}
          rows={reservations}
        />
        <ReservationList rows={matching} cancelAction={cancelReservationAction} />
      </section>
      {own.length > 0 ? (
        <section>
          <h2>{t("T-4405")}</h2>
          <ReservationList rows={own} cancelAction={cancelReservationAction} />
        </section>
      ) : null}
    </div>
  );
}
