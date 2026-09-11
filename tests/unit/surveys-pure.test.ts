import { describe, expect, it } from "vitest";
import { validateAnswers } from "@/modules/forms/domain/pure";
import { SURVEY_TEXT_MIN, summarizeAnswers } from "@/modules/participation/domain/surveys-pure";

// Encuesta tras la ocasión (ADR-038 regla 13): calificación de 1 a 5 y agregados anónimos.

const rating = { key: "calif", label: "¿Cómo estuvo?", type: "RATING" as const, required: true };
const comment = {
  key: "comentario",
  label: "Comentario",
  type: "TEXTAREA" as const,
  required: false,
};
const pick = {
  key: "mejor",
  label: "Lo mejor",
  type: "SELECT" as const,
  required: false,
  options: ["Comida", "Gente"],
};
const box = { key: "vuelve", label: "¿Volverías?", type: "CHECKBOX" as const, required: false };

describe("RATING en validateAnswers", () => {
  it("acepta 1 a 5 como entero y rechaza el resto", () => {
    expect(validateAnswers([rating], { calif: "4" })).toEqual({ ok: true, answers: { calif: 4 } });
    expect(validateAnswers([rating], { calif: "6" })).toEqual({
      ok: false,
      errors: { calif: "T-1171" },
    });
    expect(validateAnswers([rating], { calif: "abc" })).toEqual({
      ok: false,
      errors: { calif: "T-1171" },
    });
    expect(validateAnswers([rating], { calif: "" })).toEqual({
      ok: false,
      errors: { calif: "T-853" },
    });
    expect(validateAnswers([{ ...rating, required: false }], {})).toEqual({
      ok: true,
      answers: {},
    });
  });
});

describe("summarizeAnswers", () => {
  const fields = [rating, comment, pick, box];

  it("promedia y distribuye las calificaciones, cuenta selecciones y casillas, y oculta los textos con pocas respuestas", () => {
    const two = summarizeAnswers(fields, [
      { calif: 5, comentario: "Genial", mejor: "Gente", vuelve: true },
      { calif: 3, comentario: "Regular", mejor: "Comida", vuelve: false },
    ]);
    expect(two.answered).toBe(2);
    const [calif, texto, mejor, vuelve] = two.questions;
    expect(calif?.average).toBe(4);
    expect(calif?.distribution).toEqual([
      { value: "1", count: 0 },
      { value: "2", count: 0 },
      { value: "3", count: 1 },
      { value: "4", count: 0 },
      { value: "5", count: 1 },
    ]);
    expect(texto?.texts).toBeNull();
    expect(mejor?.distribution).toEqual([
      { value: "Comida", count: 1 },
      { value: "Gente", count: 1 },
    ]);
    expect(vuelve?.distribution).toEqual([
      { value: "true", count: 1 },
      { value: "false", count: 1 },
    ]);
  });

  it("con tres o más respuestas muestra los textos en un orden por hash, no por llegada", () => {
    const answers = Array.from({ length: SURVEY_TEXT_MIN }, (_, i) => ({
      calif: 4,
      comentario: `Comentario ${i}`,
    }));
    const summary = summarizeAnswers(fields, answers);
    const texts = summary.questions[1]?.texts ?? [];
    expect(texts).toHaveLength(SURVEY_TEXT_MIN);
    expect([...texts].sort()).toEqual(["Comentario 0", "Comentario 1", "Comentario 2"]);
    // Cambiar el orden de llegada no puede revelar quién respondió primero.
    expect(summarizeAnswers(fields, [...answers].reverse()).questions[1]?.texts).toEqual(texts);
    expect(
      summarizeAnswers(fields, [...answers.slice(1), ...answers.slice(0, 1)]).questions[1]?.texts,
    ).toEqual(texts);
    expect(summary.questions[0]?.average).toBe(4);
    expect(summarizeAnswers(fields, []).questions[0]?.average).toBeNull();
  });
});
