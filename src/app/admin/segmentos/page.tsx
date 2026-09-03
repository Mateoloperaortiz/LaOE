import type { Metadata } from "next";
import { segmentsResource } from "@/modules/people/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: segmentsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/segmentos">) {
  return <ResourcePage resource={segmentsResource} searchParams={await searchParams} />;
}
