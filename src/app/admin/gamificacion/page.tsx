import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import { gamificationOverview, loadGamificationSettings } from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";

// Panel de la gamificación (ADR-067 reglas 13 y 16): indicadores del término y enlaces rápidos.
// El alta y el retiro manual de boosters viven en Insignias desde G-T5.

export const metadata: Metadata = { title: tList("T-2405")[0] ?? "" };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function GamificacionPage({ searchParams }: PageProps<"/admin/gamificacion">) {
  await requireAdminActor("/admin/gamificacion");
  const search = (await searchParams) as Search;
  const [terms, current, settings] = await Promise.all([
    listAllTerms(),
    getCurrentTerm(),
    loadGamificationSettings(),
  ]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const indicators = tList("T-2555");
  const links = tList("T-2583");
  const nav = tList("T-2404");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{tList("T-2405")[0] ?? ""}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const overview = await gamificationOverview(term.id);
  const cards: Array<[string, string]> = [
    [indicators[0] ?? "", String(overview.uniqueParticipants)],
    [indicators[1] ?? "", String(overview.pendingSubmissions)],
    [indicators[2] ?? "", `${overview.reservedRewards.count} · ${overview.reservedRewards.points}`],
    [indicators[3] ?? "", `${overview.grantedRewards.count} · ${overview.grantedRewards.points}`],
    [indicators[4] ?? "", String(overview.boostersUsed)],
    [indicators[5] ?? "", String(overview.processingErrors)],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{tList("T-2405")[0] ?? ""}</h1>
          <p className="text-sm text-tinta-suave">
            {t("T-2552")}: {settings.enabled ? "✓" : "×"} · {term.code}
          </p>
        </div>
        <form action="/admin/gamificacion" method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="termId" className="eyebrow text-xs">
            {tList("T-2565")[0]}
          </label>
          <select
            id="termId"
            name="termId"
            defaultValue={term.id}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-1"
          >
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
          <AdminSubmitButton type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
            {t("T-250")}
          </AdminSubmitButton>
        </form>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <dt className="eyebrow text-xs">{label}</dt>
            <dd className="font-display text-display-lg leading-none tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label={t("T-2403")} className="flex flex-wrap gap-3">
        <Link href={`/admin/gamificacion/retos?termId=${term.id}`} className="boton-secundario">
          {nav[1]}
        </Link>
        <Link href="/admin/gamificacion/revision" className="boton-secundario">
          {nav[2]}
        </Link>
        <Link href={`/admin/gamificacion/campanas?termId=${term.id}`} className="boton-secundario">
          {nav[3]}
        </Link>
        <Link href={`/admin/gamificacion/insignias?termId=${term.id}`} className="boton-secundario">
          {nav[4]}
        </Link>
        <Link href="/admin/gamificacion/limites" className="boton-secundario">
          {nav[5]}
        </Link>
        <Link href="/admin/sistema/jobs" className="underline">
          {links[0]}
        </Link>
        <Link href="/admin/ledger" className="underline">
          {links[1]}
        </Link>
        <Link href="/admin/cierre" className="underline">
          {links[2]}
        </Link>
      </nav>
    </div>
  );
}
