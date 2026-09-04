import type { Metadata } from "next";
import { termsResource } from "@/modules/terms/admin";
import { ResourcePage } from "../_kit/ResourcePage";

export const metadata: Metadata = { title: termsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/terminos">) {
  return <ResourcePage resource={termsResource} searchParams={await searchParams} />;
}
