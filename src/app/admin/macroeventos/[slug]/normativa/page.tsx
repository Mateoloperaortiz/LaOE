import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { listMacroevents } from "@/modules/events";
import { requireAdminActor } from "@/modules/identity";
import {
  getMacroeventGovernance,
  listActiveMemberRefs,
  listMacroeventRoles,
  MACROEVENT_ORIGINS,
  MACROEVENT_STATUSES,
  REACTIVATION_STATUSES,
} from "@/modules/people";
import { ElectionGuidance } from "@/modules/people/components/ElectionGuidance";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tLabels } from "@/shared/copy";
import { APP_TIME_ZONE, dateKeyIn } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { governanceAction } from "./actions";

export default async function GovernancePage({
  params,
  searchParams,
}: PageProps<"/admin/macroeventos/[slug]/normativa">) {
  await requireAdminActor("/admin/macroeventos");
  const { slug } = await params;
  const search = await searchParams;
  const event = (await listMacroevents()).find((row) => row.slug === slug);
  if (!event) notFound();
  const currentYear = Number(dateKeyIn(APP_TIME_ZONE, new Date()).slice(0, 4));
  const selected = Number(single(search.year));
  const year =
    Number.isInteger(selected) && selected >= 2026 && selected <= 2100 ? selected : currentYear;
  const [data, roles, members] = await Promise.all([
    getMacroeventGovernance(event.id, year),
    listMacroeventRoles(slug),
    listActiveMemberRefs(),
  ]);
  const origins = tLabels("T-4811", MACROEVENT_ORIGINS);
  const statuses = tLabels("T-4812", MACROEVENT_STATUSES);
  const proposalStatuses = tLabels("T-4813", REACTIVATION_STATUSES);
  const fields = (operation: string) => (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="operation" value={operation} />
    </>
  );
  const submit = (code: "T-4829" | "T-4830" | "T-4834" | "T-4839") => (
    <AdminSubmitButton className="boton-primario self-start" type="submit">
      {t(code)}
    </AdminSubmitButton>
  );
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Link href={`/admin/macroeventos/${slug}`} className="self-start underline">
        {event.name}
      </Link>
      <h1 className="text-display-lg">{t("T-4800")}</h1>
      <p className="max-w-prose text-tinta-suave">{t("T-4801")}</p>
      <ActionForm key={year} className="flex items-end gap-3">
        <Campo id="year" label={t("T-4810")}>
          <input
            className={inputClass}
            id="year"
            name="year"
            type="number"
            min={2026}
            max={2100}
            defaultValue={year}
            required
          />
        </Campo>
        <button className="boton-secundario" type="submit">
          {t("T-250")}
        </button>
      </ActionForm>
      {single(search.guardado) === "1" ? <output>{t("T-259")}</output> : null}
      {single(search.error) ? <p role="alert">{single(search.error)}</p> : null}
      <ElectionGuidance />
      <section className="flex flex-col gap-3 rounded-xl border border-borde p-4">
        <h2 className="text-display-md">
          {data.status ? statuses[data.status] : data.approved ? t("T-4851") : t("T-4814")}
        </h2>
        <p>{t("T-4815", { n: data.viability.elected.length, mínimo: data.viability.minimum })}</p>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-4816")}</p>
        <p>{t("T-4817", { n: data.viability.unverified })}</p>
      </section>
      <div className="flex flex-col gap-3">
        {data.board.map((row) => (
          <details key={row.id} className="rounded-xl border border-borde p-4">
            <summary className="cursor-pointer font-semibold">
              {roles.find((role) => role.code === row.roleCode)?.label ?? row.roleCode} ·{" "}
              {row.fullName} · {row.editionName} · {row.origin ? origins[row.origin] : t("T-4853")}
            </summary>
            <ActionForm action={governanceAction} className="mt-4 flex max-w-2xl flex-col gap-4">
              <AdminFormBody>
                {fields("election")}
                <input type="hidden" name="appointmentId" value={row.id} />
                <Campo id={`origin-${row.id}`} label={t("T-4854")}>
                  <select
                    id={`origin-${row.id}`}
                    name="origin"
                    className={inputClass}
                    defaultValue={row.origin ?? ""}
                    required
                  >
                    <option value="">—</option>
                    {MACROEVENT_ORIGINS.map((origin) => (
                      <option key={origin} value={origin}>
                        {origins[origin]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id={`minutes-${row.id}`} label={t("T-4818")}>
                  <textarea
                    id={`minutes-${row.id}`}
                    name="minutes"
                    className={inputClass}
                    minLength={5}
                    maxLength={2000}
                    required
                    defaultValue={row.evidence?.minutes}
                  />
                </Campo>
                <Casilla
                  id={`requirements-${row.id}`}
                  name="requirementsChecked"
                  label={t("T-4819")}
                />
                <Casilla
                  id={`late-${row.id}`}
                  name="lateCandidacy"
                  label={t("T-4820")}
                  defaultChecked={row.evidence?.lateCandidacy ?? false}
                />
                <Campo id={`permission-${row.id}`} label={t("T-4821")}>
                  <input
                    id={`permission-${row.id}`}
                    name="qualifiedPermission"
                    className={inputClass}
                    maxLength={2000}
                    defaultValue={row.evidence?.qualifiedPermission}
                  />
                </Campo>
                <Campo id={`experience-${row.id}`} label={t("T-4850")}>
                  <select
                    id={`experience-${row.id}`}
                    name="experience"
                    className={inputClass}
                    required
                    defaultValue={row.evidence?.experience ?? ""}
                  >
                    <option value="">—</option>
                    <option value="VERIFIED">{t("T-4822")}</option>
                    <option value="THIRD_ROUND">{t("T-4823")}</option>
                    <option value="NOT_APPLICABLE">{t("T-4824")}</option>
                  </select>
                </Campo>
                {slug === "inventiva" && row.roleCode === "GENERAL" ? (
                  <Casilla
                    id={`faculty-${row.id}`}
                    name="generalFacultyChecked"
                    label={t("T-4825")}
                  />
                ) : null}
                {slug === "enfemenino" &&
                ["GENERAL", "MERCADEO", "AGENDA_ACADEMICA"].includes(row.roleCode) ? (
                  <>
                    <Casilla
                      id={`composition-${row.id}`}
                      name="compositionChecked"
                      label={t("T-4826")}
                    />
                    <p className="text-sm text-tinta-suave">{t("T-4852")}</p>
                  </>
                ) : null}
                <Casilla
                  id={`extraordinary-${row.id}`}
                  name="extraordinary"
                  label={t("T-4827")}
                  defaultChecked={row.evidence?.extraordinary ?? false}
                />
                <Campo id={`plan-${row.id}`} label={t("T-4828")}>
                  <textarea
                    id={`plan-${row.id}`}
                    name="workPlan"
                    className={inputClass}
                    maxLength={2000}
                    defaultValue={row.evidence?.workPlan}
                  />
                </Campo>
                {submit("T-4829")}
              </AdminFormBody>
            </ActionForm>
          </details>
        ))}
      </div>
      {!data.review ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-display-md">{t("T-4830")}</h2>
          <ActionForm action={governanceAction} className="flex max-w-2xl flex-col gap-4">
            <AdminFormBody>
              {fields("review")}
              <Campo id="assemblyOn" label={t("T-4831")}>
                <input
                  id="assemblyOn"
                  name="assemblyOn"
                  type="date"
                  className={inputClass}
                  required
                />
              </Campo>
              <Campo id="reviewMinutes" label={t("T-4833")}>
                <textarea
                  id="reviewMinutes"
                  name="minutes"
                  className={inputClass}
                  required
                  minLength={5}
                  maxLength={2000}
                />
              </Campo>
              <Casilla id="afterElections" name="afterElections" label={t("T-4832")} />
              {submit("T-4830")}
            </AdminFormBody>
          </ActionForm>
        </section>
      ) : null}
      <details className="rounded-xl border border-borde p-4">
        <summary className="cursor-pointer font-semibold">{t("T-4834")}</summary>
        <p className="my-4 max-w-prose text-sm text-tinta-suave">{t("T-4806")}</p>
        <ActionForm action={governanceAction} className="flex max-w-2xl flex-col gap-4">
          <AdminFormBody>
            {fields("proposal")}
            <Campo id="targetYear" label={t("T-4810")}>
              <input
                id="targetYear"
                name="targetYear"
                type="number"
                min={2026}
                max={2100}
                defaultValue={year + 1}
                className={inputClass}
                required
              />
            </Campo>
            <Campo id="submittedOn" label={t("T-4835")}>
              <input
                id="submittedOn"
                name="submittedOn"
                type="date"
                className={inputClass}
                required
              />
            </Campo>
            <Campo id="electionSession" label={t("T-4836")}>
              <textarea
                id="electionSession"
                name="electionSession"
                className={inputClass}
                minLength={5}
                maxLength={2000}
                required
              />
            </Campo>
            <Campo id="mission" label={t("T-4837")}>
              <textarea
                id="mission"
                name="mission"
                className={inputClass}
                minLength={10}
                maxLength={10000}
                required
              />
            </Campo>
            <Campo id="workPlan" label={t("T-4828")}>
              <textarea
                id="workPlan"
                name="workPlan"
                className={inputClass}
                minLength={10}
                maxLength={10000}
                required
              />
            </Campo>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 font-semibold">{t("T-4838")}</legend>
              {roles.map((role) => (
                <Campo key={role.code} id={`role-${role.code}`} label={role.label}>
                  <select
                    id={`role-${role.code}`}
                    name={`role:${role.code}`}
                    className={inputClass}
                    required
                    defaultValue=""
                  >
                    <option value="">—</option>
                    {members
                      .filter((member) => !member.anonymized)
                      .map((member) => (
                        <option key={member.personId} value={member.personId}>
                          {member.fullName}
                        </option>
                      ))}
                  </select>
                </Campo>
              ))}
            </fieldset>
            {submit("T-4834")}
          </AdminFormBody>
        </ActionForm>
      </details>
      <section className="flex flex-col gap-4">
        <h2 className="text-display-md">{t("T-4843")}</h2>
        {data.reviews.map((review) => (
          <div key={review.id} className="rounded-xl border border-borde p-4">
            <p className="font-semibold">
              {review.year} · {statuses[review.status]} · {review.assemblyOn}
            </p>
            <p className="whitespace-pre-wrap">{review.minutes}</p>
            <p>
              {review.electedRoles
                .map((code) => roles.find((role) => role.code === code)?.label ?? code)
                .join(", ")}
            </p>
          </div>
        ))}
        {data.proposals.map((proposal) => (
          <details key={proposal.id} className="rounded-xl border border-borde p-4">
            <summary className="cursor-pointer font-semibold">
              {proposal.year} · {proposalStatuses[proposal.status]} · {proposal.submittedOn}
            </summary>
            <dl className="my-4 flex flex-col gap-2">
              <dt className="font-semibold">{t("T-4837")}</dt>
              <dd className="whitespace-pre-wrap">{proposal.mission}</dd>
              <dt className="font-semibold">{t("T-4828")}</dt>
              <dd className="whitespace-pre-wrap">{proposal.workPlan}</dd>
              <dt className="font-semibold">{t("T-4836")}</dt>
              <dd>{proposal.electionSession}</dd>
              <dt className="font-semibold">{t("T-4838")}</dt>
              <dd>
                <ul>
                  {proposal.roster.map((row) => (
                    <li key={row.roleCode}>
                      {roles.find((role) => role.code === row.roleCode)?.label ?? row.roleCode} ·{" "}
                      <Link className="underline" href={`/admin/personas/${row.personId}`}>
                        {members.find((member) => member.personId === row.personId)?.fullName ??
                          t("T-4857")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
            {proposal.status === "PENDING" ? (
              <ActionForm action={governanceAction} className="flex max-w-2xl flex-col gap-4">
                <AdminFormBody>
                  {fields("decision")}
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <Campo id={`decisionKind-${proposal.id}`} label={t("T-4839")}>
                    <select
                      id={`decisionKind-${proposal.id}`}
                      name="decision"
                      className={inputClass}
                      required
                      defaultValue=""
                    >
                      <option value="">—</option>
                      <option value="APPROVED">{t("T-4840")}</option>
                      <option value="REJECTED">{t("T-4856")}</option>
                    </select>
                  </Campo>
                  <Campo id={`decision-${proposal.id}`} label={t("T-4841")}>
                    <textarea
                      id={`decision-${proposal.id}`}
                      name="decisionMinutes"
                      className={inputClass}
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </Campo>
                  <Campo id={`notice-${proposal.id}`} label={t("T-4842")}>
                    <textarea
                      id={`notice-${proposal.id}`}
                      name="assemblyNotice"
                      className={inputClass}
                      minLength={5}
                      maxLength={2000}
                      required
                    />
                  </Campo>
                  {submit("T-4839")}
                </AdminFormBody>
              </ActionForm>
            ) : (
              <>
                <p>{proposal.decisionMinutes}</p>
                <p>{proposal.assemblyNotice}</p>
              </>
            )}
          </details>
        ))}
      </section>
    </div>
  );
}
