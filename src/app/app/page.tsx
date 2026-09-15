import Link from "next/link";
import { countSubscriptionsFor } from "@/modules/comms";
import { InstallBanner } from "@/modules/comms/components/InstallBanner";
import { excerpt, listMemberAnnouncements } from "@/modules/content";
import { getOnboarding } from "@/modules/crm";
import { findUpcomingEditionsForMembers } from "@/modules/events";
import { requireActor } from "@/modules/identity";
import { balanceFor, listMemberAgenda } from "@/modules/participation";
import { canParticipate, getMyMembership } from "@/modules/people";
import { getPersonPermanence, listTeamParticipations } from "@/modules/permanence";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { BarraTitulo, Insignia, LogoComite, Progreso } from "@/shared/brand";
import { TeamParticipations } from "@/shared/brand/TeamParticipations";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { noticeText } from "./_ui/avisos";
import { agendaItems, MemberAgenda } from "./_ui/MemberAgenda";
import { cargoEnComite } from "./_ui/PersonaTarjeta";
import { Vacio } from "./_ui/Vacio";
import { markStepAction } from "./actions";

// Inicio de Mi OE (06-mapa-del-sitio.md): saludo, onboarding mientras la persona sea nueva, tus
// comités, la agenda con las ediciones para miembros y la cartelera con audiencia de miembros.

export default async function AppHome() {
  const actor = await requireActor("/app");
  const participationAllowed = canParticipate(actor.membershipStatus);
  const [mine, editions, announcements, devices] = await Promise.all([
    getMyMembership(actor.personId),
    findUpcomingEditionsForMembers(6),
    listMemberAnnouncements(6),
    countSubscriptionsFor(actor.personId),
  ]);
  const [avisoTitulo, avisoTexto, avisoBoton] = tList("T-1092") as [string, string, string];
  const onboardingTermId = participationAllowed && mine.term && mine.isNew ? mine.term.id : null;
  const [steps, saldo, ocasiones, permanence] = await Promise.all([
    onboardingTermId ? getOnboarding(actor.personId, onboardingTermId) : Promise.resolve([]),
    mine.term ? balanceFor(actor.personId, mine.term.id) : Promise.resolve(0),
    mine.term ? listMemberAgenda(mine.term.id) : Promise.resolve([]),
    mine.term ? getPersonPermanence(actor.personId, mine.term.id) : Promise.resolve(null),
  ]);
  const committeeNames = new Map(
    mine.committees.map((item) => [item.committeeId, item.committeeName]),
  );
  const teams = mine.term
    ? await listTeamParticipations([actor.personId], mine.term.id)
    : new Map();
  const allDone = steps.length > 0 && steps.every((step) => step.doneAt);
  const agenda = agendaItems(ocasiones, editions);
  return (
    <div className="member-home">
      <header className="member-home-header">
        <div>
          <h1>{t("T-060", { "nombre preferido": actor.name })}</h1>
          {mine.term ? <p>{mine.term.code}</p> : null}
        </div>
        {mine.term ? (
          <Link href="/app/gh-points" className="member-home-saldo">
            <strong>{t("T-065", { n: saldo })}</strong>
            <span>{t("T-555")}</span>
          </Link>
        ) : null}
      </header>
      {mine.term && teams.size ? (
        <TeamParticipations items={teams.get(actor.personId) ?? []} term={mine.term.code} />
      ) : null}
      <div className="member-home-priority">
        <section id="agenda" aria-labelledby="agenda-title">
          <div className="member-section-heading">
            <BarraTitulo color="amarillo">
              <span id="agenda-title">{t("T-062")}</span>
            </BarraTitulo>
          </div>
          <MemberAgenda
            items={agenda.slice(0, 3)}
            personId={actor.personId}
            participationAllowed={participationAllowed}
            preview
          />
          <Link href="/app/agenda" className="boton-secundario mt-4">
            {t("T-1667")}
          </Link>
        </section>
        <aside className="member-carnet-shortcut">
          <h2>{t("T-131")}</h2>
          <p>{t(participationAllowed ? "T-1674" : "T-2042")}</p>
          {participationAllowed ? (
            <Link href="/app/carnet" className="boton-calido">
              {t("T-1673")}
            </Link>
          ) : null}
          {permanence?.notices.length ? (
            <Link href="#permanencia" className="text-sm text-oe-paper underline">
              {t("T-1675", { n: permanence.notices.length })}
            </Link>
          ) : null}
        </aside>
      </div>
      {participationAllowed &&
      permanence &&
      (permanence.result.evaluated || permanence.notices.length > 0) ? (
        <section aria-labelledby="permanencia" className="flex flex-col gap-4">
          <BarraTitulo color="amarillo" className="self-start">
            <span id="permanencia">{t("T-110")}</span>
          </BarraTitulo>
          {permanence.notices.map((notice) => (
            <p
              key={`${notice.kind}-${notice.committeeId ?? notice.occasionId ?? ""}`}
              className={`rounded-xl px-4 py-3 font-semibold ${notice.kind === "NO_ALCANZA" || notice.kind === "MANDATORY_ASSEMBLY" ? "bg-oe-orange text-oe-navy" : "bg-oe-yellow-soft text-oe-navy"}`}
            >
              {noticeText(notice, committeeNames)}{" "}
              {notice.kind === "EVALUATIONS_PENDING" ||
              notice.kind === "EVALUATION_WINDOW_OPENED" ? (
                <Link href="/admin/permanencia/evaluaciones" className="underline">
                  {t("T-700")}
                </Link>
              ) : notice.kind === "TERM_CLOSED" ? (
                <Link href="/app/permanencia" className="underline">
                  {t("T-699")}
                </Link>
              ) : null}
            </p>
          ))}
          <ul className="flex list-none flex-col gap-3 p-0">
            {permanence.result.results.map((item) => {
              const comité = committeeNames.get(item.committeeId) ?? "";
              return (
                <li key={item.committeeId} className="flex flex-col gap-2">
                  <span className="font-semibold">
                    {t("T-064", { comité, n: Math.round(item.total), umbral: item.threshold })}
                  </span>
                  <Progreso
                    valor={item.total}
                    maximo={Math.max(
                      item.threshold,
                      permanence.result.generalMax + item.committeeMax,
                      1,
                    )}
                    umbral={item.threshold}
                    nombre={comité}
                    etiqueta={t("T-706", { n: Math.round(item.total), umbral: item.threshold })}
                  />
                </li>
              );
            })}
          </ul>
          <Link href="/app/permanencia" className="self-start underline">
            {t("T-699")}
          </Link>
        </section>
      ) : null}

      {steps.length > 0 && onboardingTermId ? (
        <section aria-labelledby="onboarding" className="flex flex-col gap-6">
          <BarraTitulo color="naranja" className="self-start">
            <span id="onboarding">{t("T-066")}</span>
          </BarraTitulo>

          <ol className="flex list-none flex-col gap-3 p-0">
            {steps
              .filter((step) => !step.doneAt)
              .map((step) => (
                <li
                  key={step.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
                >
                  <span className="font-semibold">{step.label}</span>
                  <span className="flex items-center gap-3">
                    <Insignia fondo={step.doneAt ? "amarillo" : "sky"}>
                      {step.doneAt ? t("T-379") : t("T-378")}
                    </Insignia>
                    {step.doneAt ? null : (
                      <form action={markStepAction}>
                        <input type="hidden" name="termId" value={onboardingTermId} />
                        <input type="hidden" name="stepKey" value={step.key} />
                        <AdminSubmitButton type="submit" className="boton-secundario text-sm">
                          {t("T-377")}
                        </AdminSubmitButton>
                      </form>
                    )}
                  </span>
                </li>
              ))}
          </ol>
          {steps.some((step) => step.doneAt) ? (
            <details className="rounded-xl border border-borde p-4">
              <summary className="font-semibold">
                {t("T-1677", { n: steps.filter((step) => step.doneAt).length })}
              </summary>
              <ul className="mt-3 flex list-none flex-col gap-3 p-0">
                {steps
                  .filter((step) => step.doneAt)
                  .map((step) => (
                    <li key={step.key} className="flex items-center justify-between gap-3">
                      <span>{step.label}</span>
                      <Insignia fondo="amarillo">{t("T-379")}</Insignia>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {allDone ? <p className="text-sm text-tinta-suave">{t("T-1682")}</p> : null}
      <section aria-labelledby="tus-comites" className="flex flex-col gap-6">
        <BarraTitulo color="azul" className="self-start">
          <span id="tus-comites">{t("T-375")}</span>
        </BarraTitulo>
        {mine.committees.length === 0 ? (
          <Vacio texto={t("T-376")} elemento="asterisco" color="text-oe-navy" />
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {mine.committees.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/app/comites/${item.committeeSlug}`}
                  className="flex items-center gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4 no-underline"
                >
                  <LogoComite
                    slug={item.committeeSlug}
                    name={item.committeeName}
                    size={40}
                    className="shrink-0"
                  />
                  <span className="flex flex-col">
                    <span className="text-display-md">{item.committeeName}</span>
                    <span className="text-sm text-tinta-suave">
                      {cargoEnComite(item, item.committeeName)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cartelera" className="flex flex-col gap-6">
        <BarraTitulo color="naranja" className="self-start">
          <span id="cartelera">{t("T-301")}</span>
        </BarraTitulo>
        {announcements.length === 0 ? (
          <Vacio texto={t("T-302")} elemento="asterisco" color="text-oe-navy" />
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
            {announcements.map((anuncio) => (
              <li
                key={anuncio.id}
                className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {anuncio.pinned ? <Insignia fondo="amarillo">{t("T-303")}</Insignia> : null}
                  {anuncio.audience === "MEMBERS" ? (
                    <Insignia fondo="sky">{t("T-380")}</Insignia>
                  ) : null}
                </span>
                <h3 className="text-display-md">
                  <Link href={`/app/cartelera/${anuncio.id}`} className="no-underline">
                    {anuncio.title}
                  </Link>
                </h3>
                <p className="text-sm">{excerpt(anuncio.body, 160)}</p>
                <p className="text-xs text-tinta-suave">
                  {t("T-313", { fecha: formatDate(anuncio.publishedAt) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {devices === 0 ? (
        <InstallBanner
          title={avisoTitulo}
          text={avisoTexto}
          button={avisoBoton}
          dismiss={t("T-1093")}
          href="/app/ajustes#notificaciones"
        />
      ) : null}
    </div>
  );
}
