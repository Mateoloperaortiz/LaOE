import type { Metadata } from "next";
import { occasionsResource } from "@/modules/participation/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: occasionsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/ocasiones">) {
  return <ResourcePage resource={occasionsResource} searchParams={await searchParams} />;
}
