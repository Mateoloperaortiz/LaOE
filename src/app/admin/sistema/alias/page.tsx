import type { Metadata } from "next";
import { aliasesResource } from "@/modules/participation/admin";
import { ResourcePage } from "../../_kit/ResourcePage";

export const metadata: Metadata = { title: aliasesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/sistema/alias">) {
  return <ResourcePage resource={aliasesResource} searchParams={await searchParams} />;
}
