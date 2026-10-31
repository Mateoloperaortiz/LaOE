import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor, safeNextPath } from "@/modules/identity";
import { initialCodeLoginState } from "@/modules/identity/actions";
import { CodeLoginForm } from "@/modules/identity/components/CodeLoginForm";
import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

export const metadata: Metadata = { title: t("T-045"), robots: { index: false } };

// Método alterno (ADR-051): el OTP al correo institucional, que Check Point sigue reteniendo.
export default async function IngresarPorCodigoPage({
  searchParams,
}: PageProps<"/ingresar/codigo">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (await getActor()) {
    redirect(next);
  }
  const [inicio] = tList("T-038");
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <Link href="/" className="self-start text-titulo" aria-label={inicio}>
        <LogoOE height={88} />
      </Link>
      <div className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-040")}</h1>
        <p className="text-lg">{t("T-041")}</p>
        <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">{t("T-2100")}</p>
      </div>
      <CodeLoginForm
        initialState={await initialCodeLoginState(next)}
        labels={{
          emailLabel: t("T-042"),
          requestButton: t("T-043"),
          codeTitle: t("T-045"),
          codeLabel: t("T-238"),
          rememberLabel: t("T-047"),
          verifyButton: t("T-046"),
          restartButton: t("T-237"),
        }}
      />
      <Link
        href={`/ingresar?next=${encodeURIComponent(next)}`}
        className="text-enlace text-sm underline underline-offset-4"
      >
        {t("T-2133")}
      </Link>
    </main>
  );
}
