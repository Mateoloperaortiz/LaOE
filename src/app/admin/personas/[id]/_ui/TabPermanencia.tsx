import { getPeopleByIds, listCommitteesByIds } from "@/modules/people";
import { getPersonPermanence } from "@/modules/permanence";
import { Desglose } from "@/modules/permanence/components/Desglose";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Bloque } from "./campos";

// Pestaña Permanencia de la Persona 360 (ADR-036): el mismo desglose que ve la persona, en vivo
// mientras el término está abierto; las decisiones del cierre y los créditos manuales llegan en F4-T5 y F4-T6.

type Props = {
  personId: string;
  termId: string | null;
};

export async function TabPermanencia({ personId, termId }: Props) {
  const [resultado] = tList("T-829");
  if (!termId) {
    return <p className="text-tinta-suave">{t("T-548")}</p>;
  }
  const view = await getPersonPermanence(personId, termId);
  if (!view) {
    return <p className="text-tinta-suave">{t("T-548")}</p>;
  }
  const evaluatorIds = new Set<string>();
  for (const criterion of [
    ...view.result.general,
    ...view.result.results.flatMap((item) => item.criteria),
  ]) {
    const detail = criterion.detail;
    if (detail.type === "GROUP_EVALUATED") {
      for (const group of detail.groups) for (const id of group.evaluatorIds) evaluatorIds.add(id);
    } else if (detail.type === "COMPOSITE" && detail.group) {
      for (const id of detail.group.evaluatorIds) evaluatorIds.add(id);
    }
  }
  const [committees, people] = await Promise.all([
    listCommitteesByIds(view.result.results.map((item) => item.committeeId)),
    getPeopleByIds([...evaluatorIds]),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <Bloque titulo={resultado ?? ""}>
        <Desglose
          result={view.result}
          closed={view.term.permanenceClosedAt !== null}
          committeeNames={new Map(committees.map((item) => [item.id, item.name]))}
          personNames={new Map([...people.values()].map((item) => [item.id, item.fullName]))}
          generalMissing={view.result.evaluated && view.result.general.length === 0}
          voice="admin"
        />
        <p className="text-sm text-tinta-suave">
          {t("T-796", { fecha: formatDateTime(view.computedAt) })}
        </p>
      </Bloque>
    </div>
  );
}
