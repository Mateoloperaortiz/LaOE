import type { listCreativeApprovals } from "@/modules/comms";
import { APPOINTMENT_KINDS, boardApprovalLabel } from "@/modules/people";
import { tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

export function CreativeDetails({
  piece,
}: {
  piece: Awaited<ReturnType<typeof listCreativeApprovals>>[number];
}) {
  const [, , channel, , file] = tList("T-5178");
  const [, , , author] = tList("T-5085");
  const cargos = tLabels("T-444", APPOINTMENT_KINDS);
  return (
    <div className="grid gap-2 text-sm">
      <p>
        {piece.committeeName} · {channel} · {piece.channel ?? tList("T-5181")[0]}
      </p>
      <p>
        {author} · {piece.requestedByName ?? "—"} · {formatDateTime(piece.requestedAt)}
      </p>
      {piece.caption && <p className="whitespace-pre-wrap break-words">{piece.caption}</p>}
      <a href={`/api/piezas/${piece.id}`} download>
        {file} · {piece.fileName}
      </a>
      {piece.decidedAt && (
        <p>
          {boardApprovalLabel(piece.status)} · {piece.decidedByName ?? "—"} ·{" "}
          {piece.decidedAs === "PRESIDENCY" ? cargos.PRESIDENT : cargos.VP_COMMUNICATIONS} ·{" "}
          {formatDateTime(piece.decidedAt)}
        </p>
      )}
      {piece.decisionNote && <p>{piece.decisionNote}</p>}
      {piece.publishedAt && (
        <p>
          {tList("T-5182")[4]} · {piece.publishedByName ?? "—"} ·{" "}
          {formatDateTime(piece.publishedAt)}
        </p>
      )}
    </div>
  );
}
