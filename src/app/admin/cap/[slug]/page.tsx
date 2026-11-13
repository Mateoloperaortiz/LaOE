import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { currentSeatAuthority, getPeopleByIds, listCommitteesForSelection } from "@/modules/people";
import { listCommitteeLog, listCompanions, templateQuestions } from "@/modules/permanence";
import { getCurrentTerm } from "@/modules/terms";
import { tList } from "@/shared/copy";
import { formatDate, formatDateTime, todayKey } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { saveCapEntryAction } from "../actions";

// La bitácora de un comité (ADR-197 regla 4): el plan del mes y una nota por reunión, que escribe su
// acompañante del CAP (o la Presidencia), y la historia. La leen la Presidencia y el CAP.

const [titulo] = tList("T-5130");
export const metadata: Metadata = { title: titulo };

export default async function Page({ params, searchParams }: PageProps<"/admin/cap/[slug]">) {
  const { slug } = await params;
  const roles = await requireAdminAreaRoles(`/admin/cap/${slug}`);
  if (!roles.readsCapLog) redirect("/admin");
  const committee = (await listCommitteesForSelection()).find((item) => item.slug === slug);
  const term = await getCurrentTerm();
  if (!committee || !term) notFound();
  const query = await searchParams;
  const [companions, log, planQuestions, meetingQuestions, presidency] = await Promise.all([
    listCompanions(term.id),
    listCommitteeLog(committee.id),
    templateQuestions("CAP_PLAN"),
    templateQuestions("CAP_MEETING"),
    currentSeatAuthority(roles.actor.personId, "PRESIDENT"),
  ]);
  const companionId = companions.get(committee.id);
  const writes = presidency === "HOLDER" || companionId === roles.actor.personId;
  const people = await getPeopleByIds([
    ...new Set([
      ...(companionId ? [companionId] : []),
      ...log.flatMap((entry) => (entry.authorId ? [entry.authorId] : [])),
    ]),
  ]);
  const name = (personId: string | null | undefined) =>
    personId ? (people.get(personId)?.fullName ?? "—") : "—";
  const month = todayKey().slice(0, 7);
  const plan = log.find((entry) => entry.kind === "CAP_PLAN" && entry.month === month);
  const planAnswer = (question: string) =>
    plan?.answers.find((item) => item.question === question)?.answer ?? "";

  const [, , , , , acompanante, volver] = tList("T-5130");
  const [planTitulo, guardarPlan, reunionTitulo, fechaReunion, guardarNota, historia, vacio] =
    tList("T-5132");
  const [planDelMes, notaDeReunion] = tList("T-5133");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={committee.name} description={`${acompanante}: ${name(companionId)}`} />
      <p className="text-sm">
        <Link href="/admin/cap">{volver}</Link>
      </p>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={tList("T-4302")[0]} />
      ) : null}

      {writes ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={saveCapEntryAction} className="flex flex-col gap-3">
            <h2 className="text-display-md">{(planTitulo ?? "").replace("{mes}", month)}</h2>
            <input type="hidden" name="slug" value={committee.slug} />
            <input type="hidden" name="committeeId" value={committee.id} />
            <input type="hidden" name="kind" value="CAP_PLAN" />
            <input type="hidden" name="month" value={month} />
            {planQuestions.map((question, index) => (
              <Field key={question} id={`plan-${index}`} label={question}>
                <TextArea
                  id={`plan-${index}`}
                  name="answers"
                  rows={2}
                  maxLength={4000}
                  defaultValue={planAnswer(question)}
                />
              </Field>
            ))}
            <Button type="submit" area="operacion" className="self-start">
              {guardarPlan}
            </Button>
          </form>
          <form action={saveCapEntryAction} className="flex flex-col gap-3">
            <h2 className="text-display-md">{reunionTitulo}</h2>
            <input type="hidden" name="slug" value={committee.slug} />
            <input type="hidden" name="committeeId" value={committee.id} />
            <input type="hidden" name="kind" value="CAP_MEETING" />
            <Field id="reunion-fecha" label={fechaReunion ?? ""}>
              <TextInput
                id="reunion-fecha"
                name="occurredOn"
                type="date"
                required
                defaultValue={todayKey()}
              />
            </Field>
            {meetingQuestions.map((question, index) => (
              <Field key={question} id={`reunion-${index}`} label={question}>
                <TextArea id={`reunion-${index}`} name="answers" rows={2} maxLength={4000} />
              </Field>
            ))}
            <Button type="submit" area="operacion" className="self-start">
              {guardarNota}
            </Button>
          </form>
        </div>
      ) : null}

      <section aria-labelledby="bitacora-historia" className="flex flex-col gap-3">
        <h2 id="bitacora-historia" className="text-display-md">
          {historia}
        </h2>
        {log.length === 0 ? (
          <EmptyState title={vacio ?? ""} />
        ) : (
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            {log.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 border-l-2 border-borde pl-3">
                <p className="m-0 font-semibold">
                  {entry.kind === "CAP_PLAN"
                    ? (planDelMes ?? "").replace("{mes}", entry.month ?? "")
                    : (notaDeReunion ?? "").replace(
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
