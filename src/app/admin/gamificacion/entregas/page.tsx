import type { Metadata } from "next";
import { rewardClaimsResource } from "@/modules/participation/admin";
import { ResourcePage } from "../../_kit/ResourcePage";

export const metadata: Metadata = { title: rewardClaimsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/gamificacion/entregas">) {
  return <ResourcePage resource={rewardClaimsResource} searchParams={await searchParams} />;
}
