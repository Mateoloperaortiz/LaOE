import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEdition } from "@/modules/events";
import { registrationsResource } from "@/modules/forms/admin";
import { ResourcePage } from "../../../../../_kit/ResourcePage";

// Inscritos de una edición (ADR-037 regla 5): recurso de solo lectura con export de datos personales.

const ID = /^[a-z0-9-]{10,40}$/;

export async function generateMetadata({
  params,
}: PageProps<"/admin/eventos/[id]/ediciones/[edicionId]/inscritos">): Promise<Metadata> {
  const { edicionId } = await params;
  const edicion = ID.test(edicionId) ? await getEdition(edicionId) : null;
  return {
    title: edicion
      ? `${registrationsResource.names.plural} · ${edicion.name}`
      : registrationsResource.names.plural,
  };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/eventos/[id]/ediciones/[edicionId]/inscritos">) {
  const { id, edicionId } = await params;
  const edicion = ID.test(edicionId) ? await getEdition(edicionId) : null;
  if (!edicion || edicion.eventId !== id) {
    notFound();
  }
  return (
    <ResourcePage
      resource={registrationsResource}
      searchParams={await searchParams}
      basePath={`/admin/eventos/${id}/ediciones/${edicion.id}/inscritos`}
      fixedFilters={{ editionId: edicion.id }}
      title={`${registrationsResource.names.plural} · ${edicion.eventName} · ${edicion.name}`}
    />
  );
}
