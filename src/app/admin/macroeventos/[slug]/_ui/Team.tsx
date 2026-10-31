import { type getGroupDetail, teamAreaLabel } from "@/modules/permanence";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { macroeventAction } from "../actions";
import { Areas } from "./Areas";
import { Fields, type MacroContext, MemberSelect } from "./Fields";

// Las tres evaluaciones de un integrante, en el orden de T-750.
const EVALUATIONS = ["PENDING", "GOOD", "INSUFFICIENT"] as const;

export function Team({
  context,
  detail,
  members,
  editions,
  closed,
}: {
  context: MacroContext;
  detail: Awaited<ReturnType<typeof getGroupDetail>>;
  members: Array<{ personId: string; fullName: string }>;
  editions: Array<{ id: string; name: string }>;
  closed: boolean;
}) {
  const gap = context.area === "gap";
  if (!detail)
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-prose text-tinta-suave">{t(gap ? "T-2386" : "T-2348")}</p>
        {!closed ? (
          <ActionForm action={macroeventAction}>
            <AdminFormBody>
              <Fields context={context} operation="prepare" />
              <AdminSubmitButton className="boton-primario" type="submit">
                {t(gap ? "T-2385" : "T-2349")}
              </AdminSubmitButton>
            </AdminFormBody>
          </ActionForm>
        ) : null}
      </div>
    );
  const live = detail.members.filter((row) => !row.leftAt);
  const former = detail.members.filter((row) => row.leftAt);
  const [agregar, quitar] = tList("T-748");
  const labels: Readonly<Record<string, string>> = tLabels("T-750", EVALUATIONS);
  const labelFor = (value: string) => labels[value] ?? value;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="max-w-prose text-tinta-suave">{t(gap ? "T-2387" : "T-2359")}</p>
        <p className="font-semibold">
          {t("T-2370", {
            n: live.length,
            m: live.filter((row) => row.evaluation === "PENDING").length,
          })}
        </p>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2393")}</p>
      </div>
      {live.length ? (
        <ul className="m-0 list-none divide-y divide-borde border-y border-borde p-0">
          {live.map((member) => (
            <li key={member.personId} className="flex flex-col gap-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  className="font-semibold underline"
                  href={`/admin/personas/${member.personId}`}
                >
                  {member.name}
                </Link>
                <Insignia
                  fondo={
                    member.evaluation === "GOOD"
                      ? "amarillo"
                      : member.evaluation === "INSUFFICIENT"
                        ? "naranja"
                        : "paper"
                  }
                >
                  {labelFor(member.evaluation)}
                </Insignia>
              </div>
              <p className="text-sm text-tinta-suave">{member.committees.join(" · ")}</p>
              <p className="text-sm font-semibold">
                {member.areas.length ? member.areas.map(teamAreaLabel).join(" · ") : t("T-2391")}
              </p>
              {member.evaluatedAt ? (
                <p className="text-sm text-tinta-suave">
                  {t("T-770", {
                    evaluador: member.evaluatedByName,
                    fecha: formatDateTime(member.evaluatedAt),
                  })}
                </p>
              ) : null}
              {member.note ? <p className="max-w-prose text-sm">{member.note}</p> : null}
              {!closed ? (
                <div className="flex flex-col items-start gap-3">
                  <details className="w-full max-w-xl">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold underline">
                      {t("T-2379")} · {member.name}
                    </summary>
                    <ActionForm action={macroeventAction} className="mt-3 flex flex-col gap-3">
                      <AdminFormBody>
                        <Fields context={context} operation="set-areas" />
                        <input type="hidden" name="personId" value={member.personId} />
                        <Areas slug={context.slug} selected={member.areas} />
                        <AdminSubmitButton className="boton-secundario self-start" type="submit">
                          {t("T-2380")}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  </details>
                  <details className="w-full max-w-xl">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold underline">
                      {t("T-2360")} · {member.name}
                    </summary>
                    <ActionForm action={macroeventAction} className="mt-4 flex flex-col gap-3">
                      <AdminFormBody>
                        <Fields context={context} operation="evaluate" />
                        <input type="hidden" name="personId" value={member.personId} />
                        <Campo id={`evaluation-${member.personId}`} label={t("T-2360")}>
                          <select
                            id={`evaluation-${member.personId}`}
                            name="evaluation"
                            className={inputClass}
                            defaultValue={member.evaluation === "PENDING" ? "" : member.evaluation}
                            required
                          >
                            <option value="">—</option>
                            <option value="GOOD">{labelFor("GOOD")}</option>
                            <option value="INSUFFICIENT">{labelFor("INSUFFICIENT")}</option>
                          </select>
                        </Campo>
                        <Campo id={`note-${member.personId}`} label={t("T-2361")}>
                          <textarea
                            id={`note-${member.personId}`}
                            name="note"
                            className={inputClass}
                            rows={3}
                            maxLength={1000}
                            defaultValue={member.note ?? ""}
                          />
                        </Campo>
                        <AdminSubmitButton className="boton-primario self-start" type="submit">
                          {t("T-2362")}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </ActionForm>
                  </details>
                  <ActionForm action={macroeventAction}>
                    <AdminFormBody>
                      <Fields context={context} operation="remove-member" />
                      <input type="hidden" name="personId" value={member.personId} />
                      <AdminSubmitButton
                        className="min-h-11 min-w-11 text-sm underline"
                        type="submit"
                        aria-label={`${quitar} · ${member.name}`}
                      >
                        {quitar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-tinta-suave">{t("T-844")}</p>
      )}
      {!closed ? (
        <ActionForm action={macroeventAction} className="flex max-w-xl flex-col gap-3">
          <AdminFormBody>
            <Fields context={context} operation="add-member" />
            <MemberSelect
              members={members.filter(
                (member) => !live.some((row) => row.personId === member.personId),
              )}
              name="personId"
              label={agregar ?? ""}
            />
            <Areas slug={context.slug} />
            {!gap ? <p className="text-sm text-tinta-suave">{t("T-2378")}</p> : null}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 font-semibold">
              <input type="checkbox" name="credit" className="size-5 shrink-0 accent-oe-navy" />
              {t("T-2381")}
            </label>
            <p className="text-sm text-tinta-suave">{t("T-2382")}</p>
            <AdminSubmitButton className="boton-secundario self-start" type="submit">
              {agregar}
            </AdminSubmitButton>
          </AdminFormBody>
        </ActionForm>
      ) : null}
      <section aria-labelledby="responsables" className="flex flex-col gap-4">
        <h2 id="responsables" className="text-display-md">
          {t(gap ? "T-2388" : "T-2358")}
        </h2>
        {closed ? (
          <>
            <p>
              {t(gap ? "T-2389" : "T-2364")}: {detail.leaderName || t("T-2357")}
            </p>
            <p>
              {t("T-2365")}: {detail.evaluators.map((row) => row.name).join(" · ") || t("T-2357")}
            </p>
          </>
        ) : (
          <ActionForm action={macroeventAction} className="flex max-w-xl flex-col gap-4">
            <AdminFormBody>
              <Fields context={context} operation="configure" />
              <MemberSelect
                members={members}
                name="leaderPersonId"
                label={t(gap ? "T-2389" : "T-2364")}
                optional
                selected={detail.group.leaderPersonId ?? ""}
              />
              <Campo id="evaluatorIds" label={t("T-2365")}>
                <select
                  id="evaluatorIds"
                  name="evaluatorIds"
                  className={inputClass}
                  multiple
                  size={6}
                  defaultValue={detail.evaluators.map((row) => row.personId)}
                >
                  {members.map((member) => (
                    <option key={member.personId} value={member.personId}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="groupEditionId" label={t(gap ? "T-2390" : "T-2366")}>
                <select
                  id="groupEditionId"
                  name="groupEditionId"
                  className={inputClass}
                  defaultValue={detail.group.editionId ?? ""}
                >
                  <option value="">{t("T-2367")}</option>
                  {editions.map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {edition.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <AdminSubmitButton className="boton-primario self-start" type="submit">
                {t("T-2363")}
              </AdminSubmitButton>
            </AdminFormBody>
          </ActionForm>
        )}
        <Link
          href={`/admin/permanencia/grupos/${detail.group.id}`}
          className="self-start text-sm underline"
        >
          {tList("T-747")[2]}
        </Link>
      </section>
      {former.length ? (
        <details>
          <summary className="cursor-pointer font-semibold">
            {t("T-2369")} · {former.length}
          </summary>
          <ul className="mt-3 space-y-2">
            {former.map((member) => (
              <li key={member.personId}>
                {member.name} · {labelFor(member.evaluation)}
                {member.note ? ` · ${member.note}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
