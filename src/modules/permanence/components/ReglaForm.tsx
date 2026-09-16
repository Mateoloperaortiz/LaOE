"use client";

import Link from "next/link";
import { useState } from "react";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";

// Formulario de un criterio (ADR-036 regla 3): los campos de parámetros cambian con el cálculo.
// Recibe todos los textos por props para no cargar el diccionario en el cliente.

export type Computation =
  | "CHECKIN_COUNT"
  | "CHECKIN_THRESHOLD"
  | "CHECKIN_RATE"
  | "GROUP_EVALUATED"
  | "COMPOSITE"
  | "LEADER_SCORE"
  | "MANUAL";

export interface ReglaFormValues {
  id: string | null;
  key: string;
  label: string;
  description: string;
  weight: string;
  appliesTo: string;
  computation: Computation;
  sortOrder: string;
  params: Record<string, string>;
}

export interface ReglaFormLabels {
  fields: string[]; // T-716: clave, nombre, descripción, peso, aplica a, cálculo, orden
  appliesTo: Array<{ value: string; label: string }>;
  computations: Array<{ value: Computation; label: string; help: string }>;
  occasionParams: string[]; // T-720
  newMembersFilters: Array<{ value: string; label: string }>;
  committeeFilters: Array<{ value: string; label: string }>;
  categories: Array<{ value: string; label: string }>;
  kinds: Array<{ value: string; label: string }>;
  any: string;
  groupParams: string[]; // T-723
  groupModes: Array<{ value: string; label: string }>;
  groupKinds: Array<{ value: string; label: string }>;
  alsoCounts: string; // T-2615
  alsoCountsHelp: string; // T-2616
  mandatory: string;
  tiersHelp: string;
  expectedHelp: string;
  save: string;
  cancel: string;
}

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  values: ReglaFormValues;
  hidden: Record<string, string>;
  committeeScoped: boolean;
  labels: ReglaFormLabels;
  cancelHref: string;
  error: string | null;
};

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

function Campo({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="eyebrow text-xs">
        {label}
      </label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="text-sm text-tinta-suave">
          {help}
        </p>
      ) : null}
    </div>
  );
}

function Select({
  id,
  name,
  value,
  options,
  empty,
}: {
  id: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  empty?: string | undefined;
}) {
  return (
    <select id={id} name={name} defaultValue={value} className={inputClass}>
      {empty !== undefined ? <option value="">{empty}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function usesOccasions(computation: Computation): boolean {
  return (
    computation === "CHECKIN_COUNT" ||
    computation === "CHECKIN_THRESHOLD" ||
    computation === "COMPOSITE"
  );
}

function usesGroup(computation: Computation): boolean {
  return computation === "GROUP_EVALUATED" || computation === "COMPOSITE";
}

export function ReglaForm({
  action,
  values,
  hidden,
  committeeScoped,
  labels,
  cancelHref,
  error,
}: Props) {
  const [computation, setComputation] = useState<Computation>(values.computation);
  const [mode, setMode] = useState(values.params.mode ?? "FIXED");
  const [groupKind, setGroupKind] = useState(values.params.groupKind ?? "GAP");
  // Un criterio GAP que nace aquí trae marcado el GT de macroevento, porque el GT cumple siempre el
  // GAP (ADR-071); un criterio guardado conserva lo que GH dejó, aunque sea vacío.
  const savedAlsoCounts = values.params.alsoCounts;
  const alsoCounts = new Set(
    savedAlsoCounts === undefined
      ? groupKind === "GAP"
        ? ["GT_MACROEVENT"]
        : []
      : savedAlsoCounts.split(",").filter(Boolean),
  );
  const [clave, nombre, descripcion, peso, aplicaA, calculo, orden] = labels.fields;
  const [categoria, tipo, comite, soloNuevos, , porAsistencia, minimo, esperadas] =
    labels.occasionParams;
  const [tipoGrupo, codigo, modo, porGrupo, tramos] = labels.groupParams;
  const current = labels.computations.find((item) => item.value === computation);
  const p = values.params;
  return (
    <form action={action} className="flex flex-col gap-4">
      <AdminFormBody>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
        <Campo id="campo-key" label={clave ?? ""}>
          <input
            id="campo-key"
            name="key"
            defaultValue={values.key}
            required
            pattern="[a-z0-9-]{2,40}"
            className={inputClass}
          />
        </Campo>
        <Campo id="campo-label" label={nombre ?? ""}>
          <input
            id="campo-label"
            name="label"
            defaultValue={values.label}
            required
            className={inputClass}
          />
        </Campo>
        <Campo id="campo-description" label={descripcion ?? ""}>
          <textarea
            id="campo-description"
            name="description"
            defaultValue={values.description}
            rows={2}
            className={inputClass}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-4">
          <Campo id="campo-weight" label={peso ?? ""}>
            <input
              id="campo-weight"
              name="weight"
              type="number"
              step="0.5"
              min="0"
              max="100"
              defaultValue={values.weight}
              required
              className={inputClass}
            />
          </Campo>
          <Campo id="campo-sortOrder" label={orden ?? ""}>
            <input
              id="campo-sortOrder"
              name="sortOrder"
              type="number"
              min="0"
              defaultValue={values.sortOrder}
              className={inputClass}
            />
          </Campo>
        </div>
        <Campo id="campo-appliesTo" label={aplicaA ?? ""}>
          <Select
            id="campo-appliesTo"
            name="appliesTo"
            value={values.appliesTo}
            options={labels.appliesTo}
          />
        </Campo>
        <Campo id="campo-computation" label={calculo ?? ""} help={current?.help}>
          <select
            id="campo-computation"
            name="computation"
            value={computation}
            onChange={(event) => setComputation(event.target.value as Computation)}
            className={inputClass}
          >
            {labels.computations.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Campo>

        {usesOccasions(computation) || computation === "CHECKIN_RATE" ? (
          <fieldset
            key={`ocasiones-${computation}`}
            className="flex flex-col gap-3 rounded-xl border border-borde p-3"
          >
            <legend className="eyebrow px-1 text-xs">
              {labels.computations.find((c) => c.value === "CHECKIN_COUNT")?.label}
            </legend>
            <Campo id="campo-category" label={categoria ?? ""}>
              <Select
                id="campo-category"
                name="category"
                value={p.category ?? (computation === "CHECKIN_RATE" ? "COMMITTEE_MEETING" : "")}
                options={labels.categories}
                empty={computation === "CHECKIN_RATE" ? undefined : labels.any}
              />
            </Campo>
            {computation !== "CHECKIN_RATE" ? (
              <>
                <Campo id="campo-kind" label={tipo ?? ""}>
                  <Select
                    id="campo-kind"
                    name="kind"
                    value={p.kind ?? ""}
                    options={labels.kinds}
                    empty={labels.any}
                  />
                </Campo>
                {committeeScoped ? (
                  <Campo id="campo-committee" label={comite ?? ""}>
                    <Select
                      id="campo-committee"
                      name="committee"
                      value={p.committee ?? "ANY"}
                      options={labels.committeeFilters}
                    />
                  </Campo>
                ) : null}
                <Campo id="campo-newMembersOnly" label={soloNuevos ?? ""}>
                  <Select
                    id="campo-newMembersOnly"
                    name="newMembersOnly"
                    value={p.newMembersOnly ?? "ANY"}
                    options={labels.newMembersFilters}
                  />
                </Campo>
                {computation === "CHECKIN_COUNT" ? (
                  <Campo id="campo-perUnit" label={porAsistencia ?? ""}>
                    <input
                      id="campo-perUnit"
                      name="perUnit"
                      type="number"
                      step="0.5"
                      min="0.5"
                      defaultValue={p.perUnit ?? ""}
                      required
                      className={inputClass}
                    />
                  </Campo>
                ) : (
                  <Campo id="campo-minCount" label={minimo ?? ""}>
                    <input
                      id="campo-minCount"
                      name="minCount"
                      type="number"
                      min="1"
                      defaultValue={p.minCount ?? ""}
                      required
                      className={inputClass}
                    />
                  </Campo>
                )}
                <Campo id="campo-expectedCount" label={esperadas ?? ""} help={labels.expectedHelp}>
                  <input
                    id="campo-expectedCount"
                    name="expectedCount"
                    type="number"
                    min="0"
                    defaultValue={p.expectedCount ?? ""}
                    className={inputClass}
                  />
                </Campo>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {usesGroup(computation) ? (
          <fieldset
            key={`grupo-${computation}`}
            className="flex flex-col gap-3 rounded-xl border border-borde p-3"
          >
            <legend className="eyebrow px-1 text-xs">
              {labels.computations.find((c) => c.value === "GROUP_EVALUATED")?.label}
            </legend>
            <Campo id="campo-groupKind" label={tipoGrupo ?? ""}>
              <select
                id="campo-groupKind"
                name="groupKind"
                value={groupKind}
                onChange={(event) => setGroupKind(event.target.value)}
                className={inputClass}
              >
                {labels.groupKinds.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-code" label={codigo ?? ""}>
              <input
                id="campo-code"
                name="code"
                defaultValue={p.code ?? ""}
                pattern="[A-Z0-9-]{2,20}"
                className={inputClass}
              />
            </Campo>
            {computation === "GROUP_EVALUATED" ? (
              <>
                <Campo id="campo-mode" label={modo ?? ""}>
                  <select
                    id="campo-mode"
                    name="mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                    className={inputClass}
                  >
                    {labels.groupModes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Campo>
                {mode === "PER_GROUP" ? (
                  <Campo id="campo-perGroup" label={porGrupo ?? ""}>
                    <input
                      id="campo-perGroup"
                      name="perGroup"
                      type="number"
                      step="0.5"
                      min="0.5"
                      defaultValue={p.perGroup ?? ""}
                      required
                      className={inputClass}
                    />
                  </Campo>
                ) : null}
                {mode === "TIERS" ? (
                  <Campo id="campo-tiers" label={tramos ?? ""} help={labels.tiersHelp}>
                    <textarea
                      id="campo-tiers"
                      name="tiers"
                      defaultValue={p.tiers ?? ""}
                      rows={3}
                      required
                      className={`${inputClass} font-mono text-sm`}
                    />
                  </Campo>
                ) : null}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 block text-sm font-semibold">{labels.alsoCounts}</legend>
                  <p className="text-sm text-tinta-suave">{labels.alsoCountsHelp}</p>
                  {labels.groupKinds
                    .filter((option) => option.value !== groupKind)
                    .map((option) => (
                      <label
                        key={`${groupKind}-${option.value}`}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          name="alsoCounts"
                          value={option.value}
                          defaultChecked={alsoCounts.has(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                </fieldset>
              </>
            ) : null}
          </fieldset>
        ) : null}

        {computation === "LEADER_SCORE" ? (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="mandatory"
              defaultChecked={p.mandatory === "true"}
              className="size-4"
            />
            <span>{labels.mandatory}</span>
          </label>
        ) : null}

        <div className="flex items-center gap-3">
          <AdminSubmitButton type="submit" className="boton-calido">
            {labels.save}
          </AdminSubmitButton>
          <Link href={cancelHref} className="boton-secundario">
            {labels.cancel}
          </Link>
        </div>
      </AdminFormBody>
    </form>
  );
}
