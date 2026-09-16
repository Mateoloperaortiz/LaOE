import "server-only";
import type { Computation, Rule, RuleInputValues } from "@/modules/permanence";
import type { ReglaFormLabels, ReglaFormValues } from "@/modules/permanence/components/ReglaForm";
import { t, tList } from "@/shared/copy";

// Ayudas del editor de reglas compartidas por GH (/admin/permanencia/reglas) y el líder
// (/admin/comites/[slug]/permanencia): textos del formulario, valores desde una regla y el
// armado de `params` desde el formulario según el cálculo.

const COMPUTATIONS: Computation[] = [
  "CHECKIN_COUNT",
  "CHECKIN_THRESHOLD",
  "CHECKIN_RATE",
  "GROUP_EVALUATED",
  "COMPOSITE",
  "LEADER_SCORE",
  "MANUAL",
];
const CATEGORIES = [
  "INTEGRATION",
  "ATHLETIC_MATCH",
  "COMMITTEE_MEETING",
  "TALK",
  "WORKSHOP",
  "SOCIAL",
  "OTHER",
];
const KINDS = ["ACTIVITY", "ASSEMBLY", "EDITION_SESSION"];
const GROUP_KINDS = [
  "WORK_COMMITTEE",
  "GT_MACROEVENT",
  "GAP",
  "GAP_OE",
  "BARRA_BRAVA",
  "NEW_MEMBER_TASK",
];

function options(values: string[], code: Parameters<typeof tList>[0]) {
  const labels = tList(code);
  return values.map((value, index) => ({ value, label: labels[index] ?? value }));
}

export function reglaFormLabels(): ReglaFormLabels {
  const names = tList("T-718");
  const helps = tList("T-719");
  return {
    fields: tList("T-716"),
    appliesTo: options(["ALL", "NEW", "VETERAN"], "T-717"),
    computations: COMPUTATIONS.map((value, index) => ({
      value,
      label: names[index] ?? value,
      help: helps[index] ?? "",
    })),
    occasionParams: tList("T-720"),
    newMembersFilters: options(["ANY", "ONLY", "EXCLUDE"], "T-721"),
    committeeFilters: options(["ANY", "OWN"], "T-722"),
    categories: options(CATEGORIES, "T-566"),
    kinds: options(KINDS, "T-564"),
    any: t("T-740"),
    groupParams: tList("T-723"),
    groupModes: options(["FIXED", "PER_GROUP", "TIERS"], "T-724"),
    groupKinds: options(GROUP_KINDS, "T-725"),
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

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(formData: FormData, name: string): number | undefined {
  const value = text(formData, name);
  return value === "" ? undefined : Number(value);
}

function optionalText(formData: FormData, name: string): string | undefined {
  const value = text(formData, name);
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
  return text(formData, "tiers")
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
  const computation = text(formData, "computation") as Computation;
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
    key: text(formData, "key"),
    label: text(formData, "label"),
    description: text(formData, "description"),
    weight: Number(text(formData, "weight")),
    appliesTo: (optionalText(formData, "appliesTo") ?? "ALL") as RuleInputValues["appliesTo"],
    computation,
    params: cleaned,
    sortOrder: Number(text(formData, "sortOrder") || "0"),
  };
}
