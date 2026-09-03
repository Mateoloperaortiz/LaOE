import type { Metadata } from "next";
import { committeesResource } from "@/modules/people/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: committeesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/comites">) {
  return <ResourcePage resource={committeesResource} searchParams={await searchParams} />;
}
