import type { Metadata } from "next";
import { tasksResource } from "@/modules/crm/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: tasksResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/tareas">) {
  return <ResourcePage resource={tasksResource} searchParams={await searchParams} />;
}
