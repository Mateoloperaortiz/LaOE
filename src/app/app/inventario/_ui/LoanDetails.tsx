import type { listLoanApprovals } from "@/modules/inventory";
import { APPOINTMENT_KINDS, boardApprovalLabel } from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
export function LoanDetails({
  row,
}: {
  row: Awaited<ReturnType<typeof listLoanApprovals>>[number];
}) {
  const l = tList("T-5189");
  const seats = tLabels("T-444", APPOINTMENT_KINDS);
  const purpose = { COMMITTEE_EVENT: l[2], MACROEVENT: l[3], OTHER: l[4], EXCEPTION: l[5] }[
    row.purpose
  ];
  return (
    <div className="grid gap-2">
      <h3>{row.title}</h3>
      <p>
        {row.scopeLabel} · {row.requesterName} · {purpose} · {boardApprovalLabel(row.status)}
      </p>
      <p>
        {row.eventStartsOn} – {row.eventEndsOn}
      </p>
      <p>
        {l[10]} · {formatDateTime(row.startsAt)}
        <br />
        {tList("T-5194")[0]} ·{" "}
        {formatDateTime(new Date(row.endsAt.getTime() - (row.purpose === "OTHER" ? 0 : 1)))}
      </p>
      <p className="whitespace-pre-wrap">
        {l[12]} · {row.minutes}
      </p>
      {row.supportingRecord && (
        <p>
          {l[13]} · {row.supportingRecord}
        </p>
      )}
      {row.lateReason && (
        <p>
          {l[14]} · {row.lateReason}
        </p>
      )}
      <ul>
        {row.lines.map((line) => (
          <li key={line.itemId}>
            {line.quantity} × {line.name}
          </li>
        ))}
      </ul>
      {row.decidedAt && (
        <p>
          {row.decidedByName} · {row.decidedAs === "PRESIDENCY" ? seats.PRESIDENT : seats.VP_ADMIN}{" "}
          · {formatDateTime(row.decidedAt)} {row.decisionNote}
        </p>
      )}
    </div>
  );
}
