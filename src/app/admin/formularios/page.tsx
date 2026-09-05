import type { Metadata } from "next";
import { formsResource } from "@/modules/forms/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: formsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/formularios">) {
  return <ResourcePage resource={formsResource} searchParams={await searchParams} />;
}
