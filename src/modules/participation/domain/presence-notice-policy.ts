import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import { listEntityAuditFacts } from "@/modules/system";
import { listAllTerms, lockOpenTermPoints } from "@/modules/terms";
import { occasion, presenceNoticePolicy } from "../schema";
import { lockParticipationBatch } from "./batch-lock";
import { verifiedNoticePublication } from "./notice-publication-pure";

const POLICY_ID = "NOTICE_24H";

/** Configuración propia, leída por la misma transacción: AppConfig no puede mover esta frontera. */
export async function presenceNoticeEffectiveAt(exec: Executor): Promise<Date | null> {
  const [policy] = await exec
    .select()
    .from(presenceNoticePolicy)
    .where(eq(presenceNoticePolicy.id, POLICY_ID));
  if (!policy) throw new Error("Falta la configuración del aviso presencial de 24 horas");
  return policy.effectiveAt;
}

export interface PresenceNoticeActivation {
  effectiveAt: string;
  activated: boolean;
  normalized: number;
  unknown: number;
}

/**
 * Operación explícita posterior al despliegue y retiro del escritor viejo (ADR-132). Una sola
 * transacción fija la vigencia y demuestra la publicación de las ocasiones futuras; nunca toca
 * pasadas, cierres, asistencias ni ledger. Repetirla no mueve el ancla ni normaliza otra vez.
 */
export async function activatePresenceNotice24hAs(actor: Actor): Promise<PresenceNoticeActivation> {
  return runCommand(actor, async (ctx) => {
    await lockParticipationBatch(ctx.tx);
    const previous = await presenceNoticeEffectiveAt(ctx.tx);
    if (previous) {
      return { effectiveAt: previous.toISOString(), activated: false, normalized: 0, unknown: 0 };
    }
    const open = (await listAllTerms(ctx.tx))
      .filter((row) => row.pointsClosedAt === null)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const term of open) await lockOpenTermPoints(ctx.tx, term.id, "exclusive");
    // El límite provisional evita bloquear historia. La vigencia real se toma después de las filas:
    // una actividad que empieza mientras esperamos no adquiere una obligación retroactiva.
    const candidates = open.length
      ? await ctx.tx
          .select({ id: occasion.id, startsAt: occasion.startsAt, openedAt: occasion.openedAt })
          .from(occasion)
          .where(
            and(
              inArray(
                occasion.termId,
                open.map((row) => row.id),
              ),
              gte(occasion.startsAt, new Date()),
              inArray(occasion.status, ["OPEN", "CLOSED"]),
            ),
          )
          .orderBy(asc(occasion.id))
          .for("update")
      : [];
    const effectiveAt = new Date();
    const future = candidates.filter((row) => row.startsAt >= effectiveAt);
    let normalized = 0;
    let unknown = 0;
    for (const row of future) {
      const facts = await listEntityAuditFacts(
        "occasion",
        row.id,
        ["occasion.opened", "occasion.created"],
        ctx.tx,
      );
      const publication = verifiedNoticePublication(row.openedAt, facts);
      if (publication) normalized += 1;
      else unknown += 1;
      await ctx.tx
        .update(occasion)
        .set({ openedAt: publication?.at ?? null })
        .where(eq(occasion.id, row.id));
      await ctx.audit({
        action: "presence-notice.publication-normalized",
        entityType: "occasion",
        entityId: row.id,
        before: { openedAt: row.openedAt?.toISOString() ?? null },
        after: {
          openedAt: publication?.at.toISOString() ?? null,
          evidenceAt: publication?.evidenceAt.toISOString() ?? null,
          evidenceAction: publication?.action ?? null,
        },
      });
    }
    await ctx.tx
      .update(presenceNoticePolicy)
      .set({ effectiveAt })
      .where(eq(presenceNoticePolicy.id, POLICY_ID));
    await ctx.audit({
      action: "presence-notice.activated",
      entityType: "presence_notice_policy",
      entityId: POLICY_ID,
      before: { effectiveAt: null },
      after: { effectiveAt: effectiveAt.toISOString(), normalized, unknown },
    });
    return { effectiveAt: effectiveAt.toISOString(), activated: true, normalized, unknown };
  });
}
