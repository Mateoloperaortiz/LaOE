import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import {
  APPOINTMENT_KINDS,
  BOARD_CALENDAR_AREAS,
  type BoardCalendarArea,
  boardCalendarStatus,
  getBoardEvent,
  listBoardEventsBetween,
} from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDate, formatDateTime, formatTime, utcToBogotaInput } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { cancelBoardEventAction, saveBoardEventAction } from "./actions";

// El calendario de la junta (ADR-197 regla 6): quien tiene un cargo de la junta agenda las reuniones
// de la junta y las fechas clave de su área. Lo que nació en la casa se edita aquí; lo que viene de
// Google Calendar, allá. ADMIN lo ve sin agendar: no decide por la junta.

const [titulo] = tList("T-5115");
export const metadata: Metadata = { title: titulo };

const DAY_MS = 86_400_000;

export default async function Page({ searchParams }: PageProps<"/admin/calendario/junta">) {
  const roles = await requireAdminAreaRoles("/admin/calendario/junta");
  if (!roles.isAdmin && !roles.isBoard && roles.boardSeats.length === 0) redirect("/admin");
  const query = await searchParams;
  const now = new Date();
  const [events, status, editing] = await Promise.all([
    listBoardEventsBetween(
      new Date(now.getTime() - DAY_MS),
      new Date(now.getTime() + 400 * DAY_MS),
    ),
    boardCalendarStatus(),
    single(query.editar) ? getBoardEvent(single(query.editar) ?? "") : null,
  ]);
  const seats = new Set(roles.boardSeats.map((item) => item.seat));
  const canSchedule = roles.boardSeats.length > 0;
  const areas: BoardCalendarArea[] = BOARD_CALENDAR_AREAS.filter(
    (area) => area === "BOARD" || seats.has(area),
  );
  const cargos = tLabels("T-444", APPOINTMENT_KINDS);
  const [junta] = tList("T-5121");
  const areaLabel = (area: BoardCalendarArea) => (area === "BOARD" ? junta : cargos[area]) ?? area;
  const canEdit = (row: { origin: string; createdById: string | null; area: BoardCalendarArea }) =>
    row.origin === "CASA" &&
    (row.createdById === roles.actor.personId ||
      seats.has(row.area === "BOARD" ? "PRESIDENT" : row.area));
  const editable = editing && !editing.cancelledAt && canEdit(editing) ? editing : null;

  const [heading, intro] = tList("T-5115");
  const [que, area, empieza, termina, lugar, detalles] = tList("T-5116");
  const [agregar, guardar, quitar, cancelar, guardado, quitado] = tList("T-5117");
  const [proximo, vacio, deGoogle, editar, abrirGoogle, todoElDia] = tList("T-5118");
  const [conectado, ultimaLectura, apagado, fallo] = tList("T-5119");
  const error = single(query.error);
  const ok = single(query.guardado);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      {error ? (
        <Banner tone="error" title={error} />
      ) : ok === "1" ? (
        <Banner tone="exito" title={guardado} />
      ) : ok === "quitado" ? (
        <Banner tone="exito" title={quitado} />
      ) : null}
      <p className="text-sm text-tinta-secundaria">
        {status.configured
          ? `${conectado} ${status.lastPulledAt ? (ultimaLectura ?? "").replace("{fecha}", formatDateTime(status.lastPulledAt)) : ""}`
          : apagado}
        {status.configured && status.lastError ? ` ${fallo}` : ""}
      </p>

      {canSchedule ? (
        <form
          action={saveBoardEventAction}
          className="flex max-w-xl flex-col gap-3 rounded-tarjeta border-2 border-borde p-4"
        >
          {editable ? <input type="hidden" name="eventId" value={editable.id} /> : null}
          <Field id="junta-title" label={que ?? ""}>
            <TextInput
              id="junta-title"
              name="title"
              required
              minLength={2}
              maxLength={200}
              defaultValue={editable?.title ?? ""}
            />
          </Field>
          <Field id="junta-area" label={area ?? ""}>
            <Select id="junta-area" name="area" defaultValue={editable?.area ?? "BOARD"}>
              {areas.map((item) => (
                <option key={item} value={item}>
                  {areaLabel(item)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="junta-startsAt" label={empieza ?? ""}>
              <TextInput
                id="junta-startsAt"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={editable ? utcToBogotaInput(editable.startsAt) : ""}
              />
            </Field>
            <Field id="junta-endsAt" label={termina ?? ""}>
              <TextInput
                id="junta-endsAt"
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={editable ? utcToBogotaInput(editable.endsAt) : ""}
              />
            </Field>
          </div>
          <Field id="junta-location" label={lugar ?? ""}>
            <TextInput
              id="junta-location"
              name="location"
              maxLength={300}
              defaultValue={editable?.location ?? ""}
            />
          </Field>
          <Field id="junta-description" label={detalles ?? ""}>
            <TextArea
              id="junta-description"
              name="description"
              rows={3}
              maxLength={4000}
              defaultValue={editable?.description ?? ""}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" area="operacion">
              {editable ? guardar : agregar}
            </Button>
            {editable ? (
              <>
                <Button
                  type="submit"
                  formAction={cancelBoardEventAction}
                  variant="secundaria"
                  area="operacion"
                >
                  {quitar}
                </Button>
                <Link href="/admin/calendario/junta" className="boton-secundario px-4 py-2 text-sm">
                  {cancelar}
                </Link>
              </>
            ) : null}
          </div>
        </form>
      ) : null}

      <section aria-labelledby="junta-proximo" className="flex flex-col gap-3">
        <h2 id="junta-proximo" className="text-display-md">
          {proximo}
        </h2>
        {events.length === 0 ? (
          <EmptyState title={vacio ?? ""} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {events.map((row) => (
              <li
                key={row.id}
                className="admin-calendar-item flex-wrap"
                data-capa="BOARD"
                data-area={row.area}
              >
                <span className="admin-calendar-time">
                  {formatDate(row.startsAt)} ·{" "}
                  {row.allDay ? todoElDia : `${formatTime(row.startsAt)}–${formatTime(row.endsAt)}`}
                </span>
                <span>{row.title}</span>
                <Badge tone="neutral">{areaLabel(row.area)}</Badge>
                {row.location ? (
                  <span className="text-tinta-secundaria">{row.location}</span>
                ) : null}
                {row.origin === "GOOGLE" ? (
                  <span className="text-tinta-secundaria">{deGoogle}</span>
                ) : null}
                {row.syncError && status.configured ? <Badge tone="aviso">{fallo}</Badge> : null}
                {canEdit(row) ? (
                  <Link
                    href={`/admin/calendario/junta?editar=${row.id}`}
                    aria-label={`${editar}: ${row.title}`}
                  >
                    {editar}
                  </Link>
                ) : null}
                {row.googleHtmlLink ? (
                  <a href={row.googleHtmlLink} target="_blank" rel="noreferrer">
                    {abrirGoogle}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm">
        <Link href="/admin/calendario">{tList("T-4918")[0]}</Link>
      </p>
    </div>
  );
}
