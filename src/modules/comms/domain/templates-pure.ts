// Plantillas y correos de campaña sin I/O (ADR-038 regla 8): variables por persona, un conversor
// propio del subconjunto Markdown que admiten los correos (títulos, párrafos, negrita, cursiva,
// enlaces y listas; el HTML crudo se escapa, como en el portal) y el envoltorio de T-207.

export const TEMPLATE_VARIABLES = [
  "nombre",
  "apellido",
  "correo",
  "comités",
  "semestre",
  "url",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Record<TemplateVariable, string>;

/** Sustituye `{variable}` por su valor; las desconocidas quedan tal cual. */
export function renderTemplate(text: string, values: TemplateValues): string {
  return text.replace(/\{([a-zA-Zñáéíóú]+)\}/g, (match, key: string) =>
    key in values ? values[key as TemplateVariable] : match,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

/** Negrita, cursiva y enlaces sobre texto ya escapado. */
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) =>
      SAFE_URL.test(url)
        ? `<a href="${url}" style="color:#001f3e;text-decoration:underline">${label}</a>`
        : match,
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; ordered: boolean; items: string[] };

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading?.[1] && heading[2]) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet?.[1] || numbered?.[1]) {
      const ordered = Boolean(numbered);
      const item = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (current && current.kind === "list" && current.ordered === ordered) {
        current.items.push(item);
      } else {
        flush();
        current = { kind: "list", ordered, items: [item] };
      }
      continue;
    }
    if (current && current.kind === "paragraph") {
      current.lines.push(line.trim());
    } else {
      flush();
      current = { kind: "paragraph", lines: [line.trim()] };
    }
  }
  flush();
  return blocks;
}

/** HTML con estilos en línea para clientes de correo. */
export function markdownToMailHtml(markdown: string): string {
  const parts: string[] = [];
  for (const block of parseBlocks(markdown)) {
    if (block.kind === "heading") {
      const size = block.level === 1 ? 24 : block.level === 2 ? 20 : 17;
      parts.push(
        `<h${block.level} style="margin:24px 0 8px;font-size:${size}px;line-height:1.25;color:#001f3e">${inline(escapeHtml(block.text))}</h${block.level}>`,
      );
    } else if (block.kind === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li style="margin:4px 0">${inline(escapeHtml(item))}</li>`)
        .join("");
      parts.push(`<${tag} style="margin:0 0 16px;padding-left:24px">${items}</${tag}>`);
    } else {
      parts.push(
        `<p style="margin:0 0 16px;line-height:1.5">${block.lines.map((line) => inline(escapeHtml(line))).join("<br>")}</p>`,
      );
    }
  }
  return parts.join("\n");
}

/** Texto plano: sin marcas, con los enlaces como "texto (url)". */
export function markdownToPlain(markdown: string): string {
  const parts: string[] = [];
  for (const block of parseBlocks(markdown)) {
    if (block.kind === "heading") {
      parts.push(block.text.toUpperCase());
    } else if (block.kind === "list") {
      parts.push(
        block.items
          .map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`)
          .join("\n"),
      );
    } else {
      parts.push(block.lines.join("\n"));
    }
  }
  return parts
    .join("\n\n")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1$2");
}

export interface EmailWrap {
  /** Cabecera del correo (T-001). */
  siteName: string;
  bodyHtml: string;
  bodyText: string;
  /** Cierre "Lo hacemos por vos" (T-002). */
  closing: string;
  /** Pie legal (T-208) con `{enlace de baja si aplica}` sin resolver. */
  footer: string;
  /** Texto del enlace de baja (T-210) y su URL; sin URL el pie no lleva enlace. */
  unsubscribe?: { label: string; url: string };
}

/** Envoltorio de T-207: cabecera textual, cuerpo, cierre y pie legal con el enlace de baja. */
export function wrapEmail(wrap: EmailWrap): { html: string; text: string; preview: string } {
  const footerHtml = escapeHtml(wrap.footer).replace(
    "{enlace de baja si aplica}",
    wrap.unsubscribe
      ? `<a href="${wrap.unsubscribe.url}" style="color:#001f3e;text-decoration:underline">${escapeHtml(wrap.unsubscribe.label)}</a>`
      : "",
  );
  const footerText = wrap.footer.replace(
    "{enlace de baja si aplica}",
    wrap.unsubscribe ? `${wrap.unsubscribe.label}: ${wrap.unsubscribe.url}` : "",
  );
  // `preview` es el fragmento sin `html` ni `body`: la vista previa del admin lo inserta en la página
  // y así los estilos del cuerpo del correo no pisan los del sitio.
  const preview = `<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Helvetica,Arial,sans-serif;color:#1d1d1d">
<div style="padding:16px 0;border-bottom:3px solid #001f3e;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#001f3e">${escapeHtml(wrap.siteName)}</div>
<div style="padding:24px 0 8px;font-size:16px">${wrap.bodyHtml}</div>
<p style="margin:16px 0 24px;font-size:16px;font-weight:bold;color:#001f3e">${escapeHtml(wrap.closing)}</p>
<div style="padding-top:16px;border-top:1px solid #d9d9d9;font-size:12px;color:#666">${footerHtml}</div>
</div>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;color:#1d1d1d">
${preview}</body></html>`;
  const text = `${wrap.bodyText}\n\n${wrap.closing}\n\n${footerText.trim()}`;
  return { html, text, preview };
}

// Elegibilidad de una campaña (decisión 2 de la fase 6): roster por defecto, resto con consentimiento.

export type SkipReason = "NO_EMAIL" | "OPTED_OUT" | "NO_CONSENT";

export const ROSTER_STATUSES = ["ACTIVE", "ON_LEAVE", "HONORARY"] as const;

export interface EligibilityInput {
  email: string | null;
  personalEmail: string | null;
  membershipStatus: string | null;
  emailCampaigns: boolean;
  hasCommunicationsConsent: boolean;
}

export type Eligibility = { ok: true; address: string } | { ok: false; reason: SkipReason };

/**
 * Activos, en licencia y honorarios reciben al correo institucional salvo baja; el resto (egresados,
 * prospectos, externos) solo con consentimiento vivo y al personal si lo tiene.
 */
export function campaignEligibility(input: EligibilityInput): Eligibility {
  const roster = (ROSTER_STATUSES as readonly string[]).includes(input.membershipStatus ?? "");
  const address = roster ? input.email : (input.personalEmail ?? input.email);
  if (!address) {
    return { ok: false, reason: "NO_EMAIL" };
  }
  if (!input.emailCampaigns) {
    return { ok: false, reason: "OPTED_OUT" };
  }
  if (!roster && !input.hasCommunicationsConsent) {
    return { ok: false, reason: "NO_CONSENT" };
  }
  return { ok: true, address };
}
