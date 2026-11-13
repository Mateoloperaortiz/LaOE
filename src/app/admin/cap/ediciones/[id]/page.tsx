import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { listEditionRefs } from "@/modules/events";
import { currentSeatAuthority, getPeopleByIds } from "@/modules/people";
import {
  editionClosure,
  editionHandovers,
  editionLog,
  templateQuestions,
} from "@/modules/permanence";
import { tList } from "@/shared/copy";
import { formatDate, formatDateTime, todayKey } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { closeEditionAction, saveEditionEntryAction } from "../../actions";

// El seguimiento de una edición de macroevento (ADR-197 regla 5): el plan del mes con las direcciones
// generales y las reuniones con Desarrollo Estudiantil, que escribe la Presidencia, y el estado del
// empalme de cada cargo de la mesa. Sin todos los empalmes, el seguimiento no se cierra.

const [titulo] = tList("T-5137");
export const metadata: Metadata = { title: titulo };

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/cap/ediciones/[id]">) {
  const { id } = await params;
  const roles = await requireAdminAreaRoles(`/admin/cap/ediciones/${id}`);
  if (!roles.readsCapLog) redirect("/admin");
  const edition = (await listEditionRefs([id])).get(id);
  if (!edition) notFound();
  const query = await searchParams;
  const [log, handovers, closure, planQuestions, meetingQuestions, presidency] = await Promise.all([
    editionLog(id),
    editionHandovers(id),
    editionClosure(id),
    templateQuestions("EDITION_PLAN"),
    templateQuestions("EDITION_MEETING"),
    currentSeatAuthority(roles.actor.personId, "PRESIDENT"),
  ]);
  const writes = presidency === "HOLDER" && !closure;
  const people = await getPeopleByIds([
    ...new Set([
      ...log.flatMap((entry) => (entry.authorId ? [entry.authorId] : [])),
      ...handovers.flatMap((item) => item.holders),
    ]),
  ]);
  const name = (personId: string | null) =>
    personId ? (people.get(personId)?.fullName ?? "—") : "—";
  const month = todayKey().slice(0, 7);
  const plan = log.find((entry) => entry.kind === "EDITION_PLAN" && entry.month === month);
  const planAnswer = (question: string) =>
    plan?.answers.find((item) => item.question === question)?.answer ?? "";
  const [
    ,
    planTitulo,
    reunionTitulo,
    fechaReunion,
    guardar,
    empalmesTitulo,
    entregado,
    falta,
    cerrar,
    cerrado,
    historia,
    vacio,
    volver,
  ] = tList("T-5137");
  const [planDelMes, reunionDel] = tList("T-5138");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={`${edition.eventName} · ${edition.name}`} description={titulo} />
      <p className="text-sm">
        <Link href="/admin/cap/ediciones">{volver}</Link>
      </p>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={tList("T-4302")[0]} />
      ) : null}
      {closure ? (
        <Banner
          tone="info"
          title={(cerrado ?? "").replace("{fecha}", formatDateTime(closure.closedAt))}
        />
      ) : null}

      <section aria-labelledby="edicion-empalmes" className="flex flex-col gap-3">
        <h2 id="edicion-empalmes" className="text-display-md">
          {empalmesTitulo}
        </h2>
        {handovers.length === 0 ? (
          <EmptyState title={vacio ?? ""} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {handovers.map((item) => (
              <li key={item.roleCode} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.roleLabel}</span>
                <span className="text-tinta-secundaria">{item.holders.map(name).join(", ")}</span>
                <Badge tone={item.entry ? "exito" : "aviso"}>
                  {item.entry
                    ? (entregado ?? "").replace(
                        "{fecha}",
                        formatDate(new Date(`${item.entry.occurredOn}T12:00:00Z`)),
                      )
                    : falta}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {writes ? (
          <form action={closeEditionAction}>
            <input type="hidden" name="editionId" value={id} />
            <Button type="submit" variant="secundaria" area="operacion">
              {cerrar}
            </Button>
          </form>
        ) : null}
      </section>

      {writes ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={saveEditionEntryAction} className="flex flex-col gap-3">
            <h2 className="text-display-md">{(planTitulo ?? "").replace("{mes}", month)}</h2>
            <input type="hidden" name="editionId" value={id} />
            <input type="hidden" name="kind" value="EDITION_PLAN" />
            <input type="hidden" name="month" value={month} />
            {planQuestions.map((question, index) => (
              <Field key={question} id={`ed-plan-${index}`} label={question}>
                <TextArea
                  id={`ed-plan-${index}`}
                  name="answers"
                  rows={2}
                  maxLength={4000}
                  defaultValue={planAnswer(question)}
                />
              </Field>
            ))}
            <Button type="submit" area="operacion" className="self-start">
              {guardar}
            </Button>
          </form>
          <form action={saveEditionEntryAction} className="flex flex-col gap-3">
            <h2 className="text-display-md">{reunionTitulo}</h2>
            <input type="hidden" name="editionId" value={id} />
            <input type="hidden" name="kind" value="EDITION_MEETING" />
            <Field id="ed-reunion-fecha" label={fechaReunion ?? ""}>
              <TextInput
                id="ed-reunion-fecha"
                name="occurredOn"
                type="date"
                required
                defaultValue={todayKey()}
              />
            </Field>
            {meetingQuestions.map((question, index) => (
              <Field key={question} id={`ed-reunion-${index}`} label={question}>
                <TextArea id={`ed-reunion-${index}`} name="answers" rows={2} maxLength={4000} />
              </Field>
            ))}
            <Button type="submit" area="operacion" className="self-start">
              {guardar}
            </Button>
          </form>
        </div>
      ) : null}

      <section aria-labelledby="edicion-historia" className="flex flex-col gap-3">
        <h2 id="edicion-historia" className="text-display-md">
          {historia}
        </h2>
        {log.length === 0 ? (
          <EmptyState title={vacio ?? ""} />
        ) : (
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 border-l-2 border-borde pl-3">
                <p className="m-0 font-semibold">
                  {entry.kind === "EDITION_PLAN"
                    ? (planDelMes ?? "").replace("{mes}", entry.month ?? "")
                    : (reunionDel ?? "").replace(
                        "{fecha}",
                        formatDate(new Date(`${entry.occurredOn}T12:00:00Z`)),
                      )}
                </p>
                <p className="m-0 text-sm text-tinta-secundaria">
                  {name(entry.authorId)} · {formatDateTime(entry.updatedAt)}
                </p>
                <dl className="m-0 flex flex-col gap-1 text-sm">
                  {entry.answers
                    .filter((item) => item.answer.length > 0)
                    .map((item) => (
                      <div key={item.question}>
                        <dt className="font-semibold">{item.question}</dt>
                        <dd className="m-0 whitespace-pre-line">{item.answer}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
