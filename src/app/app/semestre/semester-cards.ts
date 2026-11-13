// Las tarjetas de «Tu semestre en la OE» (ADR-173 regla 2): una por cosa que la persona hizo, en este
// orden, y solo las que tienen algo. Una tarjeta en cero no sale: el resumen no compara ni avergüenza.

export const SEMESTER_CARDS = ["attended", "points", "challenges", "badges", "games"] as const;
export type SemesterCard = (typeof SEMESTER_CARDS)[number];

export function semesterCards(
  summary: Record<SemesterCard, number>,
): Array<{ key: SemesterCard; value: number }> {
  return SEMESTER_CARDS.filter((key) => summary[key] > 0).map((key) => ({
    key,
    value: summary[key],
  }));
}
