import Link from "next/link";
import type {
  BaseRow,
  CompetitionRow,
  RegistrationCandidate,
  StaffRow,
  TeamRow,
} from "@/modules/competition";
import { TarjetasCodigo } from "@/modules/competition/components/TarjetasCodigo";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { t, tList } from "@/shared/copy";
import { issueCodesAction } from "../actions";
import { OperationForm, type PanelContext, Section, Submit, TeamChip } from "./shared";

// Preparación de The Games (ADR-089): ajustes y estado, equipos con sus códigos, bases por jornada y
// personal. Sin datos personales de los capitanes: de la inscripción solo se ve el nombre del equipo.

export function Resumen({
  context,
  competition,
  counts,
  forms,
  isAdmin,
}: {
  context: PanelContext;
  competition: CompetitionRow;
  counts: { teams: number; bases: number; rotations: number };
  forms: Array<{ id: string; label: string }>;
  isAdmin: boolean;
}) {
  const statuses = tList("T-2804");
  const statusIndex = ["DRAFT", "LIVE", "FINISHED", "ARCHIVED"].indexOf(competition.status);
  const [nombre, dia1, dia2, formulario, apuestas, puntos, propio] = tList("T-2806");
  const actions = tList("T-2808");
  const closed = competition.status === "FINISHED" || competition.status === "ARCHIVED";
  return (
    <Section title={tList("T-2805")[0] ?? ""}>
      <p>
        {t("T-2810", {
          estado: statuses[statusIndex] ?? competition.status,
          equipos: counts.teams,
          bases: counts.bases,
          rotaciones: counts.rotations,
        })}
      </p>
      <div className="flex flex-wrap gap-3">
        {(["DRAFT", "LIVE", "FINISHED", "ARCHIVED"] as const).map((status, index) =>
          status === competition.status || (closed && !isAdmin && index < 2) ? null : (
            <OperationForm key={status} context={context} operation="status" hidden={{ status }}>
              <Submit variant={status === "LIVE" ? "primario" : "secundario"}>
                {actions[index]}
              </Submit>
            </OperationForm>
          ),
        )}
        <Link
          className="boton-secundario min-h-11"
          href={`/api/v1/the-games/${competition.slug}`}
          prefetch={false}
        >
          {t("T-2809")}
        </Link>
      </div>
      <OperationForm
        context={context}
        operation="settings"
        className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Campo id="name" label={nombre ?? ""}>
          <input id="name" name="name" className={inputClass} defaultValue={competition.name} />
        </Campo>
        <Campo id="registrationFormId" label={formulario ?? ""}>
          <select
            id="registrationFormId"
            name="registrationFormId"
            className={inputClass}
            defaultValue={competition.registrationFormId ?? ""}
          >
            <option value="">—</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="firstDayOn" label={dia1 ?? ""}>
          <input
            id="firstDayOn"
            name="firstDayOn"
            type="date"
            className={inputClass}
            defaultValue={competition.firstDayOn ?? ""}
          />
        </Campo>
        <Campo id="secondDayOn" label={dia2 ?? ""}>
          <input
            id="secondDayOn"
            name="secondDayOn"
            type="date"
            className={inputClass}
            defaultValue={competition.secondDayOn ?? ""}
          />
        </Campo>
        <Campo id="startingCredits" label={puntos ?? ""}>
          <input
            id="startingCredits"
            name="startingCredits"
            type="number"
            min={0}
            className={inputClass}
            defaultValue={competition.startingCredits ?? ""}
          />
        </Campo>
        <div className="flex flex-col gap-2">
          <Casilla
            id="bettingEnabled"
            name="bettingEnabled"
            label={apuestas ?? ""}
            defaultChecked={competition.bettingEnabled}
          />
          <Casilla
            id="allowSelfBet"
            name="allowSelfBet"
            label={propio ?? ""}
            defaultChecked={competition.allowSelfBet}
          />
        </div>
        <div className="sm:col-span-2">
          <Submit variant="primario">{t("T-2807")}</Submit>
        </div>
      </OperationForm>
    </Section>
  );
}

export function Equipos({
  context,
  teams,
  candidates,
  hasForm,
}: {
  context: PanelContext;
  teams: TeamRow[];
  candidates: RegistrationCandidate[];
  hasForm: boolean;
}) {
  const columns = tList("T-2811");
  const states = tList("T-2812");
  const codeStates = tList("T-2817");
  const [retirar, reactivar] = tList("T-2822");
  const [emitirFaltantes, emitirTodos] = tList("T-2818");
  const nextNumber = Math.max(0, ...teams.map((team) => team.number)) + 1;
  const pending = candidates.filter((candidate) => candidate.teamId === null);
  return (
    <Section title={tList("T-2805")[1] ?? ""}>
      {teams.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2888")}</p>
      ) : (
        <table className="admin-data-table w-full text-left text-sm">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="py-2">
                  {column}
                </th>
              ))}
              <th scope="col" className="py-2">
                <span className="sr-only">{retirar}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-t border-borde">
                <td className="py-2 tabular-nums">{team.number}</td>
                <td className="py-2">
                  <TeamChip team={team} />
                </td>
                <td className="py-2 font-mono text-xs">{team.color ?? "—"}</td>
                <td className="py-2">{team.status === "ACTIVE" ? states[0] : states[1]}</td>
                <td className="py-2">
                  {team.codeLocked ? codeStates[2] : team.hasCode ? codeStates[0] : codeStates[1]}
                </td>
                <td className="py-2">
                  <OperationForm
                    context={context}
                    operation="team-status"
                    hidden={{
                      teamId: team.id,
                      status: team.status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE",
                    }}
                  >
                    <Submit>{team.status === "ACTIVE" ? retirar : reactivar}</Submit>
                  </OperationForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-titulo-md">{t("T-2813")}</h3>
      <OperationForm
        context={context}
        operation="create-team"
        className="grid max-w-3xl grid-cols-1 items-end gap-3 sm:grid-cols-[6rem_1fr_8rem_auto]"
      >
        <Campo id="team-number" label={columns[0] ?? ""}>
          <input
            id="team-number"
            name="number"
            type="number"
            min={1}
            max={99}
            required
            className={inputClass}
            defaultValue={nextNumber}
          />
        </Campo>
        <Campo id="team-name" label={columns[1] ?? ""}>
          <input id="team-name" name="name" required maxLength={60} className={inputClass} />
        </Campo>
        <Campo id="team-color" label={columns[2] ?? ""}>
          <input id="team-color" name="color" type="color" className={`${inputClass} h-11`} />
        </Campo>
        <Submit variant="primario">{t("T-2813")}</Submit>
      </OperationForm>

      <h3 className="text-titulo-md">{t("T-2814")}</h3>
      {!hasForm ? (
        <p className="text-tinta-suave">{t("T-2816")}</p>
      ) : pending.length === 0 ? (
        <p className="text-tinta-suave">—</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
          {pending.map((candidate, index) => (
            <li key={candidate.submissionId} className="py-3">
              <OperationForm
                context={context}
                operation="create-team"
                hidden={{ submissionId: candidate.submissionId }}
                className="flex flex-wrap items-end gap-3"
              >
                <Campo id={`cand-name-${index}`} label={columns[1] ?? ""}>
                  <input
                    id={`cand-name-${index}`}
                    name="name"
                    required
                    maxLength={60}
                    className={inputClass}
                    defaultValue={candidate.teamName}
                  />
                </Campo>
                <Campo id={`cand-number-${index}`} label={columns[0] ?? ""}>
                  <input
                    id={`cand-number-${index}`}
                    name="number"
                    type="number"
                    min={1}
                    max={99}
                    required
                    className={`${inputClass} w-24`}
                    defaultValue={nextNumber + index}
                  />
                </Campo>
                <Submit>{t("T-2815")}</Submit>
              </OperationForm>
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-titulo-md">{columns[4]}</h3>
      <TarjetasCodigo
        competitionId={context.competitionId}
        action={issueCodesAction}
        labels={{
          missing: emitirFaltantes ?? "",
          all: emitirTodos ?? "",
          warning: t("T-2819"),
          card: t("T-2820", { n: "{n}", nombre: "{nombre}" }),
          print: t("T-2821"),
          pending: t("T-1501"),
        }}
      />
    </Section>
  );
}

export function Bases({ context, bases }: { context: PanelContext; bases: BaseRow[] }) {
  const columns = tList("T-2823");
  const kinds = tList("T-2824");
  return (
    <Section title={tList("T-2805")[2] ?? ""}>
      {([1, 2] as const).map((day) => {
        const own = bases.filter((base) => base.day === day);
        const nextOrder = Math.max(-1, ...own.map((base) => base.orderIndex)) + 1;
        return (
          <div key={day} className="flex flex-col gap-3">
            <h3 className="text-titulo-md">{t("T-2825", { dia: day })}</h3>
            {own.length === 0 ? (
              <p className="text-tinta-suave">{t("T-2889")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
                {own.map((base) => (
                  <li key={base.id} className="py-2">
                    <OperationForm
                      context={context}
                      operation="save-base"
                      hidden={{ baseId: base.id, day: String(day) }}
                      className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[5rem_1fr_12rem_1fr_auto]"
                    >
                      <Campo id={`order-${base.id}`} label={columns[0] ?? ""}>
                        <input
                          id={`order-${base.id}`}
                          name="orderIndex"
                          type="number"
                          min={0}
                          className={inputClass}
                          defaultValue={base.orderIndex + 1}
                        />
                      </Campo>
                      <Campo id={`name-${base.id}`} label={columns[1] ?? ""}>
                        <input
                          id={`name-${base.id}`}
                          name="name"
                          required
                          className={inputClass}
                          defaultValue={base.name}
                        />
                      </Campo>
                      <Campo id={`kind-${base.id}`} label={columns[2] ?? ""}>
                        <select
                          id={`kind-${base.id}`}
                          name="kind"
                          className={inputClass}
                          defaultValue={base.kind}
                        >
                          <option value="NORMAL">{kinds[0]}</option>
                          <option value="MACRO">{kinds[1]}</option>
                        </select>
                      </Campo>
                      <Campo id={`location-${base.id}`} label={columns[3] ?? ""}>
                        <input
                          id={`location-${base.id}`}
                          name="location"
                          className={inputClass}
                          defaultValue={base.location ?? ""}
                        />
                      </Campo>
                      <Submit>{t("T-253")}</Submit>
                    </OperationForm>
                  </li>
                ))}
              </ul>
            )}
            <OperationForm
              context={context}
              operation="save-base"
              hidden={{ day: String(day) }}
              className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[5rem_1fr_12rem_1fr_auto]"
            >
              <Campo id={`new-order-${day}`} label={columns[0] ?? ""}>
                <input
                  id={`new-order-${day}`}
                  name="orderIndex"
                  type="number"
                  min={1}
                  className={inputClass}
                  defaultValue={nextOrder + 1}
                />
              </Campo>
              <Campo id={`new-name-${day}`} label={columns[1] ?? ""}>
                <input id={`new-name-${day}`} name="name" required className={inputClass} />
              </Campo>
              <Campo id={`new-kind-${day}`} label={columns[2] ?? ""}>
                <select id={`new-kind-${day}`} name="kind" className={inputClass}>
                  <option value="NORMAL">{kinds[0]}</option>
                  <option value="MACRO">{kinds[1]}</option>
                </select>
              </Campo>
              <Campo id={`new-location-${day}`} label={columns[3] ?? ""}>
                <input id={`new-location-${day}`} name="location" className={inputClass} />
              </Campo>
              <Submit variant="primario">{t("T-2826")}</Submit>
            </OperationForm>
          </div>
        );
      })}
    </Section>
  );
}

export function Personal({
  context,
  staff,
  bases,
  members,
}: {
  context: PanelContext;
  staff: StaffRow[];
  bases: BaseRow[];
  members: Array<{ personId: string; fullName: string }>;
}) {
  const [operador, juez] = tList("T-2827");
  const [persona, rol, base] = tList("T-2829");
  const baseLabel = (id: string | null) => {
    const found = bases.find((item) => item.id === id);
    return found ? `${t("T-2825", { dia: found.day })} · ${found.name}` : "";
  };
  return (
    <Section title={tList("T-2805")[3] ?? ""}>
      {staff.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2887")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
          {staff.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <span className="font-semibold">{row.fullName}</span>
                <span className="text-tinta-suave">
                  {" · "}
                  {row.role === "OPERATOR" ? operador : `${juez} · ${baseLabel(row.baseId)}`}
                </span>
              </span>
              <OperationForm
                context={context}
                operation="remove-staff"
                hidden={{ staffId: row.id }}
              >
                <Submit>{t("T-2830")}</Submit>
              </OperationForm>
            </li>
          ))}
        </ul>
      )}
      <OperationForm
        context={context}
        operation="assign-staff"
        className="grid max-w-3xl grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_10rem_1fr_auto]"
      >
        <Campo id="staff-person" label={persona ?? ""}>
          <select id="staff-person" name="personId" required className={inputClass}>
            <option value="">—</option>
            {members.map((member) => (
              <option key={member.personId} value={member.personId}>
                {member.fullName}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="staff-role" label={rol ?? ""}>
          <select id="staff-role" name="role" className={inputClass} defaultValue="JUDGE">
            <option value="JUDGE">{juez}</option>
            <option value="OPERATOR">{operador}</option>
          </select>
        </Campo>
        <Campo id="staff-base" label={base ?? ""}>
          <select id="staff-base" name="baseId" className={inputClass}>
            <option value="">—</option>
            {bases.map((item) => (
              <option key={item.id} value={item.id}>
                {baseLabel(item.id)}
              </option>
            ))}
          </select>
        </Campo>
        <Submit variant="primario">{t("T-2828")}</Submit>
      </OperationForm>
    </Section>
  );
}
