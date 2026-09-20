import ExcelJS from "exceljs";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { parseCsv } from "./roster-pure";

// Lee el archivo del roster (CSV o la primera hoja de un XLSX) como celdas de texto.

export const ROSTER_MAX_BYTES = 5 * 1024 * 1024;

export type RosterFormat = "csv" | "xlsx";

export function rosterFormat(filename: string, contentType: string): RosterFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || contentType.includes("spreadsheetml")) {
    return "xlsx";
  }
  if (lower.endsWith(".csv") || contentType.includes("csv") || contentType === "text/plain") {
    return "csv";
  }
  return null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new DomainError(t("T-2082"));
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
    if ("result" in value) {
      return cellText(value.result as ExcelJS.CellValue);
    }
    return "";
  }
  return String(value);
}

export async function readRosterCells(
  bytes: Uint8Array,
  format: RosterFormat,
): Promise<string[][]> {
  if (format === "csv") {
    return parseCsv(new TextDecoder("utf-8").decode(bytes));
  }
  const workbook = new ExcelJS.Workbook();
  const buffer = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const values = row.values;
    if (Array.isArray(values)) {
      for (let index = 1; index < values.length; index += 1) {
        cells[index - 1] = cellText(values[index] as ExcelJS.CellValue).trim();
      }
    }
    rows.push(cells.map((cell) => cell ?? ""));
  });
  return rows;
}
