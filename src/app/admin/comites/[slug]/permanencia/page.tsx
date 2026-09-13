import type { Metadata } from "next";
import Link from "next/link";
import {
  listCommitteeRecognitions,
  listPendingExcusesForCommittee,
  MONTHS,
  monthName,
} from "@/modules/crm";
import { listInternalRoster, SANCTION_KINDS } from "@/modules/people";
import {
  deviatesFromNominal,
  getRule,
  getTableView,
  listLeaderScores,
  listSnapshots,
} from "@/modules/permanence";
import { ReglaForm } from "@/modules/permanence/components/ReglaForm";
import { TablaReglas } from "@/modules/permanence/components/TablaReglas";
import { getCurrentTerm } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia, LogoComite } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { reglaFormLabels, reglaFormValues } from "../../../permanencia/_ui/reglas";
import { requireCommitteeCapability } from "../../_kit/capacidades";
import {
  applyCommitteeTemplateAction,
  copyCommitteeRulesAction,
  decideExcuseAction,
  deleteCommitteeRuleAction,
  recognizeAction,
  recordCommitteeSanctionAction,
  saveCommitteeRuleAction,
  scoreAction,
} from "./actions";

// Permanencia del comité para su líder (ADR-026, ADR-036): su tabla dentro del nominal, los puntajes
// de sus criterios con observación, el destacado del mes y el progreso de sus miembros.

export async function generateMetadata({
  params,
}: PageProps<"/admin/comites/[slug]/permanencia">): Promise<Metadata> {
  const { slug } = await params;
  const roster = await listInternalRoster(slug);
  return { title: t("T-818", { comité: roster?.committee.name ?? slug }) };
}

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function PermanenciaComitePage({
  params,
  searchParams,
}: PageProps<"/admin/comites/[slug]/permanencia">) {
  const { slug } = await params;
  const base = `/admin/comites/${slug}/permanencia`;
  const access = await requireCommitteeCapability(slug, "PERMANENCE", base);
  const roles = { isAdmin: access.isAdmin, actor: access.actor };
  const roster = access.roster;
  const committee = roster.committee;
  const term = roster.term ?? (await getCurrentTerm());
  const search = (await searchParams) as Search;
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const referencia = single(search.referencia);
  const [nuevoCriterio, copiar, referenciaBtn] = tList("T-715");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-818", { comité: committee.name })}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const view = await getTableView({
    termId: term.id,
    scope: "COMMITTEE",
    committeeId: committee.id,
  });
  const locked = view.lockedAt !== null && !roles.isAdmin;
  const editing = accion === "editar" ? await getRule(single(search.regla)) : null;
  const hidden = { slug };
  const [scores, snapshots, recognitions, excuses] = await Promise.all([
    listLeaderScores(term.id, committee.id),
    listSnapshots(term.id),
    listCommitteeRecognitions(committee.id, term.id),
    listPendingExcusesForCommittee(committee.id, term.id),
  ]);
  const excusa = single(search.excusa);
  const [aprobarExcusa, rechazarExcusa] = tList("T-1001") as [string, string];
  const [campoTipo, campoCausal, campoReferencia, campoFecha, , , campoMiembro] = tList("T-2230");
  const [registrarSancion] = tList("T-2232") as [string, string];
  const kindLabels = tList("T-2229");
  // Desde el comité solo se registran llamados, faltas leves y graves; la suspensión y la
  // inhabilidad las decide GH (Regl. art. 58, 62 y 63).
  const committeeKinds = SANCTION_KINDS.filter((kind) =>
    ["WARNING", "MINOR", "MAJOR"].includes(kind),
  );
  const scoreRules = view.rules.filter((rule) => rule.computation === "LEADER_SCORE");
  const scoreOf = (ruleId: string, personId: string) =>
    scores.find((item) => item.ruleId === ruleId && item.personId === personId) ?? null;
  const members = roster.members.filter((member) => member.status === "ACTIVE");
  const scoring =
    accion === "puntaje"
      ? {
          person: members.find((member) => member.personId === single(search.persona)) ?? null,
          rule: scoreRules.find((rule) => rule.id === single(search.regla)) ?? null,
        }
      : null;
  const [seccionTabla, seccionPuntajes, seccionDestacado, seccionProgreso] = tList("T-819");
  const [destacadoTitulo, nombrarDestacado] = tList("T-778");
  const [campoMes, campoPersona] = tList("T-779");
  const [campoValor, campoObservacion] = tList("T-773");
  const progressColumns = tList("T-820");
  const stateLabels = tList("T-791");
  const conditionLabels = tList("T-792");
  const destacado = single(search.destacado);
  const destacadoNombre =
    members.find((member) => member.personId === single(search.persona))?.fullName ?? "";
  const destacadoMes = monthName(Number(single(search.mes)) || null);
  const closed = term.permanenceClosedAt !== null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        <LogoComite slug={committee.logoKey ?? committee.slug} name={committee.name} size={64} />
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-818", { comité: committee.name })}</h1>
          <p className="max-w-prose text-tinta-suave">
            {t("T-739", { nominal: term.permanenceCommitteeNominal })}
          </p>
          {guardado ? (
            <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
              {referencia
                ? t("T-735", { n: referencia })
                : destacado === "publicado"
                  ? t("T-781", { nombre: destacadoNombre, mes: destacadoMes })
                  : destacado === "registrado"
                    ? t("T-782", { nombre: destacadoNombre, mes: destacadoMes })
                    : t("T-259")}
            </output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <Link href={`/admin/comites/${slug}`} className="boton-secundario ml-auto self-start">
          {committee.name}
        </Link>
      </header>
      {excusa ? (
        <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
          {t("T-2228", {
            estado: (tList("T-876")[excusa === "APPROVED" ? 1 : 2] ?? "").toLowerCase(),
          })}
        </output>
      ) : null}

      <section aria-labelledby="excusas" className="flex flex-col gap-3">
        <h2 id="excusas" className="text-display-md">
          {t("T-2225")}
        </h2>
        {excuses.length === 0 ? (
          <p className="text-sm text-tinta-suave">{t("T-2226")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {excuses.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-borde bg-fondo p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{row.personName}</span>
                  <span className="text-sm text-tinta-suave">{row.detail}</span>
                </div>
                {typeof row.payload.reason === "string" ? (
                  <p className="whitespace-pre-wrap break-words text-sm">{row.payload.reason}</p>
                ) : null}
                {typeof row.payload.evidence === "string" && row.payload.evidence ? (
                  <p className="break-words text-sm text-tinta-suave">{row.payload.evidence}</p>
                ) : null}
                <div className="flex flex-wrap items-end gap-3">
                  <form action={decideExcuseAction}>
                    <AdminFormBody>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="requestId" value={row.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <AdminSubmitButton type="submit" className="boton-calido">
                        {aprobarExcusa}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                  <form action={decideExcuseAction} className="flex flex-wrap items-end gap-2">
                    <AdminFormBody>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="requestId" value={row.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <label
                        className="flex flex-col gap-1 text-sm"
                        htmlFor={`excusa-motivo-${row.id}`}
                      >
                        {t("T-1002")}
                        <input
                          id={`excusa-motivo-${row.id}`}
                          name="reason"
                          type="text"
                          className={inputClass}
                        />
                      </label>
                      <AdminSubmitButton type="submit" className="boton-secundario">
                        {rechazarExcusa}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="registrar-falta" className="flex flex-col gap-3">
        <h2 id="registrar-falta" className="text-display-md">
          {t("T-2242")}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-2231")}</p>
        <form action={recordCommitteeSanctionAction} className="flex flex-col gap-3">
          <AdminFormBody>
            <input type="hidden" name="slug" value={slug} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm" htmlFor="falta-persona">
                {campoMiembro}
                <select id="falta-persona" name="personId" required className={inputClass}>
                  <option value="">—</option>
                  {members.map((member) => (
                    <option key={member.personId} value={member.personId}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm" htmlFor="falta-tipo">
                {campoTipo}
                <select id="falta-tipo" name="kind" required className={inputClass}>
                  {committeeKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabels[SANCTION_KINDS.indexOf(kind)] ?? kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2" htmlFor="falta-causal">
                {campoCausal}
                <textarea id="falta-causal" name="cause" required rows={3} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm" htmlFor="falta-referencia">
                {campoReferencia}
                <input id="falta-referencia" name="reference" type="text" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1 text-sm" htmlFor="falta-fecha">
                {campoFecha}
                <input
                  id="falta-fecha"
                  name="occurredOn"
                  type="date"
                  required
                  defaultValue={todayKey()}
                  className={inputClass}
                />
              </label>
            </div>
            <AdminSubmitButton type="submit" className="boton-secundario self-start">
              {registrarSancion}
            </AdminSubmitButton>
          </AdminFormBody>
        </form>
      </section>

      {locked ? (
        <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {t("T-731", { comité: committee.name })}
        </p>
      ) : null}

      <TablaReglas
        titulo={seccionTabla ?? t("T-121", { comité: committee.name })}
        nominal={term.permanenceCommitteeNominal}
        sums={view.sums}
        deviates={deviatesFromNominal(view.sums.veterans, term.permanenceCommitteeNominal)}
        rules={view.rules}
        lockedAt={view.lockedAt}
        comment={view.comment}
        editHref={locked ? null : (id) => `${base}?accion=editar&regla=${id}`}
        deleteAction={locked ? null : deleteCommitteeRuleAction}
        deleteHidden={hidden}
        acciones={
          locked ? null : (
            <>
              <Link
                href={`${base}?accion=nueva`}
                className="boton-calido min-h-9 px-3 py-1 text-sm"
              >
                {nuevoCriterio}
              </Link>
              {view.rules.length === 0 ? (
                <>
                  <form action={copyCommitteeRulesAction}>
                    <AdminFormBody>
                      <input type="hidden" name="slug" value={slug} />
                      <AdminSubmitButton
                        type="submit"
                        className="boton-secundario min-h-9 px-3 py-1 text-sm"
                      >
                        {copiar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                  <form action={applyCommitteeTemplateAction}>
                    <AdminFormBody>
                      <input type="hidden" name="slug" value={slug} />
                      <AdminSubmitButton
                        type="submit"
                        className="boton-secundario min-h-9 px-3 py-1 text-sm"
                      >
                        {referenciaBtn}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                </>
              ) : null}
            </>
          )
        }
      />

      <section aria-labelledby="puntajes" className="flex flex-col gap-3">
        <h2 id="puntajes" className="text-display-md">
          {seccionPuntajes ?? t("T-771", { comité: committee.name })}
        </h2>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-772")}</p>
        {scoreRules.length === 0 ? (
          <p className="text-tinta-suave">{t("T-777")}</p>
        ) : (
          <AdminTableRegion label={seccionPuntajes ?? committee.name} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow py-2 pr-3 text-xs">
                    {progressColumns[0]}
                  </th>
                  {scoreRules.map((rule) => (
                    <th scope="col" key={rule.id} className="eyebrow py-2 pr-3 text-xs">
                      {rule.label} · {rule.weight}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.personId} className="border-borde border-t">
                    <td className="py-2 pr-3 font-semibold">{member.fullName}</td>
                    {scoreRules.map((rule) => {
                      const score = scoreOf(rule.id, member.personId);
                      return (
                        <td key={rule.id} className="py-2 pr-3">
                          <span className="tabular-nums">
                            {score ? `${score.value} / ${rule.weight}` : "—"}
                          </span>
                          {!closed ? (
                            <Link
                              href={`${base}?accion=puntaje&persona=${member.personId}&regla=${rule.id}`}
                              className="ml-2 underline"
                            >
                              {t("T-252")}
                            </Link>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
      </section>

      <section aria-labelledby="destacado" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="destacado" className="text-display-md">
            {seccionDestacado ?? destacadoTitulo}
          </h2>
          {!closed ? (
            <Link
              href={`${base}?accion=destacado`}
              className="boton-calido min-h-9 px-3 py-1 text-sm"
            >
              {nombrarDestacado}
            </Link>
          ) : null}
        </div>
        {recognitions.length === 0 ? (
          <p className="text-tinta-suave">{t("T-702", { comité: committee.name })}</p>
        ) : (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {recognitions.map((item) => (
              <li key={item.id}>
                <Insignia fondo={item.announcementId ? "amarillo" : "paper"}>
                  {monthName(item.month)} ·{" "}
                  {members.find((member) => member.personId === item.personId)?.fullName ??
                    item.title}
                </Insignia>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="progreso" className="flex flex-col gap-3">
        <h2 id="progreso" className="text-display-md">
          {seccionProgreso}
        </h2>
        <AdminTableRegion label={seccionProgreso ?? committee.name} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {progressColumns.map((column) => (
                  <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const snapshot = snapshots.find((item) => item.personId === member.personId);
                const result = snapshot?.results.find((item) => item.committeeId === committee.id);
                const rate = result?.criteria.find((item) => item.detail.type === "CHECKIN_RATE");
                const meetings =
                  rate && rate.detail.type === "CHECKIN_RATE"
                    ? `${rate.detail.attended} / ${rate.detail.held}`
                    : "—";
                return (
                  <tr key={member.personId} className="border-borde border-t">
                    <td className="py-2 pr-3 font-semibold">{member.fullName}</td>
                    <td className="py-2 pr-3">
                      {result
                        ? (conditionLabels[
                            ["ACTIVE", "NEW", "PROBATION", "TRANSFER"].indexOf(result.condition)
                          ] ?? "")
                        : ""}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{meetings}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {result ? `${Math.round(result.total)} / ${result.threshold}` : t("T-797")}
                    </td>
                    <td className="py-2 pr-3">
                      {result ? (
                        <Insignia
                          fondo={
                            result.state === "NO_ALCANZA" || result.state === "NO_CUMPLE"
                              ? "naranja"
                              : result.state === "EN_RIESGO" || result.state === "PRUEBA"
                                ? "amarillo"
                                : "sky"
                          }
                        >
                          {stateLabels[
                            [
                              "EN_CAMINO",
                              "EN_RIESGO",
                              "NO_ALCANZA",
                              "CUMPLE",
                              "PRUEBA",
                              "NO_CUMPLE",
                            ].indexOf(result.state)
                          ] ?? ""}
                        </Insignia>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTableRegion>
      </section>

      {scoring?.person && scoring.rule ? (
        <ResourcePanel title={scoring.rule.label} closeHref={base} closeLabel={t("T-291")}>
          <form action={scoreAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="personId" value={scoring.person.personId} />
              <input type="hidden" name="ruleId" value={scoring.rule.id} />
              <p className="font-semibold">{scoring.person.fullName}</p>
              <div className="flex flex-col gap-1">
                <label htmlFor="value" className="eyebrow text-xs">
                  {campoValor} · 0 – {scoring.rule.weight}
                </label>
                <input
                  id="value"
                  name="value"
                  type="number"
                  step="0.5"
                  min="0"
                  max={scoring.rule.weight}
                  defaultValue={
                    scoreOf(scoring.rule.id, scoring.person.personId)?.value ?? scoring.rule.weight
                  }
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="note" className="eyebrow text-xs">
                  {campoObservacion}
                </label>
                <textarea
                  id="note"
                  name="note"
                  rows={3}
                  defaultValue={scoreOf(scoring.rule.id, scoring.person.personId)?.note ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "destacado" && !closed ? (
        <ResourcePanel title={destacadoTitulo ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={recognizeAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="slug" value={slug} />
              <div className="flex flex-col gap-1">
                <label htmlFor="month" className="eyebrow text-xs">
                  {campoMes}
                </label>
                <select
                  id="month"
                  name="month"
                  defaultValue={String(new Date().getMonth() + 1)}
                  className={inputClass}
                >
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="personId" className="eyebrow text-xs">
                  {campoPersona}
                </label>
                <select id="personId" name="personId" required className={inputClass}>
                  {members.map((member) => (
                    <option key={member.personId} value={member.personId}>
                      {member.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {nombrarDestacado}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {!locked && (accion === "nueva" || (accion === "editar" && editing)) ? (
        <ResourcePanel
          title={editing ? editing.label : (nuevoCriterio ?? "")}
          closeHref={base}
          closeLabel={t("T-291")}
        >
          <ReglaForm
            action={saveCommitteeRuleAction}
            values={reglaFormValues(editing)}
            hidden={{ ...hidden, id: editing?.id ?? "" }}
            committeeScoped
            labels={reglaFormLabels()}
            cancelHref={base}
            error={error || null}
          />
        </ResourcePanel>
      ) : null}
    </div>
  );
}
