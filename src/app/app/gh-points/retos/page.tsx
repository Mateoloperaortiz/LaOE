import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { requireActor } from "@/modules/identity";
import {
  listChallengesForMember,
  loadGamificationSettings,
  type MemberChallengeCard,
} from "@/modules/participation";
import { ChallengeCard } from "@/modules/participation/components/ChallengeCard";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Vacio } from "../../_ui/Vacio";

// Retos del miembro (ADR-067 regla 3): los del semestre actual filtrados por su público y por
// su entrega. Con la bandera apagada la ruta vuelve al resumen.

export const metadata: Metadata = { title: t("T-2406") };

type Search = Record<string, string | string[] | undefined>;

const FILTROS = ["abiertos", "mios", "cerrados"] as const;
type Filtro = (typeof FILTROS)[number];

function matches(card: MemberChallengeCard, filtro: Filtro): boolean {
  switch (filtro) {
    case "abiertos":
      return card.status === "AVAILABLE" || card.status === "PENDING";
    case "mios":
      return card.status === "PENDING" || card.status === "COMPLETED" || card.status === "REJECTED";
    case "cerrados":
      return card.status === "COMPLETED" || card.status === "REJECTED" || card.status === "EXPIRED";
  }
}

export default async function RetosPage({ searchParams }: PageProps<"/app/gh-points/retos">) {
  const actor = await requireActor("/app/gh-points/retos");
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    redirect("/app/gh-points");
  }
  const search = (await searchParams) as Search;
  const filtroParam = single(search.filtro);
  const filtro: Filtro = FILTROS.includes(filtroParam as Filtro)
    ? (filtroParam as Filtro)
    : "abiertos";
  const term = await getCurrentTerm();
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-2406")}</h1>
        <Vacio texto={t("T-548")} />
      </div>
    );
  }
  const cards = await listChallengesForMember(actor.personId, term.id);
  const filtered = cards.filter((card) => matches(card, filtro));
  const labels = tLabels("T-2448", FILTROS);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2406")}</h1>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2407")}</p>
      </header>

      <nav aria-label={t("T-2406")} className="flex flex-wrap gap-2">
        {FILTROS.map((value) => (
          <Link
            key={value}
            href={`/app/gh-points/retos?filtro=${value}`}
            aria-current={value === filtro ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              value === filtro ? "bg-oe-navy text-oe-paper" : "border border-borde text-titulo"
            }`}
          >
            {labels[value] ?? value}
          </Link>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <Vacio texto={t("T-2408")} elemento="estrella" color="text-oe-yellow" />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
          {filtered.map((card) => (
            <li key={card.id}>
              <Link
                href={`/app/gh-points/retos/${card.id}`}
                aria-label={card.title}
                className="block no-underline"
              >
                <ChallengeCard card={card} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
