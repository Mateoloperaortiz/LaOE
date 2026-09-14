import type { Metadata } from "next";
import { budgetsResource } from "@/modules/finance/admin";
import { ResourcePage } from "../_kit/ResourcePage";

// Presupuestos de los comités (ADR-059, ADR-060 regla 12): recurso del kit; el detalle vive en [id].

export const metadata: Metadata = { title: budgetsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/presupuestos">) {
  return <ResourcePage resource={budgetsResource} searchParams={await searchParams} />;
}
