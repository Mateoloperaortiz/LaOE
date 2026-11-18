import type { BudgetSummary } from "@/modules/finance";
import { proposalTitle } from "@/modules/finance";
import { boardApprovalLabel } from "@/modules/people";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";

export function FinancialApprovals({
  budget,
  history,
  action,
  slug,
}: {
  budget: BudgetSummary["budget"];
  history: BudgetSummary["financialApprovals"];
  action: (data: FormData) => Promise<void>;
  slug?: string;
}) {
  const [heading, ask] = tList("T-5159");
  const canRequest =
    budget.kind === "EXTRAORDINARY" &&
    budget.status === "DRAFT" &&
    !budget.vpFinanceApprovedOn &&
    !history.some((r) => r.proposal.kind === "EXTRAORDINARY" && r.status === "PENDING");
  if (!canRequest && !history.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={heading}>
      <h4 className="font-semibold">{heading}</h4>
      {history.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {history.map((row) => (
            <li key={row.id}>
              {proposalTitle(row.proposal)} · {formatDate(row.requestedAt)} ·{" "}
              {boardApprovalLabel(row.status)}
              {row.decisionNote && <p>{row.decisionNote}</p>}
            </li>
          ))}
        </ul>
      )}
      {canRequest && (
        <ActionForm action={action}>
          <AdminFormBody>
            <input type="hidden" name="budgetId" value={budget.id} />
            <input type="hidden" name="committeeId" value={budget.committeeId} />
            {slug && <input type="hidden" name="slug" value={slug} />}
            <AdminSubmitButton type="submit" className="boton-secundario">
              {ask}
            </AdminSubmitButton>
          </AdminFormBody>
        </ActionForm>
      )}
    </section>
  );
}
