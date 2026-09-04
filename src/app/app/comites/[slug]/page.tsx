import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/modules/identity";
import { listInternalRoster } from "@/modules/people";
import { BarraTitulo, Cartel } from "@/shared/brand";
import { t } from "@/shared/copy";
import { Markdown } from "@/shared/ui/Markdown";
import { cargoEnComite, PersonaTarjeta } from "../../_ui/PersonaTarjeta";
import { Vacio } from "../../_ui/Vacio";

// Comité interno (06-mapa-del-sitio.md): presentación, contacto y quiénes están este semestre, con la
// dirección primero. Sin correos ni celulares.

export async function generateMetadata({
  params,
}: PageProps<"/app/comites/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const roster = await listInternalRoster(slug);
  return { title: roster?.committee.name ?? t("T-309") };
}

export default async function ComiteInternoPage({ params }: PageProps<"/app/comites/[slug]">) {
  const { slug } = await params;
  await requireActor(`/app/comites/${slug}`);
  const roster = await listInternalRoster(slug);
  if (!roster) {
    notFound();
  }
  const { committee, term, members } = roster;
  return (
    <div className="flex flex-col gap-10">
      <Cartel
        variante="azul"
        nivel="h1"
        tamano="hero"
        titulo={committee.name}
        isotipo={!committee.logoKey}
        {...(committee.logoKey
          ? { comite: { slug: committee.logoKey, name: committee.name } }
          : {})}
        {...(term ? { eyebrow: term.code } : {})}
      />
      <section className="flex flex-col gap-4">
        {committee.presentation ? (
          <Markdown source={committee.presentation} className="max-w-prose" />
        ) : (
          <p className="max-w-prose text-lg">{t("T-310")}</p>
        )}
        {committee.contactUrl ? (
          <a
            href={committee.contactUrl}
            target="_blank"
            rel="noreferrer"
            className="boton-secundario self-start"
          >
            {t("T-024")}
          </a>
        ) : null}
      </section>
      <section aria-labelledby="roster" className="flex flex-col gap-6">
        <BarraTitulo color="amarillo" className="self-start">
          <span id="roster">{t("T-383")}</span>
        </BarraTitulo>
        {members.length === 0 ? (
          <Vacio texto={t("T-384")} elemento="asterisco" color="text-oe-navy" />
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <li key={member.personId}>
                <PersonaTarjeta
                  nombre={member.fullName}
                  fotoId={member.photoAssetId}
                  estado={member.status}
                  comites={[cargoEnComite(member.roleLabel, committee.name)]}
                  cargos={[]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <Link href="/app/comites" className="self-start">
        {t("T-385")}
      </Link>
    </div>
  );
}
