import type { Metadata } from "next";
import { tagsResource } from "@/modules/people/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: tagsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/etiquetas">) {
  return <ResourcePage resource={tagsResource} searchParams={await searchParams} />;
}
