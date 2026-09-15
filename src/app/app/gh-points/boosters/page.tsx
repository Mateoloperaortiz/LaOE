import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/modules/identity";
import {
  BOOSTER_KINDS,
  BOOSTER_STATES,
  type BoosterState,
  type BoosterView,
  listActiveCampaignsForMember,
  listBoostersFor,
  listBoosterTargetsForMember,
  loadGamificationSettings,
  resolveMemberContext,
} from "@/modules/participation";
import { getCurrentTerm } from "@/modules/terms";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { Vacio } from "../../_ui/Vacio";
import { setBoosterTargetAction } from "./actions";

// Inventario de boosters del miembro (ADR-067 reglas 6 a 9): cada uno se apunta a un reto abierto
// o a una actividad voluntaria con puntos, y las campañas vigentes del término se listan abajo.

export const metadata: Metadata = { title: t("T-2452") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const STATE_FONDO: Record<BoosterState, "sky" | "naranja" | "cream"> = {
  AVAILABLE: "sky",
  RESERVED: "cream",
  CONSUMED: "cream",
  EXPIRED: "naranja",
  REVOKED: "naranja",
};

function BoosterCard({
  booster,
  names,
  states,
  targets,
  guardado,
  error,
}: {
  booster: BoosterView;
  names: string[];
  states: string[];
  targets: Awaited<ReturnType<typeof listBoosterTargetsForMember>>;
  guardado: boolean;
  error: string | null;
}) {
  const name = names[BOOSTER_KINDS.indexOf(booster.kind)] ?? booster.kind;
  const stateLabel = states[BOOSTER_STATES.indexOf(booster.state)] ?? booster.state;
  const groupLabels = tList("T-2458");
  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-display-sm">{name}</h2>
        <Insignia fondo={STATE_FONDO[booster.state]}>{stateLabel}</Insignia>
      </header>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dd>{t("T-2456", { fecha: formatDate(booster.expiresAt) })}</dd>
        </div>
        {booster.origin?.kind === "ACHIEVEMENT" ? (
          <div className="flex gap-2">
            <dd>{t("T-2467", { origen: booster.origin.label })}</dd>
          </div>
        ) : null}
        {booster.origin?.kind === "MANUAL" ? (
          <div className="flex gap-2">
            <dd>{t("T-2468", { motivo: booster.origin.reason })}</dd>
          </div>
        ) : null}
        {booster.target ? (
          <div className="flex flex-wrap items-center gap-3">
            <dd>
              <Link href={booster.target.href} className="font-semibold underline">
                {booster.target.title}
              </Link>
            </dd>
            {booster.state === "AVAILABLE" ? (
              <form action={setBoosterTargetAction}>
                <input type="hidden" name="boosterId" value={booster.id} />
                <input type="hidden" name="op" value="quitar" />
                <input type="hidden" name="back" value="/app/gh-points/boosters" />
                <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
                  {t("T-2460", { objetivo: booster.target.title })}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </dl>
      {guardado ? (
        <output className="block font-semibold text-titulo">
          {t("T-2459", { booster: name, objetivo: booster.target?.title ?? "—" })}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
      {booster.state === "AVAILABLE" ? (
        <details className="rounded-xl border border-borde bg-fondo-suave p-4">
          <summary className="cursor-pointer font-semibold">{t("T-2457")}</summary>
          <form action={setBoosterTargetAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="boosterId" value={booster.id} />
            <input type="hidden" name="back" value="/app/gh-points/boosters" />
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow text-xs">{groupLabels[0]}</legend>
              {targets.challenges.length === 0 ? (
                <p className="text-sm text-tinta-suave">—</p>
              ) : (
                targets.challenges.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="target"
                      value={`challenge:${item.id}`}
                      defaultChecked={booster.target?.id === item.id}
                    />
                    <span>
                      {item.title} · {t("T-2413", { n: item.basePoints })}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="eyebrow text-xs">{groupLabels[1]}</legend>
              {targets.occasions.length === 0 ? (
                <p className="text-sm text-tinta-suave">—</p>
              ) : (
                targets.occasions.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="target"
                      value={`occasion:${item.id}`}
                      defaultChecked={booster.target?.id === item.id}
                    />
                    <span>
                      {item.title} · {formatDateTime(item.startsAt)} ·{" "}
                      {t("T-2413", { n: item.points })}
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <button type="submit" className="boton-secundario self-start">
              {t("T-253")}
            </button>
          </form>
        </details>
      ) : null}
    </article>
  );
}

export default async function BoostersPage({ searchParams }: PageProps<"/app/gh-points/boosters">) {
  const actor = await requireActor("/app/gh-points/boosters");
  const settings = await loadGamificationSettings();
  if (!settings.enabled) {
    redirect("/app/gh-points");
  }
  const search = (await searchParams) as Search;
  const guardadoId = single(search.guardado);
  const error = single(search.error);
  const errorBooster = single(search.booster);
  const term = await getCurrentTerm();
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-2452")}</h1>
        <Vacio texto={t("T-548")} />
      </div>
    );
  }
  const member = await resolveMemberContext(actor.personId, term.id);
  const [boosters, targets, campaigns] = await Promise.all([
    listBoostersFor(actor.personId),
    listBoosterTargetsForMember(actor.personId, term.id, member),
    listActiveCampaignsForMember(term.id),
  ]);
  const names = tList("T-2451");
  const states = tList("T-2455");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-lg">{t("T-2452")}</h1>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2453")}</p>
        {error && !errorBooster ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>

      {boosters.length === 0 ? (
        <Vacio texto={t("T-2454")} />
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {boosters.map((booster) => (
            <li key={booster.id}>
              <BoosterCard
                booster={booster}
                names={names}
                states={states}
                targets={targets}
                guardado={guardadoId === booster.id}
                error={errorBooster === booster.id ? error : null}
              />
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="campanas-titulo">
        <h2 id="campanas-titulo" className="text-display-md">
          {t("T-2463")}
        </h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-tinta-suave">{t("T-2465")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link href={campaign.target.href} className="underline">
                  {t("T-2464", {
                    n: campaign.percent,
                    objetivo: campaign.target.title,
                    fecha: formatDate(campaign.endsAt),
                  })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
