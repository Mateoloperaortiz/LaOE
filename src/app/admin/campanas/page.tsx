import type { Metadata } from "next";
import { campaignsResource } from "@/modules/comms/admin";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ResourcePage } from "../_kit/ResourcePage";

// Campañas (ADR-038 regla 8): una plantilla a un segmento; el detalle programa, envía y sigue el avance.
// Al pie, el enlace al cupo de correo que comparten con lo transaccional (ADR-116 regla 20).
export const metadata: Metadata = { title: campaignsResource.names.plural };

export default async function Page({ searchParams }: PageProps<"/admin/campanas">) {
  return (
    <>
      <ResourcePage resource={campaignsResource} searchParams={await searchParams} />
      <p className="mt-6 text-sm">
        <Link href="/admin/campanas/cupo" className="underline">
          {t("T-3224")}
        </Link>
      </p>
    </>
  );
}
