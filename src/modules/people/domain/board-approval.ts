import { z } from "zod";
import { boardApprovalStatus } from "@/db/enums";
import type { CommandContext } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { t, tLabels } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { APPOINTMENT_KINDS } from "./appointment-kinds";
import { type BoardSeat, currentSeatAuthority } from "./board-seats";

export const approvalDecision = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).default(""),
});
export type BoardDecision = z.input<typeof approvalDecision>;

export function readBoardDecision(raw: BoardDecision) {
  const input = approvalDecision.parse(raw);
  if (input.decision === "REJECTED" && input.note.length < 2)
    throw new DomainError(t("T-5087"), "note");
  return input;
}

const BOARD_APPROVAL_STATUSES = boardApprovalStatus.enumValues;
export function boardApprovalLabel(status: (typeof BOARD_APPROVAL_STATUSES)[number]) {
  return tLabels("T-5157", BOARD_APPROVAL_STATUSES)[status];
}

export async function requireApprovalAuthority(ctx: CommandContext, seat: BoardSeat, now: Date) {
  const authority =
    ctx.actor.personId && (await currentSeatAuthority(ctx.actor.personId, seat, ctx.tx, now));
  if (!authority)
    throw new DomainError(t("T-5088", { cargo: tLabels("T-444", APPOINTMENT_KINDS)[seat] }));
  return authority;
}

export async function notifyApproval(
  ctx: CommandContext,
  personIds: readonly string[],
  notice: { title: string; body: string; url: string; dedupeKey: string },
) {
  if (personIds.length === 0) return;
  await ctx.emit(
    eventOf(notificationRequested, {
      kind: "TRANSACTIONAL",
      recipients: personIds.map((personId) => ({ personId })),
      ...notice,
    }),
  );
}
