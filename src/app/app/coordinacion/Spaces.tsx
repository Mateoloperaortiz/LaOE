import { createId } from "@paralleldrive/cuid2";
import { spaceBookingsFor, spaceCatalogFor } from "@/modules/inventory";
import { APPOINTMENT_KINDS, boardApprovalLabel } from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { APP_TIME_ZONE, addDays, atHourIn } from "@/shared/lib/dates-pure";
import { addSpaceAction, decideSpaceAction, requestSpaceAction, setSpaceAction } from "./actions";

export async function Spaces({ personId, day }: { personId: string; day: string }) {
  const [catalog, bookings] = await Promise.all([
    spaceCatalogFor(
      personId,
      atHourIn(APP_TIME_ZONE, day, 0),
      atHourIn(APP_TIME_ZONE, addDays(day, 7), 0),
    ),
    spaceBookingsFor(personId),
  ]);
  if (!catalog.manager && !catalog.sources.length && !bookings.length) return null;
  const [
    catalogTitle,
    spaceName,
    addSpace,
    retireSpace,
    restoreSpace,
    available,
    retired,
    emptyCatalog,
  ] = tList("T-5196");
  const [
    requestTitle,
    spaceLabel,
    logisticsLabel,
    startsLabel,
    endsLabel,
    purposeLabel,
    sendRequest,
    requestsTitle,
    emptyRequests,
    decisionNote,
    approveSpace,
    rejectRequest,
  ] = tList("T-5197");
  const seats = tLabels("T-444", APPOINTMENT_KINDS);
  const offered = catalog.spaces.filter((s) => s.active);
  return (
    <section className="grid gap-5" aria-labelledby="espacios">
      <h2 id="espacios">{catalogTitle}</h2>
      {catalog.manager && (
        <>
          <form action={addSpaceAction} className="flex flex-wrap items-end gap-3">
            <label>
              {spaceName}
              <input className="campo block" name="name" required minLength={2} maxLength={120} />
            </label>
            <button className="boton-secundario" type="submit">
              {addSpace}
            </button>
          </form>
          {catalog.spaces.map((space) => (
            <form
              id={space.id}
              action={setSpaceAction}
              className="flex flex-wrap items-center gap-3"
              key={space.id}
            >
              <span>
                {space.name} · {space.active ? available : retired}
              </span>
              <input type="hidden" name="id" value={space.id} />
              <input type="hidden" name="active" value={space.active ? "0" : "1"} />
              <button className="boton-secundario" type="submit">
                {space.active ? retireSpace : restoreSpace}
              </button>
            </form>
          ))}
        </>
      )}
      {!catalog.spaces.length && <p>{emptyCatalog}</p>}
      {catalog.booked.length > 0 && (
        <div>
          <h3>{tList("T-5202")[0]}</h3>
          <ul>
            {catalog.booked.map((row) => (
              <li key={row.id}>
                {row.name} · {formatDateTime(row.startsAt)} – {formatDateTime(row.endsAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {catalog.sources.length > 0 && offered.length > 0 && (
        <form action={requestSpaceAction} className="grid gap-3 rounded-tarjeta bg-superficie p-4">
          <h3>{requestTitle}</h3>
          <input type="hidden" name="id" value={createId()} />
          <label>
            {spaceLabel}
            <select className="campo w-full" required name="space">
              {offered.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {logisticsLabel}
            <select className="campo w-full" required name="source">
              {catalog.sources.map((s) => (
                <option key={s.id} value={s.kind + ":" + s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3">
            <label>
              {startsLabel}
              <input className="campo block" type="datetime-local" required name="startsAt" />
            </label>
            <label>
              {endsLabel}
              <input className="campo block" type="datetime-local" required name="endsAt" />
            </label>
          </div>
          <label>
            {purposeLabel}
            <textarea
              className="campo w-full"
              required
              name="purpose"
              minLength={3}
              maxLength={1000}
            />
          </label>
          <button className="boton-primario justify-self-start" type="submit">
            {sendRequest}
          </button>
        </form>
      )}
      <h3>{requestsTitle}</h3>
      {!bookings.length && <p>{emptyRequests}</p>}
      {bookings.map((r) => (
        <article id={r.id} key={r.id} className="grid gap-2 rounded-tarjeta bg-superficie p-4">
          <h4>
            {r.name} · {boardApprovalLabel(r.status)}
          </h4>
          <p>
            {r.scopeLabel} · {r.requesterName}
          </p>
          <p>
            {formatDateTime(r.startsAt)} – {formatDateTime(r.endsAt)}
          </p>
          <p>{r.purpose}</p>
          {r.decidedAt && (
            <p>
              {r.decidedByName} · {r.decidedAs === "PRESIDENCY" ? seats.PRESIDENT : seats.VP_ADMIN}{" "}
              · {formatDateTime(r.decidedAt)} {r.decisionNote}
            </p>
          )}
          {catalog.manager && r.status === "PENDING" && (
            <form action={decideSpaceAction} className="grid gap-2">
              <input type="hidden" name="id" value={r.id} />
              <label>
                {decisionNote}
                <textarea className="campo w-full" name="note" maxLength={500} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="boton-primario" name="decision" value="APPROVED">
                  {approveSpace}
                </button>
                <button type="submit" className="boton-secundario" name="decision" value="REJECTED">
                  {rejectRequest}
                </button>
              </div>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
