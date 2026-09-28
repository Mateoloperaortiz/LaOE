import Link from "next/link";
import { requireCompetitionOperator } from "@/app/_authz/competition";
import { single } from "@/app/_lib/search";
import {
  creditBalances,
  getLiveRotations,
  getRotation,
  getScheduleForValidation,
  listAnnouncements,
  listBases,
  listCaptains,
  listExtras,
  listLedger,
  listMarkets,
  listPendingMatchups,
  listRegistrationCandidates,
  listRotations,
  listStaff,
  listStandings,
  listTeams,
  validateSchedule,
} from "@/modules/competition";
import { Actualizador } from "@/modules/competition/components/Actualizador";
import { listFormOptions } from "@/modules/forms";
import { listActiveMemberRefs } from "@/modules/people";
import { AdminSectionSelect } from "@/shared/admin-kit/AdminSectionSelect";
import { t, tList } from "@/shared/copy";
import { Anuncios, Apuestas } from "./_ui/Community";
import { Extras, Posiciones, Resultados, Rotaciones } from "./_ui/Play";
import { Bases, Equipos, Personal, Resumen } from "./_ui/Setup";

// Panel del operador de The Games (ADR-089, ADR-091): una pestaña por área, como la ficha de un
// macroevento. Solo se leen los datos de la pestaña abierta.

const AREAS = [
  "resumen",
  "equipos",
  "bases",
  "personal",
  "rotaciones",
  "resultados",
  "posiciones",
  "extras",
  "anuncios",
  "apuestas",
] as const;
type Area = (typeof AREAS)[number];

export async function generateMetadata() {
  return { title: t("T-2763") };
}

export default async function CompetitionPage({
  params,
  searchParams,
}: PageProps<"/admin/the-games/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const requested = single(search.area);
  const area: Area = (AREAS as readonly string[]).includes(requested)
    ? (requested as Area)
    : "resumen";
  const base = `/admin/the-games/${id}`;
  const { actor, competition } = await requireCompetitionOperator(id, `${base}?area=${area}`);
  const context = { competitionId: id, area };
  const labels = tList("T-2805");
  const options = AREAS.map((value, index) => ({
    value,
    label: labels[index] ?? value,
    href: `${base}?area=${value}`,
  }));
  const serverNow = new Date().toISOString();
  const statuses = tList("T-2804");
  const statusLabel =
    statuses[["DRAFT", "LIVE", "FINISHED", "ARCHIVED"].indexOf(competition.status)];

  let body: React.ReactNode = null;
  if (area === "resumen") {
    const [teams, bases, rotations, forms] = await Promise.all([
      listTeams(id),
      listBases(id),
      listRotations(id),
      listFormOptions(),
    ]);
    body = (
      <Resumen
        context={context}
        competition={competition}
        counts={{ teams: teams.length, bases: bases.length, rotations: rotations.length }}
        forms={forms}
        isAdmin={actor.isAdmin}
      />
    );
  } else if (area === "equipos") {
    const [teams, candidates, captains] = await Promise.all([
      listTeams(id),
      listRegistrationCandidates(id),
      listCaptains(id),
    ]);
    body = (
      <Equipos
        context={context}
        teams={teams}
        candidates={candidates}
        hasForm={competition.registrationFormId !== null}
        captains={captains}
        showCaptains={competition.showCaptains}
        isAdmin={actor.isAdmin}
      />
    );
  } else if (area === "bases") {
    body = <Bases context={context} bases={await listBases(id)} />;
  } else if (area === "personal") {
    const [staff, bases, members] = await Promise.all([
      listStaff(id),
      listBases(id),
      listActiveMemberRefs(true),
    ]);
    body = (
      <Personal
        context={context}
        staff={staff}
        bases={bases}
        members={members
          .filter((member) => !member.anonymized)
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "es"))}
      />
    );
  } else if (area === "rotaciones") {
    const rotationId = single(search.rotacion);
    const [rotations, schedule, bases, teams, selected] = await Promise.all([
      listRotations(id),
      getScheduleForValidation(id),
      listBases(id),
      listTeams(id),
      rotationId ? getRotation(id, rotationId) : Promise.resolve(null),
    ]);
    body = (
      <Rotaciones
        context={context}
        rotations={rotations}
        selected={selected}
        report={validateSchedule(schedule.rotations, schedule.teams, schedule.bases)}
        bases={bases}
        teams={teams}
        serverNow={serverNow}
      />
    );
  } else if (area === "resultados") {
    const [{ current }, pending] = await Promise.all([
      getLiveRotations(id),
      listPendingMatchups(id),
    ]);
    body = (
      <>
        <Actualizador intervalMs={15_000} />
        <Resultados context={context} current={current} pending={pending} serverNow={serverNow} />
      </>
    );
  } else if (area === "posiciones") {
    body = <Posiciones standings={await listStandings(id)} scope={single(search.alcance)} />;
  } else if (area === "extras") {
    const [extras, teams, ledger] = await Promise.all([
      listExtras(id),
      listTeams(id),
      listLedger(id),
    ]);
    body = <Extras context={context} extras={extras} teams={teams} ledger={ledger} />;
  } else if (area === "anuncios") {
    body = <Anuncios context={context} announcements={await listAnnouncements(id)} />;
  } else {
    const [markets, teams, balances] = await Promise.all([
      listMarkets(id),
      listTeams(id),
      creditBalances(id),
    ]);
    body = (
      <Apuestas
        context={context}
        competition={competition}
        markets={markets}
        teams={teams}
        balances={balances}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/admin/the-games" className="self-start text-sm underline">
          {t("T-2763")}
        </Link>
        <h1 className="text-display-lg">{competition.name}</h1>
        <p className="text-tinta-suave">
          {statusLabel}
          {competition.isRehearsal ? ` · ${t("T-2892")}` : ""}
        </p>
      </header>
      {single(search.guardado) === "1" ? (
        <output className="rounded-xl border border-borde px-4 py-3">{t("T-259")}</output>
      ) : null}
      {single(search.aviso) ? (
        <output className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {single(search.aviso)}
        </output>
      ) : null}
      {single(search.error) ? (
        <p role="alert" className="text-sm font-semibold text-oe-orange">
          {single(search.error)}
        </p>
      ) : null}
      <nav aria-label={t("T-2763")}>
        <AdminSectionSelect label={t("T-2763")} value={area} options={options} />
        <ul className="m-0 hidden list-none flex-wrap gap-1 border-b border-borde p-0 md:flex">
          {options.map((option) => (
            <li key={option.value}>
              <Link
                href={option.href}
                aria-current={area === option.value ? "page" : undefined}
                className={`inline-block rounded-t-xl border-b-2 px-4 py-3 text-sm font-semibold ${area === option.value ? "border-oe-orange bg-fondo-suave text-titulo" : "border-transparent text-titulo hover:bg-fondo-suave"}`}
              >
                {option.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
