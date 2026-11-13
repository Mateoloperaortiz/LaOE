import type { ReactNode } from "react";
import { countSubscriptionsFor, countUnreadInbox } from "@/modules/comms";
import { InstallBanner } from "@/modules/comms/components/InstallBanner";
import { excerpt, listMemberAnnouncements } from "@/modules/content";
import { getOnboarding } from "@/modules/crm";
import { findUpcomingEditionsForMembers } from "@/modules/events";
import { requireActor } from "@/modules/identity";
import {
  balanceFor,
  listMemberAgenda,
  loadGamificationSettings,
  nextChallengeForMember,
} from "@/modules/participation";
import { ChallengeCard } from "@/modules/participation/components/ChallengeCard";
import { canParticipate, getMyMembership } from "@/modules/people";
import { getPersonPermanence, listTeamParticipations } from "@/modules/permanence";
import { TeamParticipations } from "@/modules/permanence/components/TeamParticipations";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { LogoComite, Progreso } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { buttonClass } from "@/shared/ui/Button";
import { BellIcon } from "@/shared/ui/icons/BellIcon";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";
import { formatCount } from "@/shared/ui/list-navigation";
import { noticeText } from "./_ui/avisos";
import { agendaItems, MemberAgenda } from "./_ui/MemberAgenda";
import { cargoEnComite } from "./_ui/PersonaTarjeta";
import { loadTodo } from "./_ui/today";
import { TODO_KINDS } from "./_ui/today-items";
import { markStepAction } from "./actions";

// «Hoy», el inicio de Mi OE (ADR-160 regla 2, tramo M2): los bloques van por urgencia y uno sin
// contenido no aparece. Lo que sigue, Te toca, Tu permanencia, Cartelera, Juegos y retos, Tus comités.
// El carnet ya no tiene atajo aquí: vive en «Asistencia», el botón central de la barra.

const SURFACE = "rounded-tarjeta border border-superficie-borde bg-superficie sombra-flota";

function Block({
  id,
  title,
  link,
  children,
}: {
  id: string;
  title: string;
  link?: { href: string; label: string } | undefined;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="titulo-seccion">
          {title}
        </h2>
        {link ? (
          <Link
            href={link.href}
            className="text-secundario text-enlace underline underline-offset-4"
          >
            {link.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function AppHome() {
  const actor = await requireActor("/app");
  const participationAllowed = canParticipate(actor.membershipStatus);
  const [mine, editions, announcements, devices, gamification, unread] = await Promise.all([
    getMyMembership(actor.personId),
    findUpcomingEditionsForMembers(6),
    listMemberAnnouncements(6),
    countSubscriptionsFor(actor.personId),
    loadGamificationSettings(),
    countUnreadInbox(actor.personId),
  ]);
  const onboardingTermId = participationAllowed && mine.term && mine.isNew ? mine.term.id : null;
  const [steps, saldo, ocasiones, permanence, todo] = await Promise.all([
    onboardingTermId ? getOnboarding(actor.personId, onboardingTermId) : Promise.resolve([]),
    mine.term ? balanceFor(actor.personId, mine.term.id) : Promise.resolve(0),
    mine.term ? listMemberAgenda(mine.term.id) : Promise.resolve([]),
    mine.term ? getPersonPermanence(actor.personId, mine.term) : Promise.resolve(null),
    loadTodo(actor.personId, mine.term?.id ?? null, participationAllowed),
  ]);
  const committeeNames = new Map(
    mine.committees.map((item) => [item.committeeId, item.committeeName]),
  );
  const teams = mine.term
    ? await listTeamParticipations([actor.personId], mine.term.id)
    : new Map();
  const pendingSteps = steps.filter((step) => !step.doneAt);
  const doneSteps = steps.filter((step) => step.doneAt);
  const allDone = steps.length > 0 && pendingSteps.length === 0;
  const [siguiente] = agendaItems(ocasiones, editions);
  // «Juegos y retos» es de quien puede participar (y por eso tiene membresía), con término vigente.
  const nextChallengeTerm = gamification.enabled && participationAllowed ? mine.term : null;
  const nextChallenge = nextChallengeTerm
    ? await nextChallengeForMember(actor.personId, nextChallengeTerm.id)
    : null;
  const [avisoTitulo, avisoTexto, avisoBoton] = tList("T-1092");
  const bellLabels = tList("T-4889");
  const [loQueSigue, teToca, juegosYRetos] = tList("T-4890");
  const todoLabels = tLabels("T-4891", TODO_KINDS);
  const showPermanence =
    participationAllowed &&
    permanence !== null &&
    (permanence.result.evaluated || permanence.notices.length > 0);

  return (
    <div className="member-home">
      <header className="member-home-header">
        <div>
          <h1>{t("T-060", { "nombre preferido": actor.name })}</h1>
          {mine.term ? <p>{mine.term.code}</p> : null}
        </div>
        <div className="member-home-utilities">
          <Link
            href="/app/avisos"
            className="member-bell"
            aria-label={
              unread === 0
                ? bellLabels[0]
                : formatCount(unread, { one: bellLabels[1] ?? "", other: bellLabels[2] ?? "" })
            }
          >
            <BellIcon size={20} />
            {unread > 0 ? (
              <span className="member-bell-count" aria-hidden="true">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          {mine.term ? (
            <Link href="/app/gh-points" className="member-home-saldo">
              <strong>{t("T-065", { n: saldo })}</strong>
              <span>{t("T-555")}</span>
            </Link>
          ) : null}
        </div>
      </header>

      {siguiente ? (
        <Block
          id="lo-que-sigue"
          title={loQueSigue}
          link={{ href: "/app/agenda", label: t("T-1667") }}
        >
          <MemberAgenda
            items={[siguiente]}
            personId={actor.personId}
            participationAllowed={participationAllowed}
            preview
          />
        </Block>
      ) : null}

      {pendingSteps.length > 0 || todo.length > 0 ? (
        <Block id="te-toca" title={teToca}>
          {pendingSteps.length > 0 && onboardingTermId ? (
            <div className="flex flex-col gap-2">
              <p className="etiqueta-corta text-tinta-secundaria">{t("T-066")}</p>
              <ol className={`flex list-none flex-col p-1 ${SURFACE}`}>
                {pendingSteps.map((step) => (
                  <li
                    key={step.key}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="font-semibold text-titulo">{step.label}</span>
                    <ActionForm action={markStepAction}>
                      <input type="hidden" name="termId" value={onboardingTermId} />
                      <input type="hidden" name="stepKey" value={step.key} />
                      <AdminSubmitButton
                        type="submit"
                        className={buttonClass({ variant: "secundaria", size: "compacto" })}
                      >
                        {t("T-377")}
                      </AdminSubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {todo.length > 0 ? (
            <ul className={`flex list-none flex-col p-1 ${SURFACE}`}>
              {todo.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex min-h-12 items-center gap-3 rounded-control px-3 py-2 text-titulo no-underline hover:bg-relleno"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">
                        {todoLabels[item.kind].replace("{asunto}", item.subject)}
                      </span>
                      {item.due ? (
                        <span className="text-secundario text-tinta-secundaria">
                          {t("T-4892", { fecha: formatDate(item.due) })}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRightIcon size={16} className="shrink-0 text-tinta-secundaria" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {doneSteps.length > 0 ? (
            <details className="text-secundario text-tinta-secundaria">
              <summary>{t("T-1677", { n: doneSteps.length })}</summary>
              <ul className="mt-2 flex list-none flex-col gap-1 p-0">
                {doneSteps.map((step) => (
                  <li key={step.key}>{step.label}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </Block>
      ) : null}
      {allDone ? <p className="text-secundario text-tinta-secundaria">{t("T-1682")}</p> : null}

      {showPermanence && permanence ? (
        <Block
          id="permanencia"
          title={t("T-110")}
          link={{ href: "/app/permanencia", label: t("T-699") }}
        >
          {mine.term && teams.size ? (
            <TeamParticipations items={teams.get(actor.personId) ?? []} term={mine.term.code} />
          ) : null}
          {permanence.notices.map((notice) => (
            <Banner
              key={`${notice.kind}-${notice.committeeId ?? notice.occasionId ?? ""}`}
              tone={
                notice.kind === "NO_ALCANZA" || notice.kind === "MANDATORY_ASSEMBLY"
                  ? "aviso"
                  : "info"
              }
            >
              {noticeText(notice, committeeNames)}{" "}
              {notice.kind === "EVALUATIONS_PENDING" ||
              notice.kind === "EVALUATION_WINDOW_OPENED" ? (
                <Link href="/admin/permanencia/evaluaciones" className="underline">
                  {t("T-700")}
                </Link>
              ) : null}
            </Banner>
          ))}
          <ul className={`flex list-none flex-col gap-4 p-4 ${SURFACE}`}>
            {permanence.result.results.map((item) => {
              const comité = committeeNames.get(item.committeeId) ?? "";
              return (
                <li key={item.committeeId} className="flex flex-col gap-2">
                  <span className="font-semibold text-titulo">
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
        </Block>
      ) : null}

      {announcements.length > 0 ? (
        <Block
          id="cartelera"
          title={t("T-301")}
          link={{ href: "/app/cartelera", label: t("T-1041") }}
        >
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
            {announcements.map((anuncio) => (
              <li key={anuncio.id} className={`flex flex-col gap-2 p-4 ${SURFACE}`}>
                <h3 className="titulo-tarjeta">
                  <Link href={`/app/cartelera/${anuncio.id}`} className="no-underline">
                    {anuncio.title}
                  </Link>
                </h3>
                <p className="text-secundario">{excerpt(anuncio.body, 160)}</p>
                <p className="text-[0.75rem] text-tinta-secundaria">
                  {[
                    anuncio.pinned ? t("T-303") : null,
                    anuncio.audience === "MEMBERS" ? t("T-380") : null,
                    t("T-313", { fecha: formatDate(anuncio.publishedAt) }),
                  ]
                    .filter((part) => part)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {participationAllowed ? (
        <Block
          id="juegos-y-retos"
          title={juegosYRetos}
          link={nextChallenge ? { href: "/app/juegos", label: t("T-4893") } : undefined}
        >
          {nextChallenge ? (
            <div className="flex flex-col items-start gap-3">
              <p className="etiqueta-corta text-tinta-secundaria">{t("T-2445")}</p>
              <ChallengeCard card={nextChallenge} />
              <Link
                href={`/app/gh-points/retos/${nextChallenge.id}`}
                className={buttonClass({ variant: "secundaria" })}
              >
                {t("T-2446")}
              </Link>
            </div>
          ) : (
            // Sin reto que mostrar, el bloque no queda vacío: lleva a los juegos del día.
            <Link
              href="/app/juegos"
              className={`flex min-h-12 items-center gap-3 px-4 py-3 text-titulo no-underline hover:bg-relleno ${SURFACE}`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{t("T-4893")}</span>
                {nextChallengeTerm ? (
                  <span className="text-secundario text-tinta-secundaria">{t("T-2447")}</span>
                ) : null}
              </span>
              <ChevronRightIcon size={16} className="shrink-0 text-tinta-secundaria" />
            </Link>
          )}
        </Block>
      ) : null}

      {mine.committees.length > 0 ? (
        <Block id="tus-comites" title={t("T-375")}>
          <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {mine.committees.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/app/comites/${item.committeeSlug}`}
                  className={`flex items-center gap-4 p-4 no-underline ${SURFACE}`}
                >
                  <LogoComite
                    slug={item.committeeSlug}
                    name={item.committeeName}
                    size={40}
                    className="shrink-0"
                  />
                  <span className="flex flex-col">
                    <span className="titulo-tarjeta">{item.committeeName}</span>
                    <span className="text-secundario text-tinta-secundaria">
                      {cargoEnComite(item, item.committeeName)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

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
