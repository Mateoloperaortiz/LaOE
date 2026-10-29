import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInventoryAccess } from "@/app/_authz/inventory";
import { cancelReservationAction } from "@/app/app/inventario/actions";
import { listEditions, listMacroevents } from "@/modules/events";
import { requireAdminActor } from "@/modules/identity";
import {
  getIncidentForReview,
  listIncidents,
  listReservations,
  readCatalog,
} from "@/modules/inventory";
import { Feedback } from "@/modules/inventory/components/Feedback";
import { ReservationList } from "@/modules/inventory/components/ReservationList";
import { getPeopleByIds, listActiveMemberRefs, listAllCommittees } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { t, tLabels } from "@/shared/copy";
import { APP_TIME_ZONE, dateKeyIn, formatDateTime, todayKey } from "@/shared/lib/dates";
import {
  adjustStockAction,
  createItemAction,
  directorAction,
  grantAction,
  manageIncidentAction,
  referIncidentAction,
  updateItemAction,
  writeOffAction,
} from "./actions";
import "@/modules/inventory/components/inventory.css";

export default async function InventoryAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = await searchParams;
  if (typeof requested.incidencia === "string" || typeof requested.persona === "string") {
    await requireAdminActor("/admin/inventario");
    if (typeof requested.incidencia !== "string" || typeof requested.persona !== "string")
      notFound();
    const incident = await getIncidentForReview(requested.incidencia, requested.persona);
    if (!incident || incident.status !== "REFERRED") notFound();
    return (
      <div className="inventory">
        <header>
          <h1>{t("T-4352")}</h1>
        </header>
        <article className="inventory-panel">
          <h2>
            {incident.personName} · {incident.scopeLabel}
          </h2>
          <p>{incident.note}</p>
          <h3>{t("T-4353")}</h3>
          <p>{incident.management}</p>
          <p>{t("T-4402")}</p>
          <Link
            className="boton-calido"
            href={`/admin/personas/${encodeURIComponent(incident.personId)}?tab=membresia`}
          >
            {t("T-4356")}
          </Link>
        </article>
      </div>
    );
  }
  const { session, context } = await requireInventoryAccess("/admin/inventario", "MANAGE");
  const [
    query,
    items,
    reservations,
    incidents,
    members,
    committees,
    editions,
    macroevents,
    terms,
    people,
  ] = await Promise.all([
    searchParams,
    readCatalog(),
    listReservations(session.personId),
    listIncidents(session.personId),
    listActiveMemberRefs(),
    listAllCommittees(),
    listEditions({ q: "", page: 1, pageSize: 200 }),
    listMacroevents(),
    listAllTerms(),
    getPeopleByIds(context.sources.map((source) => source.personId)),
  ]);
  const macroIds = new Set(macroevents.map((event) => event.id));
  const eligibleEditions = editions.rows.filter(
    (edition) =>
      macroIds.has(edition.eventId) &&
      terms.some((term) => {
        const day = dateKeyIn(APP_TIME_ZONE, edition.startsAt);
        return term.startsOn <= day && term.endsOn >= day && term.endsOn >= todayKey();
      }),
  );
  const incidentLabels = tLabels("T-4403", ["OPEN", "RESOLVED", "REFERRED"] as const);
  return (
    <div className="inventory">
      <header className="inventory-heading">
        <h1>{t("T-4303")}</h1>
        <div className="inventory-actions">
          <Link className="boton-secundario" href="/app/inventario">
            {t("T-4300")}
          </Link>
          <Link className="boton-secundario" href="/app/cml">
            {t("T-4301")}
          </Link>
          <Link className="boton-secundario" href="/admin/inventario/etiquetas">
            {t("T-4350")}
          </Link>
        </div>
      </header>
      <Feedback
        error={typeof query.error === "string" ? query.error : undefined}
        saved={typeof query.guardado === "string" ? query.guardado : undefined}
      />
      <section id="materiales">
        <h2>{t("T-4332")}</h2>
        {items.length === 0 ? (
          <p>{t("T-4385")}</p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="inventory-panel">
              <div className="inventory-heading">
                <h3>{item.name}</h3>
                <Link href={`/admin/inventario/etiquetas?material=${item.id}`}>{t("T-4404")}</Link>
              </div>
              <div className="inventory-summary">
                <dl>
                  <div>
                    <dt>{t("T-4310")}</dt>
                    <dd>{item.total}</dd>
                  </div>
                  <div>
                    <dt>{t("T-4399")}</dt>
                    <dd>{item.quarantined}</dd>
                  </div>
                  <div>
                    <dt>{t("T-4361")}</dt>
                    <dd>
                      <code>{item.code}</code>
                    </dd>
                  </div>
                </dl>
              </div>
              <details>
                <summary>{t("T-4342")}</summary>
                <form action={updateItemAction} className="inventory-fields">
                  <input type="hidden" name="itemId" value={item.id} />
                  <label className="inventory-field">
                    <span>{t("T-4334")}</span>
                    <input
                      name="name"
                      defaultValue={item.name}
                      minLength={2}
                      maxLength={160}
                      required
                    />
                  </label>
                  <label className="inventory-field">
                    <span>{t("T-4311")}</span>
                    <input name="location" defaultValue={item.location} maxLength={160} required />
                  </label>
                  <label className="inventory-field">
                    <span>{t("T-4312")}</span>
                    <input name="box" defaultValue={item.box} maxLength={160} required />
                  </label>
                  <label>
                    <input type="checkbox" name="active" defaultChecked={item.active} />{" "}
                    {t("T-4397")}
                  </label>
                  <div className="inventory-actions">
                    <button type="submit" className="boton-calido">
                      {t("T-4342")}
                    </button>
                  </div>
                </form>
              </details>
              <details>
                <summary>{t("T-4339")}</summary>
                <form action={adjustStockAction} className="inventory-fields">
                  <input type="hidden" name="itemId" value={item.id} />
                  <label className="inventory-field">
                    <span>{t("T-4340")}</span>
                    <input
                      name="delta"
                      type="number"
                      step="1"
                      min={item.mode === "UNIT" ? 0 : -10000}
                      max="10000"
                      defaultValue="0"
                      required
                    />
                  </label>
                  {item.mode === "QUANTITY" ? (
                    <label className="inventory-field">
                      <span>{t("T-4341")}</span>
                      <input
                        name="releaseQuarantine"
                        type="number"
                        min="0"
                        max={item.quarantined}
                        step="1"
                        defaultValue="0"
                      />
                    </label>
                  ) : null}
                  <label className="inventory-field">
                    <span>{t("T-4326")}</span>
                    <input name="reason" minLength={5} maxLength={1000} required />
                  </label>
                  <div className="inventory-actions">
                    <button type="submit" className="boton-calido">
                      {t("T-4339")}
                    </button>
                  </div>
                </form>
                {item.mode === "UNIT" ? (
                  <div className="inventory-grid">
                    {(["remove", "release"] as const).map((intent) => (
                      <form key={intent} action={adjustStockAction} className="inventory-panel">
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="intent" value={intent} />
                        <fieldset>
                          <legend>{t(intent === "remove" ? "T-4401" : "T-4341")}</legend>
                          {item.units
                            .filter(
                              (unit) =>
                                unit.state === (intent === "remove" ? "AVAILABLE" : "QUARANTINED"),
                            )
                            .map((unit) => (
                              <label key={unit.id} className="block">
                                <input type="checkbox" name="unitId" value={unit.id} />{" "}
                                <code>{unit.barcode}</code>
                              </label>
                            ))}
                        </fieldset>
                        <label className="inventory-field">
                          <span>{t("T-4326")}</span>
                          <input name="reason" minLength={5} maxLength={1000} required />
                        </label>
                        <button type="submit" className="boton-secundario">
                          {t("T-4342")}
                        </button>
                      </form>
                    ))}
                  </div>
                ) : null}
              </details>
            </article>
          ))
        )}
        <details className="inventory-panel" open={items.length === 0}>
          <summary>{t("T-4333")}</summary>
          <form action={createItemAction} className="inventory-fields">
            <label className="inventory-field">
              <span>{t("T-4334")}</span>
              <input name="name" minLength={2} maxLength={160} required />
            </label>
            <label className="inventory-field">
              <span>{t("T-4335")}</span>
              <select name="mode" defaultValue="UNIT">
                <option value="UNIT">{t("T-4336")}</option>
                <option value="QUANTITY">{t("T-4337")}</option>
              </select>
            </label>
            <label className="inventory-field">
              <span>{t("T-4310")}</span>
              <input name="total" type="number" min="1" max="10000" step="1" required />
            </label>
            <label className="inventory-field">
              <span>{t("T-4311")}</span>
              <input name="location" maxLength={160} required />
            </label>
            <label className="inventory-field">
              <span>{t("T-4312")}</span>
              <input name="box" maxLength={160} required />
            </label>
            <div className="inventory-actions">
              <button type="submit" className="boton-calido">
                {t("T-4338")}
              </button>
            </div>
          </form>
        </details>
      </section>
      <section id="directores">
        <h2>{t("T-4346")}</h2>
        <form action={directorAction} className="inventory-fields">
          <label className="inventory-field">
            <span>{t("T-4348")}</span>
            <select name="scope" required>
              <option value="">{t("T-4348")}</option>
              {committees
                .filter((committee) => committee.status !== "INACTIVE")
                .map((committee) => (
                  <option key={committee.id} value={`COMMITTEE:${committee.id}`}>
                    {committee.name}
                  </option>
                ))}
              {eligibleEditions.map((edition) => (
                <option key={edition.id} value={`MACROEVENT:${edition.id}`}>
                  {edition.eventName} · {edition.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inventory-field">
            <span>{t("T-4347")}</span>
            <select name="personId" required>
              <option value="">{t("T-4347")}</option>
              {members
                .filter((member) => !member.anonymized)
                .map((member) => (
                  <option key={member.personId} value={member.personId}>
                    {member.fullName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <input name="coDirector" type="checkbox" /> {t("T-4349")}
          </label>
          <div className="inventory-actions">
            <button type="submit" name="assigned" value="true" className="boton-calido">
              {t("T-4395")}
            </button>
            <button type="submit" name="assigned" value="false" className="boton-secundario">
              {t("T-4396")}
            </button>
          </div>
        </form>
      </section>
      <section id="permisos">
        <h2>{t("T-4343")}</h2>
        {context.sources.length === 0 ? (
          <p>{t("T-4394")}</p>
        ) : (
          <table className="inventory-table inventory-table-responsive">
            <thead>
              <tr>
                <th scope="col">{t("T-4347")}</th>
                <th scope="col">{t("T-4348")}</th>
                <th scope="col">{t("T-4362")}</th>
                <th scope="col">{t("T-4343")}</th>
              </tr>
            </thead>
            <tbody>
              {context.sources.map((source) => (
                <tr key={`${source.kind}:${source.id}`}>
                  <td>{people.get(source.personId)?.fullName ?? ""}</td>
                  <td>{source.label}</td>
                  <td>{t(source.granted ? "T-4359" : "T-4360")}</td>
                  <td>
                    <form action={grantAction}>
                      <input type="hidden" name="sourceKind" value={source.kind} />
                      <input type="hidden" name="sourceId" value={source.id} />
                      <input type="hidden" name="enabled" value={String(!source.granted)} />
                      <button type="submit" className="boton-secundario">
                        {t(source.granted ? "T-4345" : "T-4344")}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section id="novedades">
        <h2>{t("T-4352")}</h2>
        <p>{t("T-4402")}</p>
        {incidents.length === 0 ? (
          <p>{t("T-4398")}</p>
        ) : (
          incidents.map((incident) => (
            <article key={incident.id} className="inventory-panel">
              <div className="inventory-heading">
                <h3>
                  {incident.personName} · {incident.scopeLabel}
                </h3>
                <span className="inventory-state">{incidentLabels[incident.status]}</span>
              </div>
              <p>
                <time dateTime={incident.createdAt.toISOString()}>
                  {formatDateTime(incident.createdAt)}
                </time>
              </p>
              <p>{incident.note}</p>
              <form action={manageIncidentAction} className="inventory-field">
                <input name="incidentId" type="hidden" value={incident.id} />
                <label className="inventory-field">
                  <span>{t("T-4353")}</span>
                  <textarea
                    name="management"
                    minLength={5}
                    maxLength={3000}
                    required
                    defaultValue={incident.management}
                  />
                </label>
                <div className="inventory-actions">
                  <button type="submit" name="intent" value="save" className="boton-secundario">
                    {t("T-4342")}
                  </button>
                  {incident.status !== "REFERRED" ? (
                    <button
                      type="submit"
                      name="intent"
                      value="resolve"
                      className="boton-secundario"
                    >
                      {t("T-4355")}
                    </button>
                  ) : null}
                </div>
              </form>
              {incident.status !== "REFERRED" ? (
                <form action={referIncidentAction} className="mt-4">
                  <input name="incidentId" type="hidden" value={incident.id} />
                  <button
                    type="submit"
                    disabled={!incident.management.trim()}
                    className="boton-calido"
                  >
                    {t("T-4356")}
                  </button>
                </form>
              ) : null}
            </article>
          ))
        )}
      </section>
      <section>
        <h2>{t("T-4320")}</h2>
        <ReservationList rows={reservations} cancelAction={cancelReservationAction} />
        {reservations
          .filter((reservation) => reservation.status === "OUT")
          .map((reservation) => (
            <details key={reservation.id} className="inventory-panel">
              <summary>
                {t("T-4401")} · {reservation.requesterName} · {reservation.scopeLabel}
              </summary>
              {reservation.lines
                .filter((line) => line.outstanding > 0)
                .map((line) => (
                  <form key={line.id} action={writeOffAction} className="inventory-fields">
                    <input type="hidden" name="reservationId" value={reservation.id} />
                    <input type="hidden" name="requestId" value={randomUUID()} />
                    <input type="hidden" name="lineId" value={line.id} />
                    <input type="hidden" name="mode" value={line.mode} />
                    <fieldset>
                      <legend>{line.itemName}</legend>
                      {line.mode === "UNIT" ? (
                        line.units.map((unit) => (
                          <label key={unit.id} className="block">
                            <input name="unitId" type="checkbox" value={unit.id} />{" "}
                            <code>{unit.barcode}</code>
                          </label>
                        ))
                      ) : (
                        <label className="inventory-field">
                          <span>{t("T-4313")}</span>
                          <input
                            name="quantity"
                            type="number"
                            min="1"
                            max={line.outstanding}
                            step="1"
                            required
                          />
                        </label>
                      )}
                    </fieldset>
                    <label className="inventory-field">
                      <span>{t("T-4326")}</span>
                      <input name="reason" minLength={5} maxLength={1000} required />
                    </label>
                    <div className="inventory-actions">
                      <button type="submit" className="boton-secundario">
                        {t("T-4401")}
                      </button>
                    </div>
                  </form>
                ))}
            </details>
          ))}
      </section>
    </div>
  );
}
