import { randomUUID } from "node:crypto";
import { withQuery } from "@/app/_lib/search";
import { getPeopleByIds, listCommitteesByIds, listTermRoster } from "@/modules/people";
import { previewPermanenceBonus } from "@/modules/permanence";
import { ResourcePanel } from "@/shared/admin-kit";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { grantBonusAction } from "./actions";
import { BonusForm } from "./BonusForm";

const path = "/admin/permanencia/cumplimiento";

function personLabel(person: { fullName: string; email: string }) {
  return person.fullName ? `${person.fullName} · ${person.email}` : person.email;
}

async function PersonPicker({ termId, filter }: { termId: string; filter: string }) {
  const roster = await listTermRoster(termId);
  const ids = [
    ...new Set(
      roster
        .filter((row) => row.status === "ACTIVE" && row.leftAt === null)
        .map((row) => row.personId),
    ),
  ];
  const people = [...(await getPeopleByIds(ids)).values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "es-CO"),
  );
  if (people.length === 0) return <p className="text-sm text-tinta-suave">{t("T-4883")}</p>;
  return (
    <ActionForm action={path} method="get" className="flex flex-col gap-3">
      <input type="hidden" name="termId" value={termId} />
      <input type="hidden" name="filtro" value={filter} />
      <input type="hidden" name="bono" value="1" />
      <Campo id="bonus-person" label={t("T-4861")}>
        <select id="bonus-person" name="persona" defaultValue="" required className={inputClass}>
          <option value="" disabled>
            {t("T-4879")}
          </option>
          {people.map((member) => (
            <option key={member.id} value={member.id}>
              {personLabel(member)}
            </option>
          ))}
        </select>
      </Campo>
      <AdminSubmitButton className="boton-secundario self-start">{t("T-4862")}</AdminSubmitButton>
    </ActionForm>
  );
}

export async function BonusPanel({
  termId,
  personId,
  filter,
}: {
  termId: string;
  personId: string;
  filter: string;
}) {
  const back = withQuery(path, { termId, filtro: filter });
  if (!personId) {
    return (
      <ResourcePanel title={t("T-4860")} closeHref={back} closeLabel={t("T-291")}>
        <PersonPicker termId={termId} filter={filter} />
      </ResourcePanel>
    );
  }
  const [preview, people] = await Promise.all([
    previewPermanenceBonus(termId, personId),
    getPeopleByIds([personId]),
  ]);
  const person = people.get(personId);
  const committeeIds = (preview ?? []).flatMap(({ committeeId }) =>
    committeeId ? [committeeId] : [],
  );
  const committees = await listCommitteesByIds(committeeIds);
  const committeeNames = new Map(committees.map((committee) => [committee.id, committee.name]));
  const groups = (preview ?? []).map((group) => ({
    ...group,
    title: group.committeeId
      ? t("T-121", { comité: committeeNames.get(group.committeeId) ?? group.committeeId })
      : t("T-120"),
  }));

  return (
    <ResourcePanel title={t("T-4860")} closeHref={back} closeLabel={t("T-291")}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        {preview && person ? (
          <p className="min-w-0 break-words font-semibold">{personLabel(person)}</p>
        ) : null}
        <Link href={withQuery(back, { bono: "1" })} scroll={false} className="underline">
          {t("T-4882")}
        </Link>
      </div>
      {groups.length > 0 ? (
        <BonusForm
          key={`${termId}:${personId}`}
          groups={groups}
          action={grantBonusAction.bind(null, termId, personId, filter)}
          back={back}
          requestId={randomUUID()}
        />
      ) : (
        <p className="text-sm text-tinta-suave">{t(preview ? "T-4871" : "T-4863")}</p>
      )}
    </ResourcePanel>
  );
}
