import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listCommitteeAnnouncements } from "@/modules/content";
import { listRecognitionsByPeople, monthName, type RecognitionView } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { listInternalRoster } from "@/modules/people";
import { BarraTitulo, Cartel } from "@/shared/brand";
import { t } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
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
  const [announcements, recognitions] = await Promise.all([
    listCommitteeAnnouncements(committee.id, 6),
    term
      ? listRecognitionsByPeople(
          members.map((member) => member.personId),
          term.id,
        )
      : Promise.resolve(new Map<string, RecognitionView[]>()),
  ]);
  const insigniasDe = (personId: string) =>
    (recognitions.get(personId) ?? [])
      .filter((item) => item.announcementId !== null && item.kind === "MEMBER_OF_MONTH")
      .map((item) => t("T-703", { mes: monthName(item.month) }));
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
      <section aria-labelledby="cartelera-comite" className="flex flex-col gap-6">
        <BarraTitulo color="naranja" className="self-start">
          <span id="cartelera-comite">{t("T-701", { comité: committee.name })}</span>
        </BarraTitulo>
        {announcements.length === 0 ? (
          <p className="text-tinta-suave">{t("T-702", { comité: committee.name })}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {announcements.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
              >
                <span className="font-semibold">{item.title}</span>
                {item.publishedAt ? (
                  <span className="text-sm text-tinta-suave">{formatDate(item.publishedAt)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
                  comites={[cargoEnComite(member, committee.name)]}
                  cargos={[]}
                  insignias={insigniasDe(member.personId)}
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
