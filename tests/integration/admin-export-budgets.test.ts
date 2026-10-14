import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportCsv } from "@/app/api/export/[tipo]/route";
import { closeDb } from "@/db/client";
import {
  approveBudgetAs,
  closeBudgetAs,
  createBudgetAs,
  openBudgetAs,
  setBudgetLinesAs,
} from "@/modules/finance/domain/commands";
import { tList } from "@/shared/copy";
import { seedCommittee, seedMember } from "../factories";
import { truncateAll } from "./db";

// El CSV de presupuestos sale de la casa con el tipo y el estado de cada presupuesto escritos con su
// etiqueta (T-2286 y T-2202). Ninguna prueba lo nombraba (spec #242, «Testing Decisions»): esta fija,
// pasando por la ruta, qué pieza literal de cada lista lleva cada fila, para que leer la etiqueta por
// valor no le cambie una letra al archivo (DT-011, ADR-126).

const session = vi.hoisted(() => ({ getActor: vi.fn() }));

// La ruta arma el actor del comando con la IP del request (ADR-082 regla 2): fuera de Next, las
// cabeceras son estas.
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
// El barrel del admin kit trae componentes con `next/font`, que no carga fuera de Next: de él la ruta
// y los recursos solo usan lo que va nombrado acá, de los contratos y del CSV (DT-384).
vi.mock("@/shared/admin-kit", async () => {
  const { EXPORT_ROW_LIMIT, MULTI_SEPARATOR, resolveFilters } = await import(
    "@/shared/admin-kit/types"
  );
  const { toCsv } = await import("@/shared/admin-kit/csv");
  return { EXPORT_ROW_LIMIT, MULTI_SEPARATOR, resolveFilters, toCsv };
});
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: session.getActor,
}));

const admin = { personId: null, ip: null };

/** Las filas del CSV, sin el BOM ni la cabecera, como un objeto por fila con las columnas del archivo. */
async function exportedBudgets(): Promise<Record<string, string>[]> {
  const response = await exportCsv(new Request("http://localhost/api/export/presupuestos"), {
    params: Promise.resolve({ tipo: "presupuestos" }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  const [header = "", ...lines] = (await response.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
  const columns = header.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
  });
}

describe("el CSV de presupuestos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("lleva en cada fila la etiqueta de su tipo y la de su estado, y no el código", async () => {
    const adminId = await seedMember("admin.presupuestos@eafit.edu.co");
    session.getActor.mockResolvedValue({
      personId: adminId,
      email: "admin.presupuestos@eafit.edu.co",
      membershipStatus: "ACTIVE",
      isAdmin: true,
      permissions: [{ code: "ADMIN", committeeId: null }],
      otpVerifiedAt: new Date(),
    });
    const [borrador, abierto, cerrado] = await Promise.all([
      seedCommittee("borrador", "Comité Borrador"),
      seedCommittee("abierto", "Comité Abierto"),
      seedCommittee("cerrado", "Comité Cerrado"),
    ]);
    // Uno por estado: en borrador, abierto con sus dos aprobaciones y cerrado. El cerrado es además
    // el extraordinario, para que las dos piezas de los tipos salgan en el archivo.
    await createBudgetAs(admin, { committeeId: borrador, year: 2026 });
    const open = await createBudgetAs(admin, { committeeId: abierto, year: 2026 });
    await setBudgetLinesAs(admin, open.id, {
      lines: [{ name: "Logística", assigned: 1000, sortOrder: 1 }],
    });
    await approveBudgetAs(admin, open.id, { approver: "STUDENT_DEVELOPMENT", on: "2026-01-09" });
    await approveBudgetAs(admin, open.id, { approver: "VP_FINANCE", on: "2026-01-10" });
    await openBudgetAs(admin, open.id);
    const closed = await createBudgetAs(admin, {
      committeeId: cerrado,
      year: 2026,
      kind: "EXTRAORDINARY",
      title: "Semana de la carrera",
    });
    await closeBudgetAs(admin, closed.id);

    const rows = await exportedBudgets();

    const kinds = tList("T-2286");
    const statuses = tList("T-2202");
    const byCommittee = Object.fromEntries(
      rows.map((row) => [row.comité, { tipo: row.tipo, estado: row.estado }]),
    );
    expect(byCommittee).toEqual({
      "Comité Borrador": { tipo: kinds[0], estado: statuses[0] },
      "Comité Abierto": { tipo: kinds[0], estado: statuses[1] },
      "Comité Cerrado": { tipo: kinds[1], estado: statuses[2] },
    });
    // Tres piezas distintas de cada lista y ningún código del modelo en el archivo.
    expect(new Set([kinds[0], kinds[1]]).size).toBe(2);
    expect(new Set([statuses[0], statuses[1], statuses[2]]).size).toBe(3);
    const cells = rows.flatMap((row) => [row.tipo, row.estado]);
    for (const code of ["ORDINARY", "EXTRAORDINARY", "DRAFT", "OPEN", "CLOSED"]) {
      expect(cells).not.toContain(code);
    }
  });
});
