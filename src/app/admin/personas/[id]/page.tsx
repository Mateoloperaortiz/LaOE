import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listMessagesFor } from "@/modules/comms";
import { countOpenTasksFor, latestContact, listInteractions, listTasks } from "@/modules/crm";
import { assigneeOptions } from "@/modules/crm/admin";
import { listPermissionsFor, requireAdminActor } from "@/modules/identity";
import {
  assemblyStatusFor,
  balanceFor,
  getOccasionsByIds,
  listCheckInsForPerson,
  listEntriesForPerson,
} from "@/modules/participation";
import {
  getMyMembership,
  getPerson360,
  listAllCommittees,
  listAllTags,
  listCommitteeRoles,
  listPersonTags,
} from "@/modules/people";
import { getConfig } from "@/modules/system";
import { listAllTerms } from "@/modules/terms";
import { t } from "@/shared/copy";
import { Cabecera } from "./_ui/Cabecera";
import { isTab, isTimelineFilter, type Tab, tabLabels } from "./_ui/etiquetas";
import { Paneles } from "./_ui/Paneles";
import { Pestanas } from "./_ui/Pestanas";
import { TabParticipacion } from "./_ui/TabParticipacion";
import { TabPermanencia } from "./_ui/TabPermanencia";
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

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const MAIN_KINDS = [
  "NOTE",
  "MEMBERSHIP",
  "COMMITTEES",
  "CONSENT",
  "DATA",
  "IMPORTED",
  "PARTICIPATION",
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
  const saved = single(search.guardado) === "1";
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
    deletionDays,
    personTags,
    allTags,
    openTasks,
    lastContact,
  ] = await Promise.all([
    getMyMembership(id),
    listPermissionsFor(id),
    listAllCommittees(),
    listCommitteeRoles(),
    listAllTerms(),
    tab === "comunicaciones" ? listMessagesFor(id) : Promise.resolve([]),
    getConfig("privacy.deletionDays"),
    listPersonTags(id),
    listAllTags(),
    countOpenTasksFor(id),
    latestContact(id),
  ]);
  const interactions =
    tab === "linea"
      ? (await listInteractions(id, filter === "OTHER" ? "ALL" : filter)).filter(
          (item) => filter !== "OTHER" || !MAIN_KINDS.includes(item.kind),
        )
      : [];
  const tasks =
    tab === "tareas" ? (await listTasks({ q: "", personId: id, page: 1, pageSize: 100 })).rows : [];
  const assignees = accion === "tarea" ? await assigneeOptions() : [];
  const [checkIns, entries, balance, assemblies] = await Promise.all([
    tab === "participacion" ? listCheckInsForPerson(id) : Promise.resolve([]),
    tab === "participacion" ? listEntriesForPerson(id) : Promise.resolve([]),
    my.term ? balanceFor(id, my.term.id) : Promise.resolve(null),
    my.term && tab === "resumen" ? assemblyStatusFor(id, my.term) : Promise.resolve(null),
  ]);
  const occasions = await getOccasionsByIds(checkIns.map((item) => item.occasionId));
  const termCodes = new Map(terms.map((item) => [item.id, item.code]));
  const note =
    accion === "nota" && single(search.nota)
      ? ((await listInteractions(id, "NOTE")).find((item) => item.id === single(search.nota)) ??
        null)
      : null;
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  const closeHref = `/admin/personas/${id}?pestana=${tab}`;

  let content: React.ReactNode;
  switch (tab) {
    case "resumen":
      content = (
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
                  n:
                    Math.min(
                      assemblies.compliance.ordinaryAttended,
                      assemblies.requirement.requiredOrdinary,
                    ) +
                    (assemblies.requirement.requiresBoardElection &&
                    assemblies.compliance.boardElectionAttended
                      ? 1
                      : 0) +
                    (assemblies.requirement.requiresRunoff && assemblies.compliance.runoffAttended
                      ? 1
                      : 0),
                  total:
                    assemblies.requirement.requiredOrdinary +
                    (assemblies.requirement.requiresBoardElection ? 1 : 0) +
                    (assemblies.requirement.requiresRunoff ? 1 : 0),
                })
              : null
          }
        />
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
        />
      );
      break;
    case "permanencia":
      content = (
        <TabPermanencia
          personId={id}
          termId={my.term?.id ?? null}
          accion={accion}
          error={error}
          closeHref={closeHref}
        />
      );
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
    case "membresia":
      content = <TabMembresia data={data} my={my} />;
      break;
    case "comunicaciones":
      content = <TabComunicaciones messages={messages} />;
      break;
    case "tareas":
      content = <TabTareas personId={id} tasks={tasks} />;
      break;
    case "datos":
      content = <TabDatos data={data} deletionDays={deletionDays ?? 15} />;
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
      {saved ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {t("T-259")}
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
          committees={committees}
          roles={roles}
          terms={terms}
          tags={allTags}
          personTagIds={personTags.map((item) => item.id)}
          assignees={assignees}
          note={note}
          closeHref={closeHref}
          error={error}
        />
      ) : null}
    </div>
  );
}
