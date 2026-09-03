import type { Metadata } from "next";
import { announcementsResource } from "@/modules/content/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: announcementsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/cartelera">) {
  return <ResourcePage resource={announcementsResource} searchParams={await searchParams} />;
}
