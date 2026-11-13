import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { excerpt } from "@/modules/content";
import { getEdition } from "@/modules/events";
import { getPublicForm, HONEYPOT_FIELD } from "@/modules/forms";
import { getActor } from "@/modules/identity";
import { getPrivacyPolicyState } from "@/modules/system";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import { Elemento, SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { paginaMetadata } from "@/shared/lib/seo";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Markdown } from "@/shared/ui/Markdown";
import { Afiche } from "../../_ui/Afiche";
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
  const [firstName, lastName, email] = tList("T-851");
  const enviado = search.ok === "1";
  // La entrada recién emitida (ADR-187): solo un código con la forma de los que genera la casa.
  const entrada =
    typeof search.entrada === "string" && /^[A-Za-z0-9_-]{24}$/.test(search.entrada)
      ? search.entrada
      : null;
  const [verEntrada, guardala] = tList("T-5032");
  const edicion =
    enviado && search.inscrito === "1" && formulario.parsedActions.editionId
      ? await getEdition(formulario.parsedActions.editionId)
      : null;
  return (
    <>
      <Afiche variante="azul" titulo={formulario.title} />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        {formulario.description ? <Markdown source={formulario.description} /> : null}
        {actor?.membershipStatus === "ON_LEAVE" ? (
          <Aviso>{t("T-2041")}</Aviso>
        ) : enviado ? (
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
            {edicion && entrada ? (
              <p className="flex flex-col gap-1">
                <Link
                  href={`/entrada/${entrada}`}
                  className="self-start text-lg font-semibold underline"
                >
                  {verEntrada}
                </Link>
                <span>{guardala}</span>
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
    </>
  );
}
