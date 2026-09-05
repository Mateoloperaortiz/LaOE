import type { Metadata } from "next";
import { organizationsResource } from "@/modules/crm/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: organizationsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/organizaciones">) {
  return <ResourcePage resource={organizationsResource} searchParams={await searchParams} />;
}
