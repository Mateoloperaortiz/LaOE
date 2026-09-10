import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getActor, safeNextPath } from "@/modules/identity";
import { initialLoginState } from "@/modules/identity/actions";
import { LoginForm } from "@/modules/identity/components/LoginForm";
import { LogoOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-040"), robots: { index: false } };

export default async function IngresarPage({ searchParams }: PageProps<"/ingresar">) {
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
        {next.startsWith("/a/") || next.startsWith("/f/") ? (
          <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 text-lg font-semibold text-oe-navy">
            {next.startsWith("/a/") ? t("T-100") : t("T-864")}
          </p>
        ) : null}
        <p className="text-lg">{t("T-2093")}</p>
      </div>
      <LoginForm
        initialState={await initialLoginState(next)}
        labels={{
          emailLabel: t("T-042"),
          passwordLabel: t("T-2094"),
          rememberLabel: t("T-047"),
          submitButton: t("T-2095"),
        }}
      />
      {/* Texto fijo: nunca depende del correo tecleado, para no enumerar el roster (ADR-051). */}
      <div className="flex flex-col gap-3 border-borde border-t pt-6 text-sm">
        <p>{t("T-2098")}</p>
        <Link
          href={`/ingresar/codigo?next=${encodeURIComponent(next)}`}
          className="text-enlace underline underline-offset-4"
        >
          {t("T-2099")}
        </Link>
      </div>
    </main>
  );
}
