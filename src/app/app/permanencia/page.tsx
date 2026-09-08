import type { Metadata } from "next";
import Link from "next/link";
import { getOnboarding, listInteractions } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { getPeopleByIds, listCommitteesByIds } from "@/modules/people";
import { getPersonPermanence } from "@/modules/permanence";
import { Desglose } from "@/modules/permanence/components/Desglose";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { Cartel, Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { noticeText } from "../_ui/avisos";
import { Vacio } from "../_ui/Vacio";

// Permanencia del miembro (12-permanencia, ADR-036 regla 5): resultado por comité frente a su
// umbral, calculado en vivo mientras el semestre está abierto y congelado al cerrar; criterio por
// criterio con lo logrado y lo que aún es posible; obligatorias; avisos; onboarding si es nuevo.

export const metadata: Metadata = { title: t("T-110") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PermanenciaPage({ searchParams }: PageProps<"/app/permanencia">) {
  const actor = await requireActor("/app/permanencia");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.semestre)) ?? current;
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-110")}</h1>
        <Vacio texto={t("T-548")} />
      </div>
    );
  }
  const view = await getPersonPermanence(actor.personId, term.id);
  const notices = actor.membershipStatus === "ON_LEAVE" ? [] : (view?.notices ?? []);
  const result = view?.result;
  const committeeIds = result?.results.map((item) => item.committeeId) ?? [];
  const evaluatorIds = new Set<string>();
  for (const criterion of [
    ...(result?.general ?? []),
    ...(result?.results.flatMap((item) => item.criteria) ?? []),
  ]) {
    const detail = criterion.detail;
    if (detail.type === "GROUP_EVALUATED") {
      for (const group of detail.groups) for (const id of group.evaluatorIds) evaluatorIds.add(id);
    } else if (detail.type === "COMPOSITE" && detail.group) {
      for (const id of detail.group.evaluatorIds) evaluatorIds.add(id);
    }
  }
  const [committees, people, onboarding, history] = await Promise.all([
    listCommitteesByIds(committeeIds),
    getPeopleByIds([...evaluatorIds]),
    result?.isNew && term.id === current?.id
      ? getOnboarding(actor.personId, term.id)
      : Promise.resolve(null),
    listInteractions(actor.personId, "PERMANENCE", 30),
  ]);
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  const personNames = new Map([...people.values()].map((item) => [item.id, item.fullName]));
  const closed = term.permanenceClosedAt !== null;
  const threshold = Math.max(60, ...(result?.results.map((item) => item.threshold) ?? []));
  const generalMissing = (result?.general.length ?? 0) === 0 && (result?.evaluated ?? false);
  const pendingSteps = onboarding?.filter((step) => !step.doneAt) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <Cartel
        variante="amarillo"
        nivel="h1"
        tamano="hero"
        eyebrow={closed ? t("T-698", { término: term.code }) : term.code}
        titulo={t("T-110")}
        subtitulo={closed ? undefined : t("T-111", { umbral: threshold })}
        elemento={null}
      >
        <form
          action="/app/permanencia"
          method="get"
          className="mt-6 flex items-center gap-2 text-sm"
        >
          <label htmlFor="semestre" className="eyebrow text-xs">
            {t("T-550")}
          </label>
          <select
            id="semestre"
            name="semestre"
            defaultValue={term.id}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-1 text-tinta"
          >
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
          <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
            {t("T-250")}
          </button>
        </form>
      </Cartel>

      {notices.some((notice) => notice.kind !== "TERM_CLOSED") ? (
        <ul className="flex list-none flex-col gap-2 p-0" aria-label={t("T-110")}>
          {notices
            .filter((notice) => notice.kind !== "TERM_CLOSED")
            .map((notice) => (
              <li
                key={`${notice.kind}-${notice.committeeId ?? notice.occasionId ?? ""}`}
                className={`rounded-xl px-4 py-3 font-semibold ${notice.kind === "NO_ALCANZA" || notice.kind === "MANDATORY_ASSEMBLY" ? "bg-oe-orange text-oe-navy" : "bg-oe-yellow-soft text-oe-navy"}`}
              >
                {noticeText(notice, committeeNames)}
                {notice.kind === "EVALUATIONS_PENDING" ||
                notice.kind === "EVALUATION_WINDOW_OPENED" ? (
                  <>
                    {" "}
                    <Link href="/admin/permanencia/evaluaciones" className="underline">
                      {t("T-700")}
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}

      {onboarding && pendingSteps.length > 0 ? (
        <section aria-labelledby="onboarding" className="flex flex-col gap-2">
          <h2 id="onboarding" className="text-display-md">
            {t("T-066")}
          </h2>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {pendingSteps.map((step) => (
              <li key={step.key}>
                <Insignia fondo="paper">{step.label}</Insignia>
              </li>
            ))}
          </ul>
          <Link href="/app" className="self-start underline">
            {tList("T-061")[0]}
          </Link>
        </section>
      ) : null}

      {result ? (
        <Desglose
          result={result}
          closed={closed}
          committeeNames={committeeNames}
          personNames={personNames}
          generalMissing={generalMissing}
          voice="self"
        />
      ) : (
        <Vacio texto={t("T-548")} />
      )}
      {history.length > 0 ? (
        <section aria-labelledby="historial" className="flex flex-col gap-3">
          <h2 id="historial" className="text-display-md">
            {t("T-697")}
          </h2>
          <ul className="flex list-none flex-col gap-2 p-0">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-2 border-borde border-t py-2 text-sm"
              >
                <span>{item.summary}</span>
                <span className="text-tinta-suave">{formatDateTime(item.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-sm text-tinta-suave">
        {t("T-796", { fecha: formatDateTime(view?.computedAt ?? new Date()) })}
      </p>
    </div>
  );
}
