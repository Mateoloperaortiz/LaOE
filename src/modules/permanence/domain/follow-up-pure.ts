// Los formatos de seguimiento de la Presidencia (ADR-197 reglas 4 y 5), en el orden del modelo.
export const FOLLOW_UP_KINDS = [
  "CAP_PLAN",
  "CAP_MEETING",
  "EDITION_PLAN",
  "EDITION_MEETING",
  "EDITION_HANDOVER",
] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

/** Una plantilla escrita como texto: una pregunta por línea, sin líneas vacías ni repetidas. */
export function questionsFromText(text: string): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const question = line.trim();
    if (question.length === 0 || seen.has(question)) continue;
    seen.add(question);
    questions.push(question);
  }
  return questions;
}
