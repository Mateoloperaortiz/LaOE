import { parseCsv } from "@/shared/lib/csv";

// Importación de miembros a un grupo desde un CSV (ADR-036 regla 6): una columna CORREO, o una sola
// columna de correos sin cabecera; devuelve los correos normalizados, sin repetidos ni vacíos.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export function parseGroupCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return [];
  }
  const header = rows[0] ?? [];
  let column = header.findIndex((cell) =>
    ["correo", "email", "correo institucional", "e-mail"].includes(normalizeHeader(cell)),
  );
  let body = rows.slice(1);
  if (column === -1) {
    // Sin cabecera: la columna que parezca de correos en la primera fila.
    column = header.findIndex((cell) => EMAIL.test(cell.trim()));
    body = rows;
  }
  if (column === -1) {
    return [];
  }
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const row of body) {
    const value = (row[column] ?? "").trim().toLowerCase();
    if (!EMAIL.test(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    emails.push(value);
  }
  return emails;
}
