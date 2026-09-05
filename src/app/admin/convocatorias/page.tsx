import type { Metadata } from "next";
import { callsResource } from "@/modules/crm/admin";
import { ResourcePage } from "../_kit/ResourcePage";
import { convocatoriasResource } from "../_kit/registry";

export const metadata: Metadata = { title: callsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/convocatorias">) {
  return <ResourcePage resource={convocatoriasResource} searchParams={await searchParams} />;
}
