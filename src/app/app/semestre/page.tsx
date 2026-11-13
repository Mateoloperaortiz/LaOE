import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import { semesterSummaryFor } from "@/modules/participation";
import { listCommitteeMembershipsByTerm } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { Cartel, Numeral, SelloOE } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { SEMESTER_CARDS, semesterCards } from "./semester-cards";

// «Tu semestre en la OE» (ADR-173): el resumen de un semestre cerrado, en la capa de marca. Se abre
// cuando cerró la permanencia del semestre; antes los números todavía cambian. Solo de la persona.

export const metadata: Metadata = { title: tList("T-4961")[0] ?? "" };

export default async function SemestrePage({ searchParams }: PageProps<"/app/semestre">) {
  const actor = await requireActor("/app/semestre");
  const wanted = single((await searchParams).semestre);
  const terms = await listAllTerms();
  const closed = terms
    .filter((term) => term.permanenceClosedAt !== null)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const asked = wanted ? terms.find((term) => term.code === wanted) : undefined;
  const term = asked ?? closed[0];
  const [titulo, entrada, sinCerrar, ninguno] = tList("T-4961");
  if (!term || term.permanenceClosedAt === null) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="titulo-pantalla">{titulo}</h1>
        <p className="text-tinta-secundaria">{term ? sinCerrar : ninguno}</p>
      </div>
    );
  }
  const [summary, byTerm] = await Promise.all([
    semesterSummaryFor(actor.personId, term.id),
    listCommitteeMembershipsByTerm(actor.personId),
  ]);
  const cards = semesterCards(summary);
  const labels = tLabels("T-4962", SEMESTER_CARDS);
  const committees = byTerm.find((group) => group.termId === term.id)?.items ?? [];
  return (
    <div className="semestre flex max-w-2xl flex-col gap-6" data-capa="marca">
      <Cartel
        variante="azul"
        nivel="h1"
        tamano="hero"
        eyebrow={term.code}
        titulo={titulo ?? ""}
        subtitulo={t("T-4961", { término: term.code }).split(" · ")[1] ?? entrada}
        elemento={null}
      />
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.key} className="semestre-tarjeta" data-tarjeta={card.key}>
            <Numeral valor={card.value} className="semestre-numero" />
            <span className="semestre-etiqueta">
              <span className="sr-only">{card.value} </span>
              {labels[card.key]}
            </span>
          </li>
        ))}
      </ul>
      {committees.length > 0 ? (
        <section aria-labelledby="semestre-comites" className="flex flex-col gap-2">
          <h2 id="semestre-comites" className="titulo-seccion">
            {t("T-4963")}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {committees.map((item) => (
              <li key={item.id} className="font-semibold">
                {item.roles.length > 0
                  ? t("T-4950", {
                      cargo: item.roles.map((role) => role.roleLabel).join(" y "),
                      comité: item.committeeName,
                    })
                  : t("T-4949", { comité: item.committeeName })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <SelloOE tamano="lg" />
    </div>
  );
}
