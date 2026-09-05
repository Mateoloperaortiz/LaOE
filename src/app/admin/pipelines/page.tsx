import type { Metadata } from "next";
import { pipelinesResource } from "@/modules/crm/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: pipelinesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/pipelines">) {
  return <ResourcePage resource={pipelinesResource} searchParams={await searchParams} />;
}
