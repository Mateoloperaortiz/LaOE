import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor, hasRecentStepUp, safeNextPath } from "@/modules/identity";
import { initialStepUpState } from "@/modules/identity/actions";
import { StepUpForm } from "@/modules/identity/components/StepUpForm";
import { LogoOE } from "@/shared/brand";
import { t } from "@/shared/copy";

export const metadata: Metadata = { title: t("T-2141"), robots: { index: false } };

// Step-up (ADR-051): la contraseña propia antes de una acción sensible del admin; el código al
// correo queda como alternativa.
export default async function PasoPage({ searchParams }: PageProps<"/ingresar/paso">) {
  const params = await searchParams;
  const next = safeNextPath(params.next, "/admin");
  const actor = await getActor();
  if (!actor) {
    // Sin sesión: al entrar, esa credencial ya cuenta como step-up, así que vuelve al destino.
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
      <h1 className="text-display-lg">{t("T-2141")}</h1>
      <StepUpForm
        initialState={await initialStepUpState(next)}
        labels={{
          intro: t("T-2117"),
          passwordLabel: t("T-2094"),
          confirm: t("T-2095"),
          useCode: t("T-2099"),
          codeIntro: t("T-055"),
          codeLabel: t("T-238"),
          verify: t("T-046"),
          usePassword: t("T-2133"),
        }}
      />
    </main>
  );
}
