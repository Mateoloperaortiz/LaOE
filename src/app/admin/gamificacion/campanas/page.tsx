import type { Metadata } from "next";
import { requireAdminActor } from "@/modules/identity";
import {
  isVoluntaryOccasion,
  listCampaignsAdmin,
  listChallengesAdmin,
  listOccasionsForTerm,
} from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { cancelCampaignAction, createCampaignAction } from "./actions";

// Campañas de puntos (ADR-067 regla 9): GH crea una campaña por objetivo elegido sobre una ventana
// en hora de Bogotá; la lista muestra el estado derivado de la ventana y permite cancelar.

export const metadata: Metadata = { title: t("T-2532") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

const STATE_INDEX = { SCHEDULED: 1, ACTIVE: 2, ENDED: 3, CANCELLED: 4 } as const;

export default async function CampanasPage({
  searchParams,
}: PageProps<"/admin/gamificacion/campanas">) {
  await requireAdminActor("/admin/gamificacion/campanas");
  const search = (await searchParams) as Search;
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-2532")}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const [campaigns, challengesResult, occasions] = await Promise.all([
    listCampaignsAdmin(term.id),
    listChallengesAdmin({ termId: term.id, page: 1, pageSize: 200 }),
    listOccasionsForTerm(term.id, ["DRAFT", "OPEN", "CLOSED"]),
  ]);
  const challengeTargets = challengesResult.rows.filter((row) => row.status !== "CANCELLED");
  const occasionTargets = occasions.filter((row) => isVoluntaryOccasion(row) && row.points > 0);
  const fields = tList("T-2533");
  const percents = tList("T-2534");
  const targetTypes = tList("T-2535");
  const actions = tList("T-2537");
  const stateLabels = tList("T-2511");
  const now = new Date();
  const defaultStart = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const defaultEnd = new Date(defaultStart.getTime() + 7 * 24 * 3_600_000);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-2532")}</h1>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <form
          action="/admin/gamificacion/campanas"
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

      {campaigns.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2538")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde text-left">
                <th className="py-2 pr-4">{fields[0]}</th>
                <th className="py-2 pr-4">{fields[1]}</th>
                <th className="py-2 pr-4">{fields[2]}</th>
                <th className="py-2 pr-4">{fields[3]}</th>
                <th className="py-2 pr-4">{fields[4]}</th>
                <th className="py-2 pr-4">{tList("T-2518")[1]}</th>
                <th className="py-2" aria-label={actions[1]} />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-borde align-top">
                  <td className="py-2 pr-4 font-semibold">{campaign.name}</td>
                  <td className="py-2 pr-4">+{campaign.percent} %</td>
                  <td className="py-2 pr-4">{campaign.targetTitle}</td>
                  <td className="py-2 pr-4">{formatDateTime(campaign.startsAt)}</td>
                  <td className="py-2 pr-4">{formatDateTime(campaign.endsAt)}</td>
                  <td className="py-2 pr-4">
                    {stateLabels[STATE_INDEX[campaign.state]] ?? campaign.state}
                  </td>
                  <td className="py-2">
                    {campaign.state === "ACTIVE" || campaign.state === "SCHEDULED" ? (
                      <form action={cancelCampaignAction}>
                        <input type="hidden" name="id" value={campaign.id} />
                        <input type="hidden" name="termId" value={term.id} />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-secundario min-h-8 px-3 py-1 text-sm"
                        >
                          {actions[1]}
                        </AdminSubmitButton>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex max-w-2xl flex-col gap-4" aria-labelledby="campana-nueva">
        <h2 id="campana-nueva" className="text-display-md">
          {actions[0]}
        </h2>
        <p className="text-sm text-tinta-suave">{t("T-2536")}</p>
        <form action={createCampaignAction} className="flex flex-col gap-5">
          <AdminFormBody>
            <input type="hidden" name="termId" value={term.id} />
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{fields[0]}</span>
              <input name="name" required maxLength={120} className={inputClass} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow text-xs">{fields[1]}</legend>
              <div className="flex flex-wrap gap-3">
                {[25, 50, 100].map((value, index) => (
                  <label key={value} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="radio"
                      name="percent"
                      value={value}
                      required
                      defaultChecked={value === 50}
                    />
                    {percents[index] ?? `+${value} %`}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow text-xs">{targetTypes[0]}</legend>
              {challengeTargets.length === 0 ? (
                <p className="text-sm text-tinta-suave">—</p>
              ) : (
                challengeTargets.map((row) => (
                  <label key={row.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="challengeIds" value={row.id} />
                    <span>
                      {row.title} · {t("T-2413", { n: row.basePoints })}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow text-xs">{targetTypes[1]}</legend>
              {occasionTargets.length === 0 ? (
                <p className="text-sm text-tinta-suave">—</p>
              ) : (
                occasionTargets.map((row) => (
                  <label key={row.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="occasionIds" value={row.id} />
                    <span>
                      {row.title} · {formatDateTime(row.startsAt)} ·{" "}
                      {t("T-2413", { n: row.points })}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fields[3]}</span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={utcToBogotaInput(defaultStart)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fields[4]}</span>
                <input
                  name="endsAt"
                  type="datetime-local"
                  required
                  defaultValue={utcToBogotaInput(defaultEnd)}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <AdminSubmitButton type="submit" className="boton-primario">
                {actions[0]}
              </AdminSubmitButton>
            </div>
          </AdminFormBody>
        </form>
      </section>
    </div>
  );
}
