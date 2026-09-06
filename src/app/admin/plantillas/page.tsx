import type { Metadata } from "next";
import { templatesResource } from "@/modules/comms/admin";
import { ResourcePage } from "../_kit/ResourcePage";

// Plantillas de correo (ADR-038 regla 8): Markdown con variables por persona.
export const metadata: Metadata = { title: templatesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/plantillas">) {
  return <ResourcePage resource={templatesResource} searchParams={await searchParams} />;
}
