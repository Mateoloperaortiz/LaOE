import type { Metadata } from "next";
import { eventsResource } from "@/modules/events/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: eventsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/eventos">) {
  return <ResourcePage resource={eventsResource} searchParams={await searchParams} />;
}
