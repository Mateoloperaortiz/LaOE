import type { Metadata } from "next";
import { collectiveGoalsResource } from "@/modules/participation/admin";
import { ResourcePage } from "../../_kit/ResourcePage";

export const metadata: Metadata = { title: collectiveGoalsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/gamificacion/metas">) {
  return <ResourcePage resource={collectiveGoalsResource} searchParams={await searchParams} />;
}
