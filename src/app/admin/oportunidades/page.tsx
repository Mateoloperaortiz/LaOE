import type { Metadata } from "next";
import { opportunitiesResource } from "@/modules/crm/admin";
import { ResourcePage } from "../_kit/ResourcePage";

// Oportunidades de los aliados (ADR-186): ADMIN las publica para miembros, egresados o los dos.

export const metadata: Metadata = { title: opportunitiesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/oportunidades">) {
  return <ResourcePage resource={opportunitiesResource} searchParams={await searchParams} />;
}
