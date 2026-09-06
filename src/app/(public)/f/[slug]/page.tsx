import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { excerpt } from "@/modules/content";
import { getEdition } from "@/modules/events";
import { getPublicForm, HONEYPOT_FIELD } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { getPrivacyPolicyState } from "@/modules/system";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import { BarraTitulo, Elemento, SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { Markdown } from "@/shared/ui/Markdown";
import { FormularioPublico } from "./FormularioPublico";

// Formulario propio (ADR-013, ADR-037): público sin sesión o de miembros con sesión; cerrado, agotado
// o fuera de ventana muestra su aviso; al enviar, el texto de gracias del formulario o T-859.

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{2,60}$/;

async function cargar(slug: string) {
  return SLUG.test(slug) ? getPublicForm(slug) : null;
}

export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const formulario = await cargar(slug);
  if (!formulario) {
    return {};
  }
  return {
    ...paginaMetadata({
      title: formulario.title,
      description: excerpt(formulario.description, 160),
      path: `/f/${formulario.slug}`,
    }),
    robots: { index: false },
  };
}

function Aviso({ children }: { children: string }) {
  return (
    <div className="flex max-w-2xl items-center gap-6 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-6 textura-granito">
      <Elemento tipo="destello" className="size-12 shrink-0 text-oe-orange" />
      <p className="text-lg">{children}</p>
    </div>
  );
}

export default async function FormularioPage({ params, searchParams }: PageProps<"/f/[slug]">) {
  const { slug } = await params;
  const search = await searchParams;
  const formulario = await cargar(slug);
  if (!formulario) {
    notFound();
  }
  const actor = await getActor();
  const policy = await getPrivacyPolicyState();
  if (formulario.audience === "MEMBERS" && !actor) {
    redirect(`/ingresar?next=${encodeURIComponent(`/f/${slug}`)}`);
  }
  const [firstName, lastName, email] = tList("T-851") as [string, string, string];
  const enviado = search.ok === "1";
  const edicion =
    enviado && search.inscrito === "1" && formulario.parsedActions.editionId
      ? await getEdition(formulario.parsedActions.editionId)
      : null;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4">
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {formulario.title}
        </BarraTitulo>
        {formulario.description ? <Markdown source={formulario.description} /> : null}
      </header>
      {enviado ? (
        <section aria-live="polite" className="flex max-w-2xl flex-col gap-4">
          {formulario.thanks ? (
            <Markdown source={formulario.thanks} />
          ) : (
            <p className="text-display-md">{t("T-859")}</p>
          )}
          {edicion ? (
            <p className="text-lg">
              {t("T-867", { edición: `${edicion.eventName} · ${edicion.name}` })}
            </p>
          ) : null}
          <SelloOE tamano="md" />
        </section>
      ) : formulario.state === "FULL" ? (
        <Aviso>{t("T-861")}</Aviso>
      ) : formulario.state === "CLOSED" ? (
        <Aviso>{t("T-860")}</Aviso>
      ) : formulario.consentRequired && !policy.ready ? (
        <PrivacyPolicyNotice />
      ) : (
        <FormularioPublico
          slug={formulario.slug}
          fields={formulario.parsedFields}
          isPublic={formulario.audience === "PUBLIC"}
          consentRequired={formulario.consentRequired}
          honeypotName={HONEYPOT_FIELD}
          memberLine={actor ? t("T-872", { nombre: actor.name, correo: actor.email }) : null}
          labels={{
            firstName,
            lastName,
            email,
            requiredNote: t("T-866"),
            consent: t("T-154"),
            policyLink: t("T-865"),
            submit: t("T-852"),
            honeypot: t("T-873"),
            multiHelp: t("T-870"),
            dateHelp: t("T-871"),
            required: t("T-853"),
          }}
        />
      )}
    </div>
  );
}
