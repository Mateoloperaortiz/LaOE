import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { getPrivacyPolicyState } from "@/modules/system";
import { ResourceForm } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { savePrivacyPolicyVersionAction } from "./actions";

const PATH = "/admin/sistema/politica";
export const metadata: Metadata = { title: t("T-1180") };

export default async function Page({ searchParams }: PageProps<"/admin/sistema/politica">) {
  const actor = await requireAdminActor(PATH);
  if (!hasRecentStepUp(actor)) redirect(`/ingresar/paso?next=${encodeURIComponent(PATH)}`);
  const [policy, query] = await Promise.all([getPrivacyPolicyState(), searchParams]);
  const version = policy.version ?? "pendiente";
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-display-lg">{t("T-1180")}</h1>
      <p className="max-w-prose text-tinta-suave">{t("T-1181")}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/paginas?q=privacidad" className="boton-secundario">
          {t("T-1185")}
        </Link>
        <Link href="/privacidad" className="boton-secundario">
          {t("T-1186")}
        </Link>
      </div>
      <p className="rounded-xl border border-borde bg-fondo-suave px-4 py-3 font-semibold">
        {t("T-1184", { version })}
      </p>
      {query.guardado === "1" ? (
        <output className="rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {t("T-259")}
        </output>
      ) : null}
      <ResourceForm
        key={version}
        resourceKey="privacy-policy"
        id={null}
        returnTo={PATH}
        fields={[
          {
            name: "version",
            label: t("T-1182"),
            type: "text",
            required: true,
            help: t("T-1183"),
          },
        ]}
        initialValues={{ version }}
        action={savePrivacyPolicyVersionAction}
        cancelHref="/admin"
        labels={{ save: t("T-253"), cancel: t("T-254") }}
      />
    </div>
  );
}
