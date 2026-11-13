import type { Metadata } from "next";
import { mentorshipsResource } from "@/modules/people/admin";
import { ResourcePage } from "../../_kit/ResourcePage";

// Padrinos (ADR-185): ADMIN asigna a cada nuevo del semestre su padrino.

export const metadata: Metadata = { title: mentorshipsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/personas/padrinos">) {
  return <ResourcePage resource={mentorshipsResource} searchParams={await searchParams} />;
}
