import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor, hasRecentStepUp, safeNextPath } from "@/modules/identity";
import { initialStepUpState } from "@/modules/identity/actions";
import { StepUpForm } from "@/modules/identity/components/StepUpForm";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-045"), robots: { index: false } };

// Step-up: un código nuevo para acciones sensibles del admin (conceder permisos, exportes con datos personales).
export default async function PasoPage({ searchParams }: PageProps<"/ingresar/paso">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/admin");
  const actor = await getActor();
  if (!actor) {
    // Sin sesión: al entrar, ese OTP ya cuenta como step-up, así que vuelve directo al destino.
    redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  }
  if (hasRecentStepUp(actor)) {
    redirect(next);
  }
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <span className="self-start text-titulo">
        <LogoOE height={88} />
      </span>
      <h1 className="text-display-lg">{t("T-045")}</h1>
      <StepUpForm
        initialState={await initialStepUpState(next)}
        labels={{
          intro: t("T-055"),
          request: t("T-043"),
          codeTitle: t("T-045"),
          codeLabel: t("T-238"),
          verify: t("T-046"),
        }}
      />
    </main>
  );
}
