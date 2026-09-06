import type { Metadata } from "next";
import { campaignsResource } from "@/modules/comms/admin";
import { ResourcePage } from "../_kit/ResourcePage";

// Campañas (ADR-038 regla 8): una plantilla a un segmento; el detalle programa, envía y sigue el avance.
export const metadata: Metadata = { title: campaignsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/campanas">) {
  return <ResourcePage resource={campaignsResource} searchParams={await searchParams} />;
}
