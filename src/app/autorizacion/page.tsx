import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { findPublicPage } from "@/modules/content";
import { getActor } from "@/modules/identity";
import { signOutAction } from "@/modules/identity/actions";
import { hasLiveConsent } from "@/modules/people";
import { getPrivacyPolicyState } from "@/modules/system";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy";
import { Markdown } from "@/shared/ui/Markdown";
import { autorizarAction } from "./actions";

export const metadata: Metadata = { title: t("T-2085"), robots: { index: false } };

// Puerta de entrada a Mi OE (ADR-048): sin autorización viva no se llega al resto, pero los
// derechos del titular —leer la política y descargar sus datos— siguen disponibles acá.
export default async function AutorizacionPage() {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fapp");
  }
  if (await hasLiveConsent(actor.personId, "MEMBERSHIP")) {
    redirect("/app");
  }
  const [policy, pagina] = await Promise.all([
    getPrivacyPolicyState(),
    findPublicPage("privacidad"),
  ]);
  const publicada = policy.ready && pagina?.status === "PUBLISHED" && pagina.body.trim().length > 0;
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12">
      <LogoOE height={72} />
      <div className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-2085")}</h1>
        <p className="max-w-prose text-lg">{publicada ? t("T-2086") : t("T-2088")}</p>
      </div>
      {publicada && pagina ? (
        <>
          <section aria-labelledby="politica-titulo" className="flex flex-col gap-4">
            <h2 id="politica-titulo" className="text-display-md">
              {pagina.title}
            </h2>
            <Markdown source={pagina.body} />
          </section>
          <div className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5">
            <p className="max-w-prose text-sm">
              {t("T-150", { v: policy.version ?? "—", versión: policy.version ?? "—" })}
            </p>
            <form action={autorizarAction}>
              <button type="submit" className="boton-primario">
                {t("T-2087")}
              </button>
            </form>
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/privacidad">{t("T-865")}</Link>
        <a href="/api/mis-datos">{t("T-135")}</a>
        <form action={signOutAction}>
          <button type="submit" className="boton-secundario text-sm">
            {t("T-231")}
          </button>
        </form>
      </div>
    </main>
  );
}
