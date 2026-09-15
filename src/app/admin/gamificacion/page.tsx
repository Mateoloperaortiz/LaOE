import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import {
  BOOSTER_STATES,
  gamificationOverview,
  listBoostersForTerm,
  loadGamificationSettings,
} from "@/modules/participation";
import { getPeopleByIds, searchPeople } from "@/modules/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { grantBoosterAction, revokeBoosterAction } from "./boosters-actions";

// Panel de la gamificación (ADR-067 reglas 13 y 16): indicadores del término y enlaces rápidos.

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
  const q = single(search.q).trim();
  const persona = single(search.persona);
  const error = single(search.error);
  const otorgado = single(search.otorgado) === "1";
  const retirado = single(search.retirado) === "1";
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{tList("T-2405")[0] ?? ""}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const [overview, found, boosters] = await Promise.all([
    gamificationOverview(term.id),
    q ? searchPeople(q) : Promise.resolve([]),
    listBoostersForTerm(term.id),
  ]);
  const people = await getPeopleByIds(
    [...new Set([persona, ...boosters.map((item) => item.personId)])].filter(Boolean),
  );
  const grantFields = tList("T-2546");
  const boosterNames = tList("T-2451");
  const boosterStates = tList("T-2455");
  const results = tList("T-2548");
  const revokeLabels = tList("T-2547");
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

      <section className="flex max-w-3xl flex-col gap-4" aria-labelledby="otorgar-booster-titulo">
        <h2 id="otorgar-booster-titulo" className="text-display-md">
          {t("T-2545")}
        </h2>
        {otorgado ? (
          <output className="block font-semibold text-oe-blue">{results[1]}</output>
        ) : null}
        {retirado ? (
          <output className="block font-semibold text-oe-blue">{results[2]}</output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}

        <form action="/admin/gamificacion" method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="termId" value={term.id} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="eyebrow text-xs">{grantFields[0]}</span>
            <input
              name="q"
              defaultValue={q}
              className="rounded-xl border-2 border-borde bg-fondo px-3 py-2"
              placeholder={t("T-264")}
            />
          </label>
          <AdminSubmitButton type="submit" className="boton-secundario">
            {t("T-250")}
          </AdminSubmitButton>
        </form>

        {q ? (
          found.length === 0 ? (
            <p className="text-tinta-suave">{t("T-256")}</p>
          ) : (
            <ul className="flex list-none flex-wrap gap-2 p-0">
              {found.map((item) => (
                <li key={item.id} className="rounded-full border border-borde px-3 py-1 text-sm">
                  <Link
                    href={`/admin/gamificacion?termId=${term.id}&q=${encodeURIComponent(q)}&persona=${item.id}`}
                    className={item.id === persona ? "font-bold" : "font-semibold"}
                  >
                    {item.fullName.trim()}
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {persona ? (
          <form action={grantBoosterAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="personId" value={persona} />
            <input type="hidden" name="termId" value={term.id} />
            <p className="w-full text-sm">
              {grantFields[0]}:{" "}
              <span className="font-semibold">{people.get(persona)?.fullName?.trim()}</span>
            </p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="eyebrow text-xs">{grantFields[1]}</span>
              <select name="kind" className="rounded-xl border-2 border-borde bg-fondo px-3 py-2">
                <option value="PLUS_50">{boosterNames[0]}</option>
                <option value="PLUS_100">{boosterNames[1]}</option>
              </select>
            </label>
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
              <span className="eyebrow text-xs">{grantFields[2]}</span>
              <input
                name="reason"
                required
                maxLength={300}
                className="rounded-xl border-2 border-borde bg-fondo px-3 py-2"
              />
            </label>
            <AdminSubmitButton type="submit" className="boton-primario">
              {t("T-2545")}
            </AdminSubmitButton>
          </form>
        ) : null}

        {boosters.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde text-left">
                  <th className="py-2 pr-4">{grantFields[0]}</th>
                  <th className="py-2 pr-4">{grantFields[1]}</th>
                  <th className="py-2 pr-4">{tList("T-2518")[1]}</th>
                  <th className="py-2 pr-4">{tList("T-2533")[4]}</th>
                  <th className="py-2 pr-4">{grantFields[2]}</th>
                  <th className="py-2" aria-label={revokeLabels[0]} />
                </tr>
              </thead>
              <tbody>
                {boosters.map((item) => (
                  <tr key={item.id} className="border-b border-borde align-top">
                    <td className="py-2 pr-4 font-semibold">
                      {people.get(item.personId)?.fullName?.trim() ?? item.personId}
                    </td>
                    <td className="py-2 pr-4">{boosterNames[item.kind === "PLUS_100" ? 1 : 0]}</td>
                    <td className="py-2 pr-4">
                      {boosterStates[BOOSTER_STATES.indexOf(item.state)] ?? item.state}
                    </td>
                    <td className="py-2 pr-4">{formatDate(item.expiresAt)}</td>
                    <td className="py-2 pr-4">
                      {item.origin?.kind === "ACHIEVEMENT"
                        ? t("T-2467", { origen: item.origin.label })
                        : item.origin?.kind === "MANUAL"
                          ? t("T-2468", { motivo: item.origin.reason })
                          : "—"}
                    </td>
                    <td className="py-2">
                      {item.state === "AVAILABLE" ? (
                        <form action={revokeBoosterAction} className="flex items-center gap-2">
                          <input type="hidden" name="boosterId" value={item.id} />
                          <input type="hidden" name="termId" value={term.id} />
                          <input
                            name="reason"
                            required
                            maxLength={300}
                            placeholder={revokeLabels[1]}
                            aria-label={revokeLabels[1]}
                            className="rounded-xl border-2 border-borde bg-fondo px-3 py-1 text-sm"
                          />
                          <AdminSubmitButton
                            type="submit"
                            className="boton-secundario min-h-8 px-3 py-1 text-sm"
                          >
                            {revokeLabels[0]}
                          </AdminSubmitButton>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
