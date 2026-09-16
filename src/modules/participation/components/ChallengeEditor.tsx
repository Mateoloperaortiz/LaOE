"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminFormState } from "@/shared/admin-kit/AdminFormDrafts";
import { t, tList } from "@/shared/copy";
import type { ChallengeAudience, ChallengeKind } from "../gamification-types";

// Editor del admin para retos (ADR-067 reglas 2 y 3): serializa las preguntas como JSON en un
// input oculto y deja solo título y descripción editables cuando el reto ya está publicado.
// Un control deshabilitado no viaja en el formulario: los congelados van también como ocultos.

export interface ChallengeQuestionDraft {
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface ChallengeEditorInitial {
  kind: ChallengeKind;
  title: string;
  description: string;
  audience: ChallengeAudience;
  audienceCommitteeIds: string[];
  opensAt: string;
  closesAt: string;
  basePoints: number;
  passPercent: number | null;
  occasionId: string | null;
  questions: ChallengeQuestionDraft[];
}

export interface ChallengeEditorProps {
  initial: ChallengeEditorInitial;
  occasions: Array<{ id: string; label: string }>;
  committees: Array<{ id: string; name: string }>;
  /** Publicado: formato, público, ventana, premio, umbral, ocasión y preguntas quedan congelados. */
  locked: boolean;
  defaults: { trivia: number; presential: number; evidence: number; passPercent: number };
}

interface EditorState {
  kind: ChallengeKind;
  audience: ChallengeAudience;
  committeeIds: string[];
  questions: ChallengeQuestionDraft[];
}

const KINDS: ChallengeKind[] = ["PRESENTIAL", "TRIVIA", "EVIDENCE"];
const AUDIENCES: ChallengeAudience[] = ["ALL", "NEW", "VETERAN", "COMMITTEES"];
const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none disabled:opacity-60";

export function ChallengeEditor({
  initial,
  occasions,
  committees,
  locked,
  defaults,
}: ChallengeEditorProps) {
  const labels = tList("T-2504");
  const kinds = tList("T-2409");
  const audiences = tList("T-2411");
  // Tras un error el formulario se remonta: se retoma lo elegido para que el borrador encaje.
  const memory = useAdminFormState<EditorState>("reto");
  const [saved] = useState(() => memory.read());
  const [kind, setKind] = useState<ChallengeKind>(saved?.kind ?? initial.kind);
  const [audience, setAudience] = useState<ChallengeAudience>(saved?.audience ?? initial.audience);
  const [committeeIds, setCommitteeIds] = useState<string[]>(
    saved?.committeeIds ?? initial.audienceCommitteeIds,
  );
  const [questions, setQuestions] = useState<ChallengeQuestionDraft[]>(
    saved?.questions ?? initial.questions,
  );
  const fields = useRef<HTMLFieldSetElement>(null);
  const { write, clear } = memory;
  // Consumido al montar: un segundo error sin reenviar el editor muestra lo guardado.
  useEffect(() => clear(), [clear]);
  useEffect(() => {
    const form = fields.current?.form;
    if (!form) return;
    const capture = () => write({ kind, audience, committeeIds, questions });
    form.addEventListener("submit", capture, true);
    return () => form.removeEventListener("submit", capture, true);
  }, [write, kind, audience, committeeIds, questions]);

  const field = (index: number) => labels[index] ?? "";

  return (
    <fieldset ref={fields} className="flex flex-col gap-5">
      <input type="hidden" name="questionsJson" value={JSON.stringify(questions)} />
      {committeeIds.map((id) => (
        <input key={id} type="hidden" name="audienceCommitteeIds" value={id} />
      ))}
      {locked ? (
        <>
          <input type="hidden" name="kind" value={initial.kind} />
          <input type="hidden" name="audience" value={initial.audience} />
          <input type="hidden" name="opensAt" value={initial.opensAt} />
          <input type="hidden" name="closesAt" value={initial.closesAt} />
          <input type="hidden" name="basePoints" value={initial.basePoints} />
          <input type="hidden" name="passPercent" value={initial.passPercent ?? ""} />
          <input type="hidden" name="occasionId" value={initial.occasionId ?? ""} />
        </>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{field(0)}</span>
        <select
          name="kind"
          required
          value={kind}
          disabled={locked}
          onChange={(event) => setKind(event.target.value as ChallengeKind)}
          className={inputClass}
        >
          {KINDS.map((value, index) => (
            <option key={value} value={value}>
              {kinds[index] ?? value}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{field(1)}</span>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={initial.title}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{field(2)}</span>
        <textarea
          name="description"
          rows={4}
          maxLength={4000}
          defaultValue={initial.description}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{field(3)}</span>
        <select
          name="audience"
          required
          value={audience}
          disabled={locked}
          onChange={(event) => setAudience(event.target.value as ChallengeAudience)}
          className={inputClass}
        >
          {AUDIENCES.map((value, index) => (
            <option key={value} value={value}>
              {audiences[index] ?? value}
            </option>
          ))}
        </select>
      </label>

      {audience === "COMMITTEES" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="eyebrow text-xs">{field(4)}</legend>
          {committees.map((committee) => (
            <label key={committee.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={locked}
                checked={committeeIds.includes(committee.id)}
                onChange={(event) =>
                  setCommitteeIds(
                    event.target.checked
                      ? [...committeeIds, committee.id]
                      : committeeIds.filter((id) => id !== committee.id),
                  )
                }
              />
              {committee.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{field(5)}</span>
          <input
            name="opensAt"
            type="datetime-local"
            required
            disabled={locked}
            defaultValue={initial.opensAt}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{field(6)}</span>
          <input
            name="closesAt"
            type="datetime-local"
            required
            disabled={locked}
            defaultValue={initial.closesAt}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="eyebrow text-xs">{field(7)}</span>
        <input
          name="basePoints"
          type="number"
          min={0}
          max={20}
          step={1}
          required
          disabled={locked}
          defaultValue={initial.basePoints}
          className={inputClass}
        />
        <span className="text-xs text-tinta-suave">
          {t("T-2505", {
            trivia: defaults.trivia,
            presencial: defaults.presential,
            evidencia: defaults.evidence,
          })}
        </span>
      </label>

      {kind === "TRIVIA" ? (
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{field(8)}</span>
          <input
            name="passPercent"
            type="number"
            min={1}
            max={100}
            step={1}
            disabled={locked}
            defaultValue={initial.passPercent ?? ""}
            className={inputClass}
          />
          <span className="text-xs text-tinta-suave">
            {t("T-2506", { n: defaults.passPercent })}
          </span>
        </label>
      ) : null}

      {kind === "PRESENTIAL" ? (
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-xs">{field(9)}</span>
          <select
            name="occasionId"
            required
            disabled={locked}
            defaultValue={initial.occasionId ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {occasions.map((occasion) => (
              <option key={occasion.id} value={occasion.id}>
                {occasion.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-tinta-suave">{t("T-2584")}</span>
        </label>
      ) : null}

      {kind === "TRIVIA" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="eyebrow text-xs">{t("T-2509")}</legend>
          {questions.map((question, qIndex) => (
            <div
              key={`q-${qIndex + 1}`}
              className="flex flex-col gap-2 rounded-xl border border-borde p-3"
            >
              <input
                required
                maxLength={300}
                disabled={locked}
                value={question.prompt}
                onChange={(event) =>
                  setQuestions(
                    questions.map((item, i) =>
                      i === qIndex ? { ...item, prompt: event.target.value } : item,
                    ),
                  )
                }
                className={inputClass}
              />
              {question.options.map((option, oIndex) => (
                <div key={`o-${qIndex + 1}-${oIndex + 1}`} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${qIndex}`}
                    disabled={locked}
                    checked={question.correctIndex === oIndex}
                    onChange={() =>
                      setQuestions(
                        questions.map((item, i) =>
                          i === qIndex ? { ...item, correctIndex: oIndex } : item,
                        ),
                      )
                    }
                  />
                  <input
                    required
                    maxLength={120}
                    disabled={locked}
                    value={option}
                    onChange={(event) =>
                      setQuestions(
                        questions.map((item, i) =>
                          i === qIndex
                            ? {
                                ...item,
                                options: item.options.map((opt, j) =>
                                  j === oIndex ? event.target.value : opt,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  {question.options.length > 2 && !locked ? (
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        setQuestions(
                          questions.map((item, i) =>
                            i === qIndex
                              ? {
                                  ...item,
                                  options: item.options.filter((_, j) => j !== oIndex),
                                  correctIndex:
                                    item.correctIndex > oIndex
                                      ? item.correctIndex - 1
                                      : Math.min(item.correctIndex, item.options.length - 2),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              {question.options.length < 6 && !locked ? (
                <button
                  type="button"
                  className="self-start text-xs underline"
                  onClick={() =>
                    setQuestions(
                      questions.map((item, i) =>
                        i === qIndex ? { ...item, options: [...item.options, ""] } : item,
                      ),
                    )
                  }
                >
                  +
                </button>
              ) : null}
              {questions.length > 1 && !locked ? (
                <button
                  type="button"
                  className="self-start text-xs text-oe-orange underline"
                  onClick={() => setQuestions(questions.filter((_, i) => i !== qIndex))}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          {questions.length < 5 && !locked ? (
            <button
              type="button"
              className="boton-secundario self-start min-h-8 px-3 py-1 text-xs"
              onClick={() =>
                setQuestions([...questions, { prompt: "", options: ["", ""], correctIndex: 0 }])
              }
            >
              +
            </button>
          ) : null}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
