import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readRosterCells } from "@/modules/people/domain/roster-file";
import { DomainError } from "@/shared/admin-kit/DomainError";

describe("lectura de fechas en roster", () => {
  it("informa el formato incorrecto de un celular sin convertirlo ni abortar con RangeError", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Integrantes sintéticos");
    sheet.addRow(["CORREO", "CELULAR"]);
    sheet.addRow(["sintetica@eafit.edu.co", 3001234567]);
    sheet.getCell("B2").numFmt = "dd/mm/yyyy";
    const bytes = await workbook.xlsx.writeBuffer();
    await expect(readRosterCells(new Uint8Array(bytes), "xlsx")).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(readRosterCells(new Uint8Array(bytes), "xlsx")).rejects.toThrow("copia CSV");
    const csv = new TextEncoder().encode(
      "CORREO;CELULAR;FECHA DE NACIMIENTO\nsintetica@eafit.edu.co;3001234567;2004-02-29\n",
    );
    expect((await readRosterCells(csv, "csv"))[1]).toEqual([
      "sintetica@eafit.edu.co",
      "3001234567",
      "2004-02-29",
    ]);
  });
});
