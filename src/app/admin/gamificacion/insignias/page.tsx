import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminActor } from "@/modules/identity";
import {
  BADGE_FAMILIES,
  BOOSTER_STATES,
  listBadgeCatalogAdmin,
  listBoostersForTerm,
  listChallengesAdmin,
  listOccasionsForTerm,
  listRevokedWithUsedBooster,
} from "@/modules/participation";
import { getPeopleByIds, searchPeople } from "@/modules/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { createSpecialBadgeAction, grantBoosterAction, revokeBoosterAction } from "./actions";

// Insignias (ADR-067 reglas 9, 15 y 16): catálogo con desbloqueos, alta de ediciones especiales
// vinculadas a una ocasión o a un reto, el bloque de boosters manuales (movido del panel) y la
// lista de logros revocados cuyo booster ya se usó.

export const metadata: Metadata = { title: tList("T-2405")[4] ?? "" };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function InsigniasPage({
  searchParams,
}: PageProps<"/admin/gamificacion/insignias">) {
  await requireAdminActor("/admin/gamificacion/insignias");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const q = single(search.q).trim();
  const persona = single(search.persona);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const otorgado = single(search.otorgado) === "1";
  const retirado = single(search.retirado) === "1";
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{tList("T-2405")[4] ?? ""}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const [catalog, found, boosters, challengesResult, occasions, revokedUsed] = await Promise.all([
    listBadgeCatalogAdmin(),
    q ? searchPeople(q) : Promise.resolve([]),
    listBoostersForTerm(term.id),
    listChallengesAdmin({ termId: term.id, page: 1, pageSize: 200 }),
    listOccasionsForTerm(term.id),
    listRevokedWithUsedBooster(term.id),
  ]);
  const challengeTargets = challengesResult.rows.filter((row) => row.status !== "CANCELLED");
  const occasionTargets = occasions.filter((row) => row.status !== "CANCELLED");
  const people = await getPeopleByIds(
    [...new Set([persona, ...boosters.map((item) => item.personId)])].filter(Boolean),
  );
  const familyNames = tList("T-2473");
  const columns = tList("T-2541");
  const specialFields = tList("T-2543");
  const grantFields = tList("T-2546");
  const boosterNames = tList("T-2451");
  const boosterStates = tList("T-2455");
  const results = tList("T-2548");
  const revokeLabels = tList("T-2547");
  const stateLabels = tList("T-2518");

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display-lg">{tList("T-2405")[4] ?? ""}</h1>
        <form
          action="/admin/gamificacion/insignias"
          method="get"
          className="flex items-center gap-2 text-sm"
        >
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
      {guardado ? <output className="block font-semibold text-oe-blue">{results[0]}</output> : null}

      <section className="flex flex-col gap-4" aria-labelledby="catalogo-titulo">
        <h2 id="catalogo-titulo" className="text-display-md">
          {t("T-2540")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde text-left">
                {columns.map((column) => (
                  <th key={column} className="py-2 pr-4">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.map((badge) => (
                <tr key={badge.id} className="border-b border-borde align-top">
                  <td className="py-2 pr-4 font-mono text-xs">{badge.code}</td>
                  <td className="py-2 pr-4">
                    {familyNames[BADGE_FAMILIES.indexOf(badge.family)] ?? badge.family}
                  </td>
                  <td className="py-2 pr-4">{badge.level}</td>
                  <td className="py-2 pr-4">{badge.threshold ?? "—"}</td>
                  <td className="py-2 pr-4 font-semibold">{badge.name}</td>
                  <td className="py-2 pr-4">{badge.active ? "✓" : "×"}</td>
                  <td className="py-2">{badge.unlocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex max-w-3xl flex-col gap-4" aria-labelledby="especial-titulo">
        <h2 id="especial-titulo" className="text-display-md">
          {t("T-2542")}
        </h2>
        <p className="text-sm text-tinta-suave">{t("T-2544")}</p>
        <form action={createSpecialBadgeAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="eyebrow text-xs">{specialFields[0]}</span>
            <input name="name" required maxLength={80} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="eyebrow text-xs">{specialFields[1]}</span>
            <input name="description" maxLength={300} className={inputClass} />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="eyebrow text-xs">{specialFields[2]}</legend>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="vinculo" value="ocasion" defaultChecked />
                {specialFields[3]}
              </label>
              <select name="occasionId" aria-label={specialFields[3]} className={inputClass}>
                <option value="">—</option>
                {occasionTargets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="vinculo" value="reto" />
                {specialFields[4]}
              </label>
              <select name="challengeId" aria-label={specialFields[4]} className={inputClass}>
                <option value="">—</option>
                {challengeTargets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>
          <AdminSubmitButton type="submit" className="boton-primario self-start">
            {t("T-2542")}
          </AdminSubmitButton>
        </form>
      </section>

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

        <form
          action="/admin/gamificacion/insignias"
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
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
                    href={`/admin/gamificacion/insignias?termId=${term.id}&q=${encodeURIComponent(q)}&persona=${item.id}`}
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
                  <th className="py-2 pr-4">{stateLabels[1]}</th>
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

      {revokedUsed.length > 0 ? (
        <section className="flex max-w-3xl flex-col gap-3" aria-labelledby="revocadas-titulo">
          <h2 id="revocadas-titulo" className="text-display-md">
            {t("T-2549")}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {revokedUsed.map((item) => (
              <li
                key={item.achievement.id}
                className="rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4 text-sm"
              >
                <span className="font-semibold">{item.personName}</span> · {item.badge.name}{" "}
                {t("T-2482", { nivel: item.badge.level })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
