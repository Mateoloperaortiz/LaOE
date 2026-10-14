import { ASSEMBLY_KINDS } from "@/modules/participation";
import {
  COMPLIANCE_STATES,
  type CommitteeResult,
  type CriterionResult,
  type MandatoryView,
  mandatoryCounts,
  type PersonPermanence,
  WORK_GROUP_KINDS,
  type WorkGroupKind,
} from "@/modules/permanence";
import { Insignia, Progreso } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";

// Desglose de permanencia compartido por /app/permanencia y la pestaña Permanencia de la Persona 360:
// resultado por comité frente a su umbral, criterios generales y del comité, y obligatorias.
// Recibe el resultado ya calculado y los nombres resueltos; no toca la base.

type Names = ReadonlyMap<string, string>;

type Props = {
  result: PersonPermanence;
  closed: boolean;
  committeeNames: Names;
  personNames: Names;
  /** Cuando la tabla general no tiene criterios (T-678). */
  generalMissing: boolean;
  /** Voseo para la persona (Mi OE) o tercera persona (admin): solo cambia los textos de estado. */
  voice: "self" | "admin";
};

const CONDITIONS = ["ACTIVE", "NEW", "PROBATION", "TRANSFER"] as const;
const EVALUATIONS = ["PENDING", "GOOD", "INSUFFICIENT"] as const;
const MEMBER_STATUSES = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"] as const;

function stateLabel(state: CommitteeResult["state"]): string {
  return tLabels("T-791", COMPLIANCE_STATES)[state] ?? state;
}

function conditionLabel(condition: CommitteeResult["condition"]): string {
  return tLabels("T-792", CONDITIONS)[condition] ?? condition;
}

function kindLabel(kind: WorkGroupKind): string {
  return tLabels("T-725", WORK_GROUP_KINDS)[kind] ?? kind;
}

function stateText(item: CommitteeResult, committee: string, closed: boolean): string {
  const values = { n: Math.round(item.remaining), umbral: item.threshold, comité: committee };
  if (closed) {
    return item.finalState === "CUMPLE"
      ? t("T-117", values)
      : item.finalState === "PRUEBA"
        ? t("T-118", values)
        : t("T-119", values);
  }
  if (item.total >= item.threshold) {
    return t("T-681", values);
  }
  return item.state === "EN_CAMINO"
    ? t("T-114", values)
    : item.state === "EN_RIESGO"
      ? t("T-115", values)
      : t("T-116", values);
}

function nextDate(upcoming: Array<{ startsAt: string }>): string {
  const first = upcoming[0];
  return first ? formatDate(new Date(first.startsAt)) : "";
}

function Detalle({
  criterion,
  personNames,
  closed,
}: {
  criterion: CriterionResult;
  personNames: Names;
  closed: boolean;
}) {
  const d = criterion.detail;
  const evaluationLabels = tLabels("T-750", EVALUATIONS);
  switch (d.type) {
    case "CHECKIN_COUNT":
    case "CHECKIN_THRESHOLD": {
      const prefix =
        d.type === "CHECKIN_THRESHOLD"
          ? `${t("T-686", { n: d.attended, minimo: d.minCount })} `
          : "";
      const pending = d.opportunities ?? d.upcoming.length;
      return (
        <p>
          {prefix}
          {!closed && pending > 0 && d.upcoming.length > 0
            ? t("T-684", { n: d.attended, m: pending, fecha: nextDate(d.upcoming) })
            : t("T-685", { n: d.attended })}
        </p>
      );
    }
    case "CHECKIN_RATE":
      return (
        <p>
          {t("T-687", { n: d.attended, m: d.held, tasa: Math.round(d.rate * 100), k: d.future })}
        </p>
      );
    case "GROUP_EVALUATED":
    case "COMPOSITE": {
      const groups = d.type === "GROUP_EVALUATED" ? d.groups : d.group ? [d.group] : [];
      if (d.type === "COMPOSITE") {
        return (
          <div className="flex flex-col gap-1">
            <p>{t("T-686", { n: d.attended, minimo: d.minCount })}</p>
            {groups.length === 0 ? <p>{t("T-688")}</p> : null}
            {groups.map((group) => (
              <Grupo
                key={group.groupId}
                group={group}
                labels={evaluationLabels}
                personNames={personNames}
              />
            ))}
          </div>
        );
      }
      return groups.length === 0 ? (
        <p>{t("T-688")}</p>
      ) : (
        <ul className="flex list-none flex-col gap-1 p-0">
          {groups.map((group) => (
            <li key={group.groupId}>
              <Grupo group={group} labels={evaluationLabels} personNames={personNames} />
            </li>
          ))}
        </ul>
      );
    }
    case "LEADER_SCORE":
      return (
        <div className="flex flex-col gap-1">
          <p>
            {d.value === null ? t("T-691") : t("T-690", { valor: d.value, peso: criterion.weight })}
          </p>
          {d.note ? <p className="text-tinta-suave italic">{d.note}</p> : null}
        </div>
      );
    case "MANUAL":
      return (
        <p>
          {d.credited === null
            ? t("T-693")
            : t("T-692", { valor: d.credited, peso: criterion.weight })}
        </p>
      );
    default:
      return null;
  }
}

function Grupo({
  group,
  labels,
  personNames,
}: {
  group: {
    groupId: string;
    name: string;
    /** Con qué tipo cumple el criterio un grupo que entra por equivalencia (ADR-071). */
    equivalentKind: WorkGroupKind | null;
    evaluation: "PENDING" | "GOOD" | "INSUFFICIENT";
    evaluatorIds: string[];
  };
  labels: Readonly<Record<string, string>>;
  personNames: Names;
}) {
  const evaluators = group.evaluatorIds.map((id) => personNames.get(id) ?? "").filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {t("T-689", {
          grupo: group.name,
          evaluacion: labels[group.evaluation] ?? "",
        })}
      </span>
      {group.equivalentKind ? (
        <span className="text-sm text-tinta-suave">
          {t("T-2617", { tipo: kindLabel(group.equivalentKind) })}
        </span>
      ) : null}
      {group.evaluation === "PENDING" ? (
        <span className="text-sm text-tinta-suave">
          {t("T-123", { evaluador: evaluators.join(", ") || "GH" })}
        </span>
      ) : null}
    </span>
  );
}

function Criterios({
  criteria,
  personNames,
  closed,
}: {
  criteria: CriterionResult[];
  personNames: Names;
  closed: boolean;
}) {
  return (
    <ul className="flex list-none flex-col gap-3 p-0">
      {criteria.map((criterion) => (
        <li
          key={criterion.ruleId}
          className="flex flex-col gap-1 rounded-xl border border-borde bg-fondo p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{criterion.label}</span>
            <span className="tabular-nums">
              {t("T-682", { logrado: criterion.achieved, peso: criterion.weight })}
              {!closed && criterion.remaining > 0 ? (
                <span className="ml-2 text-sm text-tinta-suave">
                  {t("T-683", { n: criterion.remaining })}
                </span>
              ) : null}
            </span>
          </div>
          <Progreso valor={criterion.achieved} maximo={criterion.weight} nombre={criterion.label} />
          <div className="text-sm">
            <Detalle criterion={criterion} personNames={personNames} closed={closed} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Obligatorias({ mandatory }: { mandatory: MandatoryView }) {
  const kinds = tLabels("T-546", ASSEMBLY_KINDS);
  const { attended, total } = mandatoryCounts(mandatory);
  const kindLabel = (kind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF") => kinds[kind] ?? kind;
  const next = mandatory.upcoming[0];
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-borde bg-fondo p-3">
      <p className="font-semibold">{t("T-124", { n: attended, total })}</p>
      {mandatory.lost.map((kind) => (
        <p key={kind} className="text-sm">
          <Insignia fondo="naranja">{t("T-694", { asamblea: kindLabel(kind) })}</Insignia>
        </p>
      ))}
      {next ? (
        <p className="text-sm text-tinta-suave">
          {t("T-695", { asamblea: next.title, fecha: formatDate(new Date(next.startsAt)) })}
        </p>
      ) : null}
      {mandatory.induction?.required ? (
        <p className="text-sm">
          <Insignia
            fondo={mandatory.induction.attended || mandatory.induction.excused ? "sky" : "naranja"}
          >
            {tList("T-2318")[0]} ·{" "}
            {mandatory.induction.attended || mandatory.induction.excused
              ? tList("T-2318")[2]
              : mandatory.induction.pending
                ? tList("T-2318")[3]
                : tList("T-2318")[4]}
          </Insignia>
        </p>
      ) : null}
    </div>
  );
}

export function Desglose({
  result,
  closed,
  committeeNames,
  personNames,
  generalMissing,
  voice,
}: Props) {
  const statusLabels: Readonly<Record<string, string>> = tLabels("T-381", MEMBER_STATUSES);
  if (!result.evaluated) {
    const estado = statusLabels[result.status] ?? result.status;
    return (
      <p className="text-tinta-suave">
        {voice === "self" ? t("T-680", { estado }) : t("T-830", { estado })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        {result.results.map((item) => {
          const committee = committeeNames.get(item.committeeId) ?? item.committeeId;
          return (
            <section
              key={item.committeeId}
              aria-label={committee}
              className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo-alterno p-4 textura-granito"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Insignia fondo={item.condition === "ACTIVE" ? "sky" : "amarillo"}>
                  {conditionLabel(item.condition)}
                </Insignia>
                <Insignia
                  fondo={
                    item.total >= item.threshold || item.state === "EN_CAMINO" ? "azul" : "naranja"
                  }
                >
                  {stateLabel(item.state)}
                </Insignia>
              </div>
              <h3 className="text-display-md">
                {t("T-113", { comité: committee, n: Math.round(item.total) })}
              </h3>
              <p className="text-sm">
                {t("T-704", { umbral: item.threshold })} ·{" "}
                {t("T-705", { g: result.generalTotal, comité: committee, c: item.committeeTotal })}
              </p>
              <Progreso
                valor={item.total}
                maximo={Math.max(item.threshold, result.generalMax + item.committeeMax, 1)}
                umbral={item.threshold}
                nombre={committee}
                etiqueta={t("T-706", { n: Math.round(item.total), umbral: item.threshold })}
              />
              <p>{stateText(item, committee, closed)}</p>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="tabla-general" className="flex flex-col gap-3">
        <h3 id="tabla-general" className="text-display-md">
          {t("T-120")}
        </h3>
        {generalMissing ? (
          <p className="text-tinta-suave">{t("T-678")}</p>
        ) : (
          <Criterios criteria={result.general} personNames={personNames} closed={closed} />
        )}
        <Obligatorias mandatory={result.mandatory} />
      </section>

      {result.results.map((item) => {
        const committee = committeeNames.get(item.committeeId) ?? item.committeeId;
        return (
          <section
            key={item.committeeId}
            aria-label={t("T-121", { comité: committee })}
            className="flex flex-col gap-3"
          >
            <h3 className="text-display-md">{t("T-121", { comité: committee })}</h3>
            {item.criteria.length === 0 ? (
              <p className="text-tinta-suave">{t("T-679", { comité: committee })}</p>
            ) : (
              <Criterios criteria={item.criteria} personNames={personNames} closed={closed} />
            )}
          </section>
        );
      })}
    </div>
  );
}
