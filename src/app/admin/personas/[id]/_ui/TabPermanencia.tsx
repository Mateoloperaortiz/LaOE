import Link from "next/link";
import { getPeopleByIds, listCommitteesByIds } from "@/modules/people";
import { getPersonPermanence, listManualCredits, loadRules } from "@/modules/permanence";
import { Desglose } from "@/modules/permanence/components/Desglose";
import { ResourcePanel } from "@/shared/admin-kit";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { grantCreditAction } from "../actions";
import { Bloque, Campo, inputClass } from "./campos";

// Pestaña Permanencia de la Persona 360 (ADR-036): el mismo desglose que ve la persona, en vivo
// mientras el término está abierto; créditos manuales de GH; las decisiones del cierre llegan en F4-T6.

type Props = {
  personId: string;
  termId: string | null;
  accion: string;
  error: string;
  closeHref: string;
};

export async function TabPermanencia({ personId, termId, accion, error, closeHref }: Props) {
  const [resultado, , , creditos] = tList("T-829");
  const [creditoTitulo, reconocer] = tList("T-785");
  const [campoCriterio, campoValor, campoMotivo] = tList("T-786");
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
  const committeeIds = view.result.results.map((item) => item.committeeId);
  const [committees, people, credits, rules] = await Promise.all([
    listCommitteesByIds(committeeIds),
    getPeopleByIds([...evaluatorIds]),
    listManualCredits(termId, personId),
    loadRules(termId),
  ]);
  const manualRules = rules.filter(
    (rule) =>
      rule.computation === "MANUAL" &&
      (rule.committeeId === null || committeeIds.includes(rule.committeeId)),
  );
  const committeeNames = new Map(committees.map((item) => [item.id, item.name]));
  const closed = view.term.permanenceClosedAt !== null;
  return (
    <div className="flex flex-col gap-6">
      <Bloque titulo={resultado ?? ""}>
        <Desglose
          result={view.result}
          closed={closed}
          committeeNames={committeeNames}
          personNames={new Map([...people.values()].map((item) => [item.id, item.fullName]))}
          generalMissing={view.result.evaluated && view.result.general.length === 0}
          voice="admin"
        />
        <p className="text-sm text-tinta-suave">
          {t("T-796", { fecha: formatDateTime(view.computedAt) })}
        </p>
      </Bloque>
      <Bloque titulo={creditos ?? ""}>
        {credits.length === 0 ? (
          <p className="text-tinta-suave">{t("T-693")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {credits.map((credit) => (
              <li key={credit.ruleId} className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold">{credit.label}</span>
                <span className="tabular-nums">
                  {credit.value} / {credit.weight} · {credit.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!closed && manualRules.length > 0 ? (
          <Link href={`${closeHref}&accion=credito`} className="boton-secundario self-start">
            {reconocer}
          </Link>
        ) : null}
      </Bloque>
      {accion === "credito" && !closed ? (
        <ResourcePanel title={creditoTitulo ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
          <form action={grantCreditAction} className="flex flex-col gap-4">
            <input type="hidden" name="personId" value={personId} />
            <Campo id="campo-ruleId" label={campoCriterio ?? ""}>
              <select id="campo-ruleId" name="ruleId" required className={inputClass}>
                {manualRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.committeeId ? `${committeeNames.get(rule.committeeId) ?? ""} · ` : ""}
                    {rule.label} · {rule.weight}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-value" label={campoValor ?? ""}>
              <input
                id="campo-value"
                name="value"
                type="number"
                step="0.5"
                min="0"
                required
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-reason" label={campoMotivo ?? ""}>
              <textarea id="campo-reason" name="reason" rows={3} required className={inputClass} />
            </Campo>
            <div className="flex items-center gap-3">
              <button type="submit" className="boton-calido">
                {reconocer}
              </button>
              <Link href={closeHref} className="boton-secundario">
                {t("T-254")}
              </Link>
            </div>
          </form>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
