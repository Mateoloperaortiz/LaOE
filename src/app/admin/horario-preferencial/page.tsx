import type { Metadata } from "next";
import { preferentialScheduleResource } from "@/modules/people/admin";
import { t } from "@/shared/copy";
import { ResourcePage } from "../_kit/ResourcePage";

// Horario preferencial (Regl. art. 72; ADR-060 regla 13): junta, mesas directivas (máximo seis por
// comité) y directores de macroevento del término; el CSV lleva el correo y exige step-up.

export const metadata: Metadata = { title: preferentialScheduleResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/horario-preferencial">) {
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-2324")}</p>
      <ResourcePage resource={preferentialScheduleResource} searchParams={await searchParams} />
    </div>
  );
}
