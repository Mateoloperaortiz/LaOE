import { getDb } from "@/db/client";
import { creativeApproval } from "@/modules/comms/schema";
export function seedCreativePiece(input: typeof creativeApproval.$inferInsert) {
  return getDb().insert(creativeApproval).values(input);
}
