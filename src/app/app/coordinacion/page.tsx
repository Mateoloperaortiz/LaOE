import { single } from "@/app/_lib/search";
import { parseDayKey, visibleDays } from "@/app/admin/_kit/calendar-grid";
import { requireActor } from "@/modules/identity";
import { reportedConflictsFor, weeklyScheduleConflicts } from "@/modules/participation";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime, todayKey } from "@/shared/lib/dates";
import { reportConflictAction, resolveConflictAction } from "./actions";
import { Spaces } from "./Spaces";

export default async function CoordinationPage({ searchParams }: PageProps<"/app/coordinacion">) {
  const actor = await requireActor("/app/coordinacion");
  const search = await searchParams;
  const date = parseDayKey(single(search.fecha)) ?? todayKey();
  const day = visibleDays("semana", date)[0] ?? date;
  const [pairs, reported] = await Promise.all([
    weeklyScheduleConflicts(actor.personId, day),
    reportedConflictsFor(actor.personId),
  ]);
  const [
    pageTitle,
    weeklyTitle,
    weekOf,
    showWeek,
    attemptsPrompt,
    sendConflict,
    reportsTitle,
    resolutionPrompt,
    saveResolution,
    pending,
    resolved,
    emptyWeek,
    ,
    emptyReports,
  ] = tList("T-5195");
  const [, , , , saved] = tList("T-5201");
  const seats = tLabels("T-444", APPOINTMENT_KINDS);
  const reportedKeys = new Set(reported.map((r) => r.pairKey));
  const open = pairs.filter((p) => !reportedKeys.has(p.pairKey));
  return (
    <div className="grid gap-6">
      <h1>{pageTitle}</h1>
      {single(search.error) && <p role="alert">{single(search.error)}</p>}
      {single(search.guardado) && <output>{saved}</output>}
      <section aria-labelledby="cruces" className="grid gap-3">
        <h2 id="cruces">{weeklyTitle}</h2>
        <form className="flex flex-wrap items-end gap-3" action="/app/coordinacion" method="get">
          <label>
            {weekOf}
            <input className="campo block" type="date" required name="fecha" defaultValue={day} />
          </label>
          <button type="submit" className="boton-secundario">
            {showWeek}
          </button>
        </form>
        {!open.length && <p>{emptyWeek}</p>}
        {open.map((r) => (
          <form
            action={reportConflictAction}
            className="grid gap-2 rounded-tarjeta bg-superficie p-4"
            key={r.pairKey}
          >
            <h3>
              {r.firstTitle} · {r.secondTitle}
            </h3>
            <p>
              {formatDateTime(r.startsAt)} – {formatDateTime(r.endsAt)} · {seats[r.seat]}
            </p>
            <input type="hidden" name="fecha" value={day} />
            <input type="hidden" name="pairKey" value={r.pairKey} />
            <label>
              {attemptsPrompt}
              <textarea
                className="campo w-full"
                name="attempts"
                required
                minLength={3}
                maxLength={2000}
              />
            </label>
            <button type="submit" className="boton-secundario justify-self-start">
              {sendConflict}
            </button>
          </form>
        ))}
        <h3>{reportsTitle}</h3>
        {!reported.length && <p>{emptyReports}</p>}
        {reported.map((r) => (
          <article key={r.id} id={r.id} className="grid gap-2 rounded-tarjeta bg-superficie p-4">
            <h4>
              {r.firstTitle} · {r.secondTitle}
            </h4>
            <p>
              {r.resolvedAt ? resolved : pending} · {seats[r.seat]} · {formatDateTime(r.startsAt)} –{" "}
              {formatDateTime(r.endsAt)}
            </p>
            <p>
              {r.requesterName} · {r.attempts}
            </p>
            {r.resolvedAt && (
              <p>
                {r.resolvedByName} ·{" "}
                {r.resolvedAs === "PRESIDENCY" ? seats.PRESIDENT : seats[r.seat]} ·{" "}
                {formatDateTime(r.resolvedAt)}
                <br />
                {r.resolution}
              </p>
            )}
            {!r.resolvedAt && r.canResolve && (
              <form action={resolveConflictAction} className="grid gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="fecha" value={day} />
                <label>
                  {resolutionPrompt}
                  <textarea
                    className="campo w-full"
                    name="resolution"
                    required
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <button type="submit" className="boton-primario justify-self-start">
                  {saveResolution}
                </button>
              </form>
            )}
          </article>
        ))}
      </section>
      <Spaces personId={actor.personId} day={day} />
    </div>
  );
}
