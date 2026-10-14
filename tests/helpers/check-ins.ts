import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { decideCheckInAs } from "@/modules/participation";
import { checkIn } from "@/modules/participation/schema";

type Decide = Parameters<typeof decideCheckInAs>;

/**
 * Decide una asistencia desde la consola de su propia ocasión, que es lo que manda la página
 * (ADR-122 regla 1). Es para las pruebas que no tratan del alcance: la que manda otra ocasión llama
 * a `decideCheckInAs` con ella (participation-checkin-occasion-scope.test.ts).
 */
export async function decideInOwnOccasion(
  actor: Decide[0],
  input: Omit<Decide[1], "occasionId">,
): Promise<void> {
  const [row] = await getDb()
    .select({ occasionId: checkIn.occasionId })
    .from(checkIn)
    .where(eq(checkIn.id, input.checkInId));
  return decideCheckInAs(actor, { ...input, occasionId: row?.occasionId ?? "" });
}
