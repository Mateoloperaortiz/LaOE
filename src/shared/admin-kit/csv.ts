// CSV para exportes: celdas neutralizadas contra fórmulas (01-arquitectura.md, seguridad transversal).

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function quote(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Devuelve el CSV con BOM (para Excel) y fin de línea CRLF. */
export function toCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  keys = headers,
): string {
  const lines = [headers.map((header) => quote(neutralizeCell(header))).join(",")];
  for (const row of rows) {
    lines.push(keys.map((key) => quote(neutralizeCell(row[key]))).join(","));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
