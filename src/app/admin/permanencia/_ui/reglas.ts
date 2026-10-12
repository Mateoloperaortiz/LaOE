import "server-only";
import { formText } from "@/app/_lib/form";
import { OCCASION_CATEGORIES } from "@/modules/participation";
import {
  APPLIES_TO,
  COMPUTATIONS,
  type Computation,
  type Rule,
  type RuleInputValues,
  WORK_GROUP_KINDS,
} from "@/modules/permanence";
import type { ReglaFormLabels, ReglaFormValues } from "@/modules/permanence/components/ReglaForm";
import { t, tLabels, tList } from "@/shared/copy";

// Ayudas del editor de reglas compartidas por GH (/admin/permanencia/reglas) y el líder
// (/admin/comites/[slug]/permanencia): textos del formulario, valores desde una regla y el
// armado de `params` desde el formulario según el cálculo.

// Las siete categorías que admite una regla (`src/modules/permanence/domain/params.ts`): las de una
// ocasión menos `INDUCTION`. Su etiqueta se lee por valor con el par de las ocho (ADR-126 regla 9).
const CATEGORIES = [
  "INTEGRATION",
  "ATHLETIC_MATCH",
  "COMMITTEE_MEETING",
  "TALK",
  "WORKSHOP",
  "SOCIAL",
  "OTHER",
] as const;
const KINDS = ["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"] as const;
const NEW_MEMBERS_FILTERS = ["ANY", "ONLY", "EXCLUDE"] as const;
const COMMITTEE_FILTERS = ["ANY", "OWN"] as const;
const GROUP_MODES = ["FIXED", "PER_GROUP", "TIERS"] as const;

/** Las opciones de un select, con la etiqueta de cada valor leída por valor (ADR-126 regla 3). */
function labeled<Value extends string>(
  values: readonly Value[],
  labels: Readonly<Record<Value, string>>,
) {
  return values.map((value) => ({ value, label: labels[value] ?? value }));
}

export function reglaFormLabels(): ReglaFormLabels {
  const names = tLabels("T-718", COMPUTATIONS);
  const helps = tLabels("T-719", COMPUTATIONS);
  return {
    fields: tList("T-716"),
    appliesTo: labeled(APPLIES_TO, tLabels("T-717", APPLIES_TO)),
    computations: COMPUTATIONS.map((value) => ({
      value,
      label: names[value] ?? value,
      help: helps[value] ?? "",
    })),
    occasionParams: tList("T-720"),
    newMembersFilters: labeled(NEW_MEMBERS_FILTERS, tLabels("T-721", NEW_MEMBERS_FILTERS)),
    committeeFilters: labeled(COMMITTEE_FILTERS, tLabels("T-722", COMMITTEE_FILTERS)),
    categories: labeled(CATEGORIES, tLabels("T-566", OCCASION_CATEGORIES)),
    kinds: labeled(KINDS, tLabels("T-564", KINDS)),
    any: t("T-740"),
    groupParams: tList("T-723"),
    groupModes: labeled(GROUP_MODES, tLabels("T-724", GROUP_MODES)),
    groupKinds: labeled(WORK_GROUP_KINDS, tLabels("T-725", WORK_GROUP_KINDS)),
    alsoCounts: t("T-2615"),
    alsoCountsHelp: t("T-2616"),
    mandatory: t("T-726"),
    tiersHelp: t("T-727"),
    expectedHelp: t("T-728"),
    save: t("T-253"),
    cancel: t("T-254"),
  };
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** Valores del formulario a partir de una regla guardada (los tramos se muestran como líneas "cantidad valor"). */
export function reglaFormValues(rule: Rule | null): ReglaFormValues {
  if (!rule) {
    return {
      id: null,
      key: "",
      label: "",
      description: "",
      weight: "",
      appliesTo: "ALL",
      computation: "CHECKIN_COUNT",
      sortOrder: "0",
      params: {},
    };
  }
  const params: Record<string, string> = {};
  const raw = rule.params as Record<string, unknown>;
  if (rule.computation === "COMPOSITE") {
    const checkIns = raw.checkIns as Record<string, unknown>;
    const group = raw.group as Record<string, unknown>;
    for (const [key, value] of Object.entries(checkIns)) params[key] = str(value);
    for (const [key, value] of Object.entries(group)) params[key] = str(value);
  } else {
    for (const [key, value] of Object.entries(raw)) {
      params[key] =
        key === "tiers" && Array.isArray(value)
          ? value
              .map(
                (tier) =>
                  `${(tier as { count: number }).count} ${(tier as { value: number }).value}`,
              )
              .join("\n")
          : key === "alsoCounts" && Array.isArray(value)
            ? value.join(",")
            : str(value);
    }
  }
  return {
    id: rule.id,
    key: rule.key,
    label: rule.label,
    description: rule.description,
    weight: String(rule.weight),
    appliesTo: rule.appliesTo,
    computation: rule.computation,
    sortOrder: String(rule.sortOrder),
    params,
  };
}

function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = formText(formData, name);
  return value === "" ? undefined : Number(value);
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = formText(formData, name);
  return value === "" ? undefined : value;
}

function occasionFilter(formData: FormData, committeeScoped: boolean) {
  return {
    category: optionalText(formData, "category"),
    kind: optionalText(formData, "kind"),
    committee: committeeScoped ? optionalText(formData, "committee") : "ANY",
    newMembersOnly: optionalText(formData, "newMembersOnly"),
    expectedCount: optionalNumber(formData, "expectedCount"),
  };
}

function tiers(formData: FormData) {
  return formText(formData, "tiers")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [count, value] = line.split(/[\s,;]+/);
      return { count: Number(count), value: Number(value) };
    });
}

/** Arma la entrada de la regla desde el formulario; la validación final es de `ruleInputSchema`. */
export function ruleInputFromForm(formData: FormData, committeeScoped: boolean): RuleInputValues {
  const computation = formText(formData, "computation") as Computation;
  let params: Record<string, unknown> = {};
  switch (computation) {
    case "CHECKIN_COUNT":
      params = {
        ...occasionFilter(formData, committeeScoped),
        perUnit: optionalNumber(formData, "perUnit"),
      };
      break;
    case "CHECKIN_THRESHOLD":
      params = {
        ...occasionFilter(formData, committeeScoped),
        minCount: optionalNumber(formData, "minCount"),
      };
      break;
    case "CHECKIN_RATE":
      params = {
        category: optionalText(formData, "category") ?? "COMMITTEE_MEETING",
        committee: "OWN",
      };
      break;
    case "GROUP_EVALUATED": {
      const mode = optionalText(formData, "mode") ?? "FIXED";
      params = {
        groupKind: optionalText(formData, "groupKind"),
        code: optionalText(formData, "code"),
        mode,
        perGroup: mode === "PER_GROUP" ? optionalNumber(formData, "perGroup") : undefined,
        tiers: mode === "TIERS" ? tiers(formData) : undefined,
        alsoCounts: formData
          .getAll("alsoCounts")
          .filter((value): value is string => typeof value === "string"),
      };
      break;
    }
    case "COMPOSITE":
      params = {
        checkIns: {
          ...occasionFilter(formData, committeeScoped),
          minCount: optionalNumber(formData, "minCount"),
        },
        group: {
          groupKind: optionalText(formData, "groupKind"),
          code: optionalText(formData, "code"),
        },
      };
      break;
    case "LEADER_SCORE":
      params = { mandatory: formData.get("mandatory") === "on" };
      break;
    default:
      params = {};
  }
  const cleaned = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  return {
    key: formText(formData, "key"),
    label: formText(formData, "label"),
    description: formText(formData, "description"),
    weight: Number(formText(formData, "weight")),
    appliesTo: (optionalText(formData, "appliesTo") ?? "ALL") as RuleInputValues["appliesTo"],
    computation,
    params: cleaned,
    sortOrder: Number(formText(formData, "sortOrder") || "0"),
  };
}
