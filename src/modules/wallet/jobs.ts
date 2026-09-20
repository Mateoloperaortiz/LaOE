import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { carnetTokenRotated } from "@/domain-events/identity";
import {
  committeeMembershipChanged,
  membershipChanged,
  personAnonymized,
  personUpdated,
} from "@/domain-events/people";
import { walletReconcile, walletSync } from "@/domain-events/wallet";
import { type JobContext, onEvent, onEvents } from "@/jobs/registry";
import { refreshGooglePass } from "./domain/google";
import { walletPass } from "./schema";

async function queueSync(personId: string, context: JobContext, scrubApple = false): Promise<void> {
  await getDb().transaction(async (tx) => {
    if (scrubApple) {
      await tx
        .delete(walletPass)
        .where(and(eq(walletPass.personId, personId), eq(walletPass.platform, "APPLE")));
    }
    const [pass] = await tx
      .select({ id: walletPass.id })
      .from(walletPass)
      .where(and(eq(walletPass.personId, personId), eq(walletPass.platform, "GOOGLE")))
      .limit(1);
    if (!pass) return;
    await enqueueEvent(
      tx,
      eventOf(walletSync, { personId }, { dedupeKey: `wallet-sync:${context.id}:${personId}` }),
    );
  });
}

onEvents([committeeMembershipChanged, membershipChanged], async ({ personId }, context) => {
  await queueSync(personId, context);
});

onEvent(carnetTokenRotated, async ({ personId }, context) => {
  await queueSync(personId, context);
});

onEvent(personUpdated, async ({ personId, fields }, context) => {
  if (fields.some((field) => ["firstName", "lastName", "preferredName"].includes(field))) {
    await queueSync(personId, context);
  }
});

onEvent(personAnonymized, async ({ personId }, context) => {
  await queueSync(personId, context, true);
});

onEvent(walletSync, async ({ personId }) => {
  await refreshGooglePass(personId);
});

// Cada página encola hasta cien trabajos pequeños; el poller conserva su backoff habitual.
// También es el programado de las 00:05, que llega sin cursor.
onEvent(walletReconcile, async (event, context) => {
  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ id: walletPass.id, personId: walletPass.personId })
      .from(walletPass)
      .where(
        and(
          eq(walletPass.platform, "GOOGLE"),
          ...(event.cursor ? [gt(walletPass.id, event.cursor)] : []),
        ),
      )
      .orderBy(asc(walletPass.id))
      .limit(100);
    for (const row of rows) {
      await enqueueEvent(
        tx,
        eventOf(
          walletSync,
          { personId: row.personId },
          { dedupeKey: `wallet-sync:${context.id}:${row.personId}` },
        ),
      );
    }
    if (rows.length === 100) {
      await enqueueEvent(
        tx,
        eventOf(
          walletReconcile,
          { cursor: rows[99]?.id },
          { dedupeKey: `wallet-page:${context.id}` },
        ),
      );
    }
  });
});
