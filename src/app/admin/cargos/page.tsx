import type { Metadata } from "next";
import { rolesResource } from "@/modules/people/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: rolesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/cargos">) {
  return <ResourcePage resource={rolesResource} searchParams={await searchParams} />;
}
