import type { Metadata } from "next";
import { peopleResource } from "@/modules/people/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: peopleResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/personas">) {
  return <ResourcePage resource={peopleResource} searchParams={await searchParams} />;
}
