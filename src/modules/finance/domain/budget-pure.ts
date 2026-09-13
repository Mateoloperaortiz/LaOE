// Presupuesto del comité sin I/O (ADR-059, ADR-060 regla 12): disponible por rubro, totales, sanción
// por presentación tardía y la clave del mes de un gasto.

export const BUDGET_KINDS = ["ORDINARY", "EXTRAORDINARY"] as const;

export const BUDGET_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const APPROVERS = ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const;

/** No presentar el presupuesto a tiempo sin aplazamiento descuenta el 10 % (Regl. art. 66). */
export const LATE_BUDGET_SANCTION_PERCENT = 10;

export interface LineLike {
  id: string;
  name: string;
  assigned: number;
  sortOrder: number;
}

export interface ExpenseLike {
  lineId: string;
  amount: number;
}

export interface TransferLike {
  fromLineId: string;
  toLineId: string;
  amount: number;
}

export interface LineSummary {
  id: string;
  name: string;
  /** Lo asignado ya con la sanción descontada, si la hay. */
  assigned: number;
  spent: number;
  transferredIn: number;
  transferredOut: number;
  available: number;
}

export interface BudgetTotals {
  assigned: number;
  spent: number;
  available: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lo asignado tras la sanción por presentación tardía (Regl. art. 66), a dos decimales. */
export function sanctioned(assigned: number, percent: number): number {
  return round2(assigned * (1 - Math.min(Math.max(percent, 0), 100) / 100));
}

/** Disponible = asignado + traslados recibidos − traslados salientes − gastos (ADR-059 regla 3). */
export function summarizeLines(
  lines: readonly LineLike[],
  expenses: readonly ExpenseLike[],
  transfers: readonly TransferLike[],
  sanctionPercent = 0,
): LineSummary[] {
  return [...lines]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"))
    .map((line) => {
      const assigned = sanctioned(line.assigned, sanctionPercent);
      const spent = round2(
        expenses.filter((item) => item.lineId === line.id).reduce((sum, i) => sum + i.amount, 0),
      );
      const transferredIn = round2(
        transfers.filter((item) => item.toLineId === line.id).reduce((sum, i) => sum + i.amount, 0),
      );
      const transferredOut = round2(
        transfers
          .filter((item) => item.fromLineId === line.id)
          .reduce((sum, i) => sum + i.amount, 0),
      );
      return {
        id: line.id,
        name: line.name,
        assigned,
        spent,
        transferredIn,
        transferredOut,
        available: round2(assigned + transferredIn - transferredOut - spent),
      };
    });
}

export function availableOf(
  lineId: string,
  lines: readonly LineLike[],
  expenses: readonly ExpenseLike[],
  transfers: readonly TransferLike[],
  sanctionPercent = 0,
): number {
  return (
    summarizeLines(lines, expenses, transfers, sanctionPercent).find((l) => l.id === lineId)
      ?.available ?? 0
  );
}

export function totalsOf(summaries: readonly LineSummary[]): BudgetTotals {
  return {
    assigned: round2(summaries.reduce((sum, line) => sum + line.assigned, 0)),
    spent: round2(summaries.reduce((sum, line) => sum + line.spent, 0)),
    available: round2(summaries.reduce((sum, line) => sum + line.available, 0)),
  };
}

/** "AAAA-MM" de una fecha civil (la presolicitud es mensual, Est. art. 38.3). */
export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Un presupuesto se abre con las dos aprobaciones y al menos un rubro (Regl. art. 50 par. 1). */
export function canOpen(budget: {
  studentDevelopmentApprovedOn: string | null;
  vpFinanceApprovedOn: string | null;
  lines: number;
}): "T-2290" | "T-2291" | null {
  if (!budget.studentDevelopmentApprovedOn || !budget.vpFinanceApprovedOn) {
    return "T-2290";
  }
  return budget.lines === 0 ? "T-2291" : null;
}
