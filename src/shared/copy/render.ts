// Convierte el markdown mínimo del inventario de textos (**negrita**) a texto plano y a HTML seguro.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderPlain(markdown: string): string {
  return markdown.replaceAll("**", "");
}

export function renderHtml(markdown: string): string {
  return escapeHtml(markdown).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
