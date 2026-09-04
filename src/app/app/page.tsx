import Link from "next/link";
import { excerpt, listMemberAnnouncements } from "@/modules/content";
import { getOnboarding } from "@/modules/crm";
import { findUpcomingEditionsForMembers } from "@/modules/events";
import { requireActor } from "@/modules/identity";
import { balanceFor, listMemberAgenda, windowState } from "@/modules/participation";
import { getMyMembership } from "@/modules/people";
import { BarraTitulo, Insignia, LogoComite } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateRange } from "@/shared/lib/dates";
import { cargoEnComite } from "./_ui/PersonaTarjeta";
import { Vacio } from "./_ui/Vacio";
import { markStepAction } from "./actions";

// Inicio de Mi OE (06-mapa-del-sitio.md): saludo, onboarding mientras la persona sea nueva, tus
// comités, la agenda con las ediciones para miembros y la cartelera con audiencia de miembros.

export default async function AppHome() {
  const actor = await requireActor("/app");
  const [mine, editions, announcements] = await Promise.all([
    getMyMembership(actor.personId),
    findUpcomingEditionsForMembers(6),
    listMemberAnnouncements(6),
  ]);
  const onboardingTermId = mine.term && mine.isNew ? mine.term.id : null;
  const [steps, saldo, ocasiones] = await Promise.all([
    onboardingTermId ? getOnboarding(actor.personId, onboardingTermId) : Promise.resolve([]),
    mine.term ? balanceFor(actor.personId, mine.term.id) : Promise.resolve(0),
    mine.term ? listMemberAgenda(mine.term.id) : Promise.resolve([]),
  ]);
  const allDone = steps.length > 0 && steps.every((step) => step.doneAt);
  const now = new Date();
  const [catInte, catPartido, catReunion, catCharla, catTaller, catSocial, catActividad] =
    tList("T-521");
  const categoria: Record<string, string | undefined> = {
    INTEGRATION: catInte,
    ATHLETIC_MATCH: catPartido,
    COMMITTEE_MEETING: catReunion,
    TALK: catCharla,
    WORKSHOP: catTaller,
    SOCIAL: catSocial,
    OTHER: catActividad,
  };
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display-lg">{t("T-060", { "nombre preferido": actor.name })}</h1>
        {mine.term ? (
          <Link href="/app/gh-points" className="flex flex-col items-end no-underline">
            <span className="text-display-md">{t("T-065", { n: saldo })}</span>
            <span className="text-sm underline">{t("T-555")}</span>
          </Link>
        ) : null}
      </div>

      {steps.length > 0 && onboardingTermId ? (
        <section aria-labelledby="onboarding" className="flex flex-col gap-6">
          <BarraTitulo color="naranja" className="self-start">
            <span id="onboarding">{t("T-066")}</span>
          </BarraTitulo>
          {allDone ? <Vacio texto={t("T-068")} elemento="estrella" color="text-oe-yellow" /> : null}
          <ol className="flex list-none flex-col gap-3 p-0">
            {steps.map((step) => (
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
                      <button type="submit" className="boton-secundario text-sm">
                        {t("T-377")}
                      </button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

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
                      {cargoEnComite(item.roleLabel, item.committeeName)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="agenda" className="flex flex-col gap-6">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="agenda">{t("T-062")}</span>
        </BarraTitulo>
        {editions.length === 0 && ocasiones.length === 0 ? (
          <Vacio texto={t("T-063")} />
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {ocasiones.map((ocasion) => (
              <li
                key={ocasion.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
              >
                <span className="flex flex-col">
                  <span className="text-display-md">{ocasion.title}</span>
                  <span className="text-sm text-tinta-suave">
                    {ocasion.kind === "ASSEMBLY" ? tList("T-522")[1] : categoria[ocasion.category]}
                    {" · "}
                    {formatDateRange(ocasion.startsAt, ocasion.endsAt)}
                    {ocasion.location ? ` · ${ocasion.location}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {ocasion.kind === "ASSEMBLY" ? (
                    <Insignia fondo="naranja">{t("T-556")}</Insignia>
                  ) : null}
                  {windowState(ocasion, now) === "OPEN" ? (
                    <Link href={`/a/${ocasion.publicId}`} className="no-underline">
                      <Insignia fondo="amarillo">{t("T-553")}</Insignia>
                    </Link>
                  ) : (
                    <Insignia fondo="sky">{t("T-554")}</Insignia>
                  )}
                </span>
              </li>
            ))}
            {editions.map((edition) => (
              <li
                key={edition.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
              >
                <span className="flex flex-col">
                  <span className="text-display-md">
                    {edition.event.name} · {edition.name}
                  </span>
                  <span className="text-sm text-tinta-suave">
                    {formatDateRange(edition.startsAt, edition.endsAt)}
                    {edition.location ? ` · ${edition.location}` : ""}
                  </span>
                </span>
                {edition.audience === "MEMBERS" ? (
                  <Insignia fondo="amarillo">{t("T-380")}</Insignia>
                ) : (
                  <Link href={`/eventos/${edition.event.slug}/${edition.slug}`} className="text-sm">
                    {t("T-311")}
                  </Link>
                )}
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
                <h3 className="text-display-md">{anuncio.title}</h3>
                <p className="text-sm">{excerpt(anuncio.body, 160)}</p>
                <p className="text-xs text-tinta-suave">
                  {t("T-313", { fecha: formatDate(anuncio.publishedAt) })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
