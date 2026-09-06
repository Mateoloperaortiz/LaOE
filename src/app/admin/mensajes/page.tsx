import type { Metadata } from "next";
import { messagesResource } from "@/modules/comms/admin";
import { ResourcePage } from "../_kit/ResourcePage";

// Registro de mensajes (ADR-038 regla 11): todo lo enviado por correo o push, persona por persona.
export const metadata: Metadata = { title: messagesResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/mensajes">) {
  return <ResourcePage resource={messagesResource} searchParams={await searchParams} />;
}
