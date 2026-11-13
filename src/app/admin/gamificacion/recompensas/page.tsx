import type { Metadata } from "next";
import { thresholdRewardsResource } from "@/modules/participation/admin";
import { ResourcePage } from "../../_kit/ResourcePage";

export const metadata: Metadata = { title: thresholdRewardsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/gamificacion/recompensas">) {
  return <ResourcePage resource={thresholdRewardsResource} searchParams={await searchParams} />;
}
