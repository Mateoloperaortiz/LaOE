import type { Metadata } from "next";
import { permissionsResource } from "@/modules/identity/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: permissionsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/permisos">) {
  return <ResourcePage resource={permissionsResource} searchParams={await searchParams} />;
}
