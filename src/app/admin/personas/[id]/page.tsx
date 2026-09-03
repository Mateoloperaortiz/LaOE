import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listMessagesFor } from "@/modules/comms";
import { listPermissionsFor, requireAdminActor } from "@/modules/identity";
import { listAllTerms } from "@/modules/participation";
import {
  getMyMembership,
  getPerson360,
  listAllCommittees,
  listCommitteeRoles,
} from "@/modules/people";
import { getConfig } from "@/modules/system";
import { t } from "@/shared/copy";
import { Cabecera } from "./_ui/Cabecera";
import { isTab, type Tab, tabLabels } from "./_ui/etiquetas";
import { Paneles } from "./_ui/Paneles";
import { Pestanas } from "./_ui/Pestanas";
import { TabComunicaciones, TabDatos, TabMembresia, TabResumen } from "./_ui/Tabs";

// Persona 360 (02-crm.md, ADR-034): UI a medida con pestañas por URL y acciones en panel lateral.

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

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
  await requireAdminActor(`/admin/personas/${id}`);
  const data = await getPerson360(id);
  if (!data) {
    notFound();
  }
  const requested = single(search.pestana);
  const tab: Tab = isTab(requested) ? requested : "resumen";
  const accion = single(search.accion);
  const saved = single(search.guardado) === "1";
  const error = single(search.error);
  const [my, permissions, committees, roles, terms, messages, deletionDays] = await Promise.all([
    getMyMembership(id),
    listPermissionsFor(id),
    listAllCommittees(),
    listCommitteeRoles(),
    listAllTerms(),
    tab === "comunicaciones" ? listMessagesFor(id) : Promise.resolve([]),
    getConfig("privacy.deletionDays"),
  ]);
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  const closeHref = `/admin/personas/${id}?pestana=${tab}`;

  let content: React.ReactNode;
  switch (tab) {
    case "resumen":
      content = (
        <TabResumen data={data} permissions={permissions} committeeNames={committeeNames} />
      );
      break;
    case "membresia":
      content = <TabMembresia data={data} my={my} />;
      break;
    case "comunicaciones":
      content = <TabComunicaciones messages={messages} />;
      break;
    case "datos":
      content = <TabDatos data={data} deletionDays={deletionDays ?? 15} />;
      break;
    default:
      content = <p className="text-tinta-suave">{t("T-240")}</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <Cabecera data={data} my={my} permissions={permissions} committeeNames={committeeNames} />
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
          closeHref={closeHref}
          error={error}
        />
      ) : null}
    </div>
  );
}
