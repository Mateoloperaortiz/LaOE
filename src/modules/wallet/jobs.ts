import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { type JobContext, registerHandler } from "@/jobs/registry";
import { refreshGooglePass } from "./domain/google";
import { walletPass } from "./schema";

const personEvent = z.object({ personId: z.string().min(1) });

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
    await enqueueEvent(tx, {
      type: "wallet.sync",
      payload: { personId },
      dedupeKey: `wallet-sync:${context.id}:${personId}`,
    });
  });
}

for (const event of [
  "carnet-token.rotated",
  "committee-membership.changed",
  "membership.changed",
]) {
  registerHandler(event, async (payload, context) => {
    await queueSync(personEvent.parse(payload).personId, context);
  });
}

registerHandler("person.updated", async (payload, context) => {
  const event = personEvent.extend({ fields: z.array(z.string()) }).parse(payload);
  if (event.fields.some((field) => ["firstName", "lastName", "preferredName"].includes(field))) {
    await queueSync(event.personId, context);
  }
});

registerHandler("person.anonymized", async (payload, context) => {
  await queueSync(personEvent.parse(payload).personId, context, true);
});

registerHandler("wallet.sync", async (payload) => {
  await refreshGooglePass(personEvent.parse(payload).personId);
});

// Cada página encola hasta cien trabajos pequeños; el poller conserva su backoff habitual.
registerHandler("wallet.reconcile", async (payload, context) => {
  const event = z.object({ cursor: z.string().optional() }).parse(payload);
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
      await enqueueEvent(tx, {
        type: "wallet.sync",
        payload: { personId: row.personId },
        dedupeKey: `wallet-sync:${context.id}:${row.personId}`,
      });
    }
    if (rows.length === 100) {
      await enqueueEvent(tx, {
        type: "wallet.reconcile",
        payload: { cursor: rows[99]?.id },
        dedupeKey: `wallet-page:${context.id}`,
      });
    }
  });
});
