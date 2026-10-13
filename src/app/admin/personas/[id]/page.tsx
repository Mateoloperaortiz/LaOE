import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { getPreferences, listMessagesFor, subscriptionSummaryFor } from "@/modules/comms";
import {
  countOpenTasksFor,
  type InteractionKind,
  latestContact,
  listCardsByPerson,
  listInteractions,
  listRecognitionsFor,
  listRequestsByPerson,
  listTasks,
} from "@/modules/crm";
import { assigneeOptions } from "@/modules/crm/admin";
import { listRegistrationsByPerson, listSubmissionsByPerson } from "@/modules/forms";
import {
  getCarnetMetadata,
  hasRecentStepUp,
  listPermissionsFor,
  requireAdminActor,
} from "@/modules/identity";
import {
  assemblyStatusFor,
  attendedRequired,
  balanceFor,
  getOccasionsByIds,
  listAchievementsForPerson,
  listBoostersFor,
  listCheckInsForPerson,
  listEntriesForPerson,
  requiredTotal,
} from "@/modules/participation";
import {
  getMyMembership,
  getPerson360,
  honoraryEligibility,
  honoraryFacts,
  listAllCommittees,
  listAllTags,
  listCommitteeRoles,
  listCommitteesForSelection,
  listPersonTags,
} from "@/modules/people";
import { listTeamParticipations, listWorkCommitteeTermIds } from "@/modules/permanence";
import { TeamParticipations } from "@/modules/permanence/components/TeamParticipations";
import { getConfig, getPrivacyPolicyState } from "@/modules/system";
import { listAllTerms } from "@/modules/terms";
import { listPassesFor } from "@/modules/wallet";
import { t } from "@/shared/copy";
import { Cabecera } from "./_ui/Cabecera";
import { isTab, isTimelineFilter, type Tab, tabLabels } from "./_ui/etiquetas";
import { Paneles } from "./_ui/Paneles";
import { Pestanas } from "./_ui/Pestanas";
import { TabFormularios } from "./_ui/TabFormularios";
import { TabParticipacion } from "./_ui/TabParticipacion";
import { TabPermanencia } from "./_ui/TabPermanencia";
import { TabSolicitudes } from "./_ui/TabSolicitudes";
import {
  TabComunicaciones,
  TabDatos,
  TabLinea,
  TabMembresia,
  TabResumen,
  TabTareas,
} from "./_ui/Tabs";

// Persona 360 (02-crm.md, ADR-034): UI a medida con pestañas por URL y acciones en panel lateral.

type Search = Record<string, string | string[] | undefined>;

/** Los tipos con filtro propio en la línea de tiempo; «Otros» es todo lo demás. */
const MAIN_KINDS: InteractionKind[] = [
  "NOTE",
  "MEMBERSHIP",
  "COMMITTEES",
  "CONSENT",
  "DATA",
  "IMPORTED",
  "PARTICIPATION",
  "FORM",
  "PIPELINE",
  "REQUEST",
  "CALL",
];

export async function generateMetadata({
  params,
}: PageProps<"/admin/personas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getPerson360(id);
  return { title: data?.person.fullName?.trim() || "" };
}

export default async function PersonaPage({
  params,
  searchParams,
}: PageProps<"/admin/personas/[id]">) {
  const { id } = await params;
  const search: Search = await searchParams;
  const actor = await requireAdminActor(`/admin/personas/${id}`);
  const data = await getPerson360(id);
  if (!data) {
    notFound();
  }
  const requested = single(search.pestana);
  const tab: Tab = isTab(requested) ? requested : "resumen";
  const accion = single(search.accion);
  if (accion === "anonimizar" && !hasRecentStepUp(actor)) {
    redirect(
      `/ingresar/paso?next=${encodeURIComponent(`/admin/personas/${id}?pestana=${tab}&accion=anonimizar`)}`,
    );
  }
  const saved = single(search.guardado) === "1";
  const carnetSaved = single(search.guardado) === "carnet";
  const error = single(search.error);
  const requestedFilter = single(search.tipo);
  const filter = isTimelineFilter(requestedFilter) ? requestedFilter : "ALL";
  const [
    my,
    permissions,
    committees,
    roles,
    terms,
    messages,
    preferences,
    devices,
    deletionDays,
    personTags,
    allTags,
    openTasks,
    lastContact,
    policy,
    passes,
    carnet,
  ] = await Promise.all([
    getMyMembership(id),
    listPermissionsFor(id),
    listAllCommittees(),
    listCommitteeRoles(),
    listAllTerms(),
    tab === "comunicaciones" ? listMessagesFor(id) : Promise.resolve([]),
    tab === "comunicaciones" ? getPreferences(id) : Promise.resolve(null),
    tab === "comunicaciones"
      ? subscriptionSummaryFor(id)
      : Promise.resolve({ devices: 0, lastSeenAt: null }),
    getConfig("privacy.deletionDays"),
    listPersonTags(id),
    listAllTags(),
    countOpenTasksFor(id),
    latestContact(id),
    getPrivacyPolicyState(),
    tab === "comunicaciones" ? listPassesFor(id) : Promise.resolve([]),
    tab === "comunicaciones" ? getCarnetMetadata(id) : Promise.resolve(null),
  ]);
  const interactions =
    tab === "linea"
      ? await listInteractions(id, filter === "OTHER" ? { except: MAIN_KINDS } : filter)
      : [];
  const tasks =
    tab === "tareas" ? (await listTasks({ q: "", personId: id, page: 1, pageSize: 100 })).rows : [];
  const assignees = accion === "tarea" ? await assigneeOptions() : [];
  const [checkIns, entries, balance, assemblies, achievements, boosters] = await Promise.all([
    tab === "participacion" ? listCheckInsForPerson(id) : Promise.resolve([]),
    tab === "participacion" ? listEntriesForPerson(id) : Promise.resolve([]),
    my.term ? balanceFor(id, my.term.id) : Promise.resolve(null),
    my.term && tab === "resumen" ? assemblyStatusFor(id, my.term) : Promise.resolve(null),
    tab === "participacion" ? listAchievementsForPerson(id) : Promise.resolve([]),
    tab === "participacion" ? listBoostersFor(id) : Promise.resolve([]),
  ]);
  const occasions = await getOccasionsByIds(checkIns.map((item) => item.occasionId));
  const requests = tab === "solicitudes" ? await listRequestsByPerson(id) : [];
  const [submissions, registrations, cards] = await Promise.all([
    tab === "formularios" ? listSubmissionsByPerson(id) : Promise.resolve([]),
    tab === "formularios" ? listRegistrationsByPerson(id) : Promise.resolve([]),
    tab === "formularios" ? listCardsByPerson(id) : Promise.resolve([]),
  ]);
  const termCodes = new Map(terms.map((item) => [item.id, item.code]));
  const note =
    accion === "nota" && single(search.nota)
      ? ((await listInteractions(id, "NOTE")).find((item) => item.id === single(search.nota)) ??
        null)
      : null;
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  // Para elegir, solo los vivos más los que la persona ya tiene (ADR-073 regla 2).
  const committeeOptions = accion
    ? await listCommitteesForSelection(my.committees.map((item) => item.committeeId))
    : committees;
  const closeHref = `/admin/personas/${id}?pestana=${tab}`;

  const teams =
    my.term && tab === "resumen" ? await listTeamParticipations([id], my.term.id) : new Map();
  let content: React.ReactNode;
  switch (tab) {
    case "resumen":
      content = (
        <>
          {my.term ? <TeamParticipations items={teams.get(id) ?? []} term={my.term.code} /> : null}
          <TabResumen
            data={data}
            permissions={permissions}
            committeeNames={committeeNames}
            lastContact={lastContact}
            openTasks={openTasks}
            balance={balance}
            assemblies={
              assemblies
                ? t("T-670", {
                    n: attendedRequired(assemblies.requirement, assemblies.compliance),
                    total: requiredTotal(assemblies.requirement),
                  })
                : null
            }
          />
        </>
      );
      break;
    case "participacion":
      content = (
        <TabParticipacion
          personId={id}
          checkIns={checkIns}
          occasions={occasions}
          entries={entries}
          termCodes={termCodes}
          achievements={achievements}
          boosters={boosters}
        />
      );
      break;
    case "permanencia":
      content = (
        <TabPermanencia
          personId={id}
          termId={
            terms.find((item) => item.id === single(search.semestre))?.id ?? my.term?.id ?? null
          }
          terms={terms.map((item) => ({ id: item.id, code: item.code }))}
          accion={accion}
          error={error}
          closeHref={closeHref}
        />
      );
      break;
    case "formularios":
      content = (
        <TabFormularios
          submissions={submissions}
          registrations={registrations}
          cards={cards.map((item) => ({
            id: item.id,
            pipelineId: item.pipelineId,
            pipelineName: item.pipelineName,
            stageName: item.stageName,
            closedAt: item.closedAt,
            enteredStageAt: item.enteredStageAt,
          }))}
        />
      );
      break;
    case "solicitudes":
      content = <TabSolicitudes requests={requests} />;
      break;
    case "linea":
      content = (
        <TabLinea
          personId={id}
          interactions={interactions}
          filter={filter}
          actorId={actor.personId}
        />
      );
      break;
    case "membresia": {
      const [facts, workCommitteeTermIds, recognitions] = await Promise.all([
        honoraryFacts(id),
        listWorkCommitteeTermIds(id),
        listRecognitionsFor(id),
      ]);
      content = (
        <TabMembresia
          data={data}
          my={my}
          honorary={honoraryEligibility({ ...facts, workCommitteeTermIds })}
          recognitions={recognitions}
        />
      );
      break;
    }
    case "comunicaciones":
      content = (
        <TabComunicaciones
          personId={id}
          passes={passes}
          canRevokeCarnet={
            carnet !== null &&
            (data.membership?.status === "ACTIVE" || data.membership?.status === "HONORARY")
          }
          // Emiten ADMIN y BOARD, y nunca para sí mismos (ADR-051, regla 4).
          canIssueGrant={
            (actor.isAdmin || actor.permissions.some((item) => item.code === "BOARD")) &&
            actor.personId !== id
          }
          messages={messages}
          preferences={
            preferences ?? {
              personId: id,
              emailCampaigns: true,
              pushAnnouncements: true,
              pushPoints: true,
              pushReminders: true,
              pushWordle: true,
              unsubscribeToken: null,
              updatedAt: null,
            }
          }
          devices={devices}
        />
      );
      break;
    case "tareas":
      content = <TabTareas personId={id} tasks={tasks} />;
      break;
    case "datos":
      content = (
        <TabDatos data={data} deletionDays={deletionDays ?? 15} policyReady={policy.ready} />
      );
      break;
    default:
      content = <p className="text-tinta-suave">{t("T-240")}</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <Cabecera
        data={data}
        my={my}
        permissions={permissions}
        committeeNames={committeeNames}
        tags={personTags}
      />
      {saved || carnetSaved ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {t(carnetSaved ? "T-1213" : "T-259")}
        </output>
      ) : null}
      {error && !accion ? (
        <p
          role="alert"
          className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      <Pestanas personId={id} active={tab} />
      <section aria-label={tabLabels()[tab]}>{content}</section>
      {accion ? (
        <Paneles
          accion={accion}
          data={data}
          my={my}
          committees={committeeOptions}
          roles={roles}
          terms={terms}
          tags={allTags}
          personTagIds={personTags.map((item) => item.id)}
          assignees={assignees}
          note={note}
          semestreId={terms.find((item) => item.id === single(search.semestre))?.id ?? null}
          sancionId={single(search.sancion) || null}
          closeHref={closeHref}
          error={error}
          policyReady={policy.ready}
        />
      ) : null}
    </div>
  );
}
