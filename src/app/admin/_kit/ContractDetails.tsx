import { CONTRACT_FILE_SLOTS, contractStatusLabel, type listContracts } from "@/modules/finance";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { formatExactMoney } from "@/shared/lib/money";

export function ContractDetails({
  row,
}: {
  row: Awaited<ReturnType<typeof listContracts>>[number];
}) {
  const labels = tLabels("T-5172", CONTRACT_FILE_SLOTS);
  const [, , supplier, amount] = tList("T-5171");
  return (
    <div className="grid gap-2 text-sm">
      <p>
        {supplier} · {row.supplier} · {amount} · {formatExactMoney(row.amount)}
      </p>
      <p>
        {row.committeeName} · {row.requestedByName ?? "—"} · {formatDateTime(row.requestedAt)}
      </p>
      <ul className="grid gap-1">
        {CONTRACT_FILE_SLOTS.map((slot) => (
          <li key={slot}>
            <a href={`/api/contratos/${row.id}/${slot}`} download>
              {labels[slot]} · {row.files[slot].name}
            </a>
          </li>
        ))}
      </ul>
      {row.decidedSeat && row.decidedAt && (
        <p>
          {contractStatusLabel(row.status)} · {row.decidedByName ?? "—"} ·{" "}
          {tLabels("T-444", APPOINTMENT_KINDS)[row.decidedSeat]} · {formatDateTime(row.decidedAt)}
        </p>
      )}
      {row.decisionNote && <p>{row.decisionNote}</p>}
    </div>
  );
}
