import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/modules/events";
import { editionsResource } from "@/modules/events/admin";
import { ResourcePage } from "../../../_kit/ResourcePage";

// Ediciones de un evento: el recurso plano "ediciones" montado bajo su evento (ADR-033, punto 12).

// cuid2 de la app o uuid de la migración 0003 (los cuatro macroeventos).
const ID = /^[a-z0-9-]{10,40}$/;

async function cargar(id: string) {
  return ID.test(id) ? getEvent(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/admin/eventos/[id]/ediciones">): Promise<Metadata> {
  const { id } = await params;
  const evento = await cargar(id);
  return {
    title: evento
      ? `${editionsResource.names.plural} · ${evento.name}`
      : editionsResource.names.plural,
  };
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/admin/eventos/[id]/ediciones">) {
  const { id } = await params;
  const evento = await cargar(id);
  if (!evento) {
    notFound();
  }
  return (
    <ResourcePage
      resource={editionsResource}
      searchParams={await searchParams}
      basePath={`/admin/eventos/${evento.id}/ediciones`}
      fixedFilters={{ eventId: evento.id }}
      title={`${editionsResource.names.plural} · ${evento.name}`}
    />
  );
}
