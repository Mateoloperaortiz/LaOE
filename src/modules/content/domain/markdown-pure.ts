// Ayudas puras sobre Markdown (sin I/O), para resúmenes en tarjetas y metadata.

/** Texto plano corto a partir de Markdown: sin títulos, énfasis, enlaces ni imágenes; corta en una palabra. */
export function excerpt(markdown: string, maxLength = 200): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  const window = text.slice(0, maxLength + 1);
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? window.slice(0, lastSpace) : window.slice(0, maxLength);
  return `${cut.replace(/[\s,;:.]+$/, "")}…`;
}
