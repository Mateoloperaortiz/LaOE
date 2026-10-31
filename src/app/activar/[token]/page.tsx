import type { Metadata } from "next";
import { resolveAccessGrant } from "@/modules/identity";
import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ActivateForm } from "./ActivateForm";

export const metadata: Metadata = { title: t("T-2101"), robots: { index: false } };

// Enlace de un solo uso que emite la junta (ADR-051). Ruta pública, fuera de /app como
// /autorizacion, porque quien llega todavía no tiene sesión.
export default async function ActivarPage({ params }: PageProps<"/activar/[token]">) {
  const { token } = await params;
  const grant = await resolveAccessGrant(token);
  const [inicio] = tList("T-038");

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="self-start text-titulo" aria-label={inicio}>
        <LogoOE height={88} />
      </Link>
      {grant === null ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-display-lg">{t("T-2101")}</h1>
          <p role="alert" className="rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy">
            {t("T-2107")}
          </p>
          <Link href="/ingresar" className="text-enlace underline underline-offset-4">
            {t("T-2133")}
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <h1 className="text-display-lg">{t("T-2101")}</h1>
            <p className="text-lg">{t("T-2102", { nombre: grant.name })}</p>
            {grant.kind === "ACTIVATION" ? (
              <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">{t("T-2134")}</p>
            ) : null}
            <p className="text-sm text-tinta-suave">{t("T-2111")}</p>
          </div>
          <ActivateForm
            token={token}
            labels={{
              passwordLabel: t("T-2103"),
              confirmationLabel: t("T-2104"),
              hint: t("T-2105"),
              submit: t("T-2106"),
            }}
          />
        </>
      )}
    </main>
  );
}
