import type { Metadata } from "next";
import { pagesResource } from "@/modules/content/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: pagesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/paginas">) {
  return <ResourcePage resource={pagesResource} searchParams={await searchParams} />;
}
