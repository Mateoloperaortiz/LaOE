import { createHash } from "node:crypto";
import type { FormField } from "@/modules/forms";

// Agregados de la encuesta tras la ocasión sin I/O (ADR-038 regla 13): distribución y promedio de las
// calificaciones, conteos de las selecciones y casillas, y los textos libres solo con 3 o más
// respuestas, ordenados por un hash del texto para que el orden no delate a nadie.

export const SURVEY_TEXT_MIN = 3;

export interface QuestionSummary {
  key: string;
  label: string;
  type: FormField["type"];
  /** Solo en calificaciones: promedio con dos decimales, o null sin respuestas. */
  average: number | null;
  /** Calificaciones (1 a 5), selecciones y casillas ("Sí" y "No"): cuántas veces salió cada valor. */
  distribution: Array<{ value: string; count: number }>;
  /** Textos libres, o null cuando hay menos de `SURVEY_TEXT_MIN` respuestas. */
  texts: string[] | null;
}

export interface SurveySummary {
  answered: number;
  questions: QuestionSummary[];
}

function textOrder(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

export function summarizeAnswers(
  fields: readonly FormField[],
  answers: readonly Record<string, unknown>[],
): SurveySummary {
  const questions = fields.map((field): QuestionSummary => {
    const values = answers.map((row) => row[field.key]).filter((value) => value !== undefined);
    switch (field.type) {
      case "RATING": {
        const ratings = values
          .map((value) => (typeof value === "number" ? value : Number.parseInt(String(value), 10)))
          .filter((value) => Number.isInteger(value) && value >= 1 && value <= 5);
        const distribution = [1, 2, 3, 4, 5].map((value) => ({
          value: String(value),
          count: ratings.filter((rating) => rating === value).length,
        }));
        const average =
          ratings.length > 0
            ? Math.round((ratings.reduce((sum, value) => sum + value, 0) / ratings.length) * 100) /
              100
            : null;
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          average,
          distribution,
          texts: null,
        };
      }
      case "SELECT":
      case "MULTISELECT": {
        const chosen = values.flatMap((value) =>
          Array.isArray(value) ? value.map(String) : [String(value)],
        );
        const distribution = (field.options ?? []).map((option) => ({
          value: option,
          count: chosen.filter((item) => item === option).length,
        }));
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          average: null,
          distribution,
          texts: null,
        };
      }
      case "CHECKBOX": {
        const yes = values.filter((value) => value === true).length;
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          average: null,
          distribution: [
            { value: "true", count: yes },
            { value: "false", count: values.length - yes },
          ],
          texts: null,
        };
      }
      default: {
        const texts = values
          .map((value) => String(value).trim())
          .filter((value) => value.length > 0)
          .sort((a, b) => textOrder(a).localeCompare(textOrder(b)));
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          average: null,
          distribution: [],
          texts: answers.length >= SURVEY_TEXT_MIN ? texts : null,
        };
      }
    }
  });
  return { answered: answers.length, questions };
}
