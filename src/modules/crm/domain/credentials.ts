import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, runCommand } from "@/db/tx";
import { getPeopleByIds, listCommitteeMembershipsByTerm } from "@/modules/people";
import { listAllTerms } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { trajectoryCredential as credential } from "../schema";
import { listRecognitionsFor } from "./recognitions";

// La trayectoria verificable (ADR-171): lo que la persona hizo en la OE, para mostrarlo afuera. Cada
// elemento se publica a pedido de ella, con un identificador público al azar y la foto de lo que dice;
// la página pública solo muestra esa credencial. El título siempre lo arma la casa, nunca la persona.

export type CredentialKind = "COMMITTEE" | "RECOGNITION";

export interface TrajectoryItem {
  kind: CredentialKind;
  sourceId: string;
  title: string;
  termCode: string;
  credential: { publicId: string; publishedAt: Date } | null;
}

export interface PublicCredential {
  personName: string;
  title: string;
  termCode: string;
  publishedAt: Date;
  revoked: boolean;
}

async function trajectorySources(personId: string): Promise<Omit<TrajectoryItem, "credential">[]> {
  const [byTerm, recognitions, terms] = await Promise.all([
    listCommitteeMembershipsByTerm(personId),
    listRecognitionsFor(personId),
    listAllTerms(),
  ]);
  const termCode = new Map(terms.map((term) => [term.id, term.code]));
  const termOrder = new Map(terms.map((term) => [term.code, term.startsOn]));
  const items = [
    ...byTerm.flatMap((group) =>
      group.items.map((item) => ({
        kind: "COMMITTEE" as const,
        sourceId: item.id,
        title:
          item.roles.length > 0
            ? t("T-4950", {
                cargo: item.roles.map((role) => role.roleLabel).join(" y "),
                comité: item.committeeName,
              })
            : t("T-4949", { comité: item.committeeName }),
        termCode: group.termCode,
      })),
    ),
    ...recognitions.map((item) => ({
      kind: "RECOGNITION" as const,
      sourceId: item.id,
      title: item.award ? `${item.title} · ${item.award}` : item.title,
      termCode: termCode.get(item.termId) ?? "",
    })),
  ];
  return items.sort((a, b) =>
    (termOrder.get(b.termCode) ?? "").localeCompare(termOrder.get(a.termCode) ?? ""),
  );
}

/** La trayectoria de una persona, con lo que ya publicó. */
export async function listTrajectory(personId: string): Promise<TrajectoryItem[]> {
  const [sources, published] = await Promise.all([
    trajectorySources(personId),
    getDb().select().from(credential).where(eq(credential.personId, personId)),
  ]);
  const live = new Map(
    published
      .filter((row) => row.revokedAt === null)
      .map((row) => [`${row.kind}:${row.sourceId}`, row]),
  );
  return sources.map((item) => {
    const row = live.get(`${item.kind}:${item.sourceId}`);
    return {
      ...item,
      credential: row ? { publicId: row.publicId, publishedAt: row.publishedAt } : null,
    };
  });
}

async function publishCredential(
  ctx: CommandContext,
  input: { kind: CredentialKind; sourceId: string },
  now: Date,
): Promise<{ publicId: string }> {
  const personId = ctx.actor.personId;
  if (!personId) throw new DomainError(t("T-032"));
  // Solo lo propio: el elemento tiene que salir de la trayectoria de quien publica.
  const item = (await trajectorySources(personId)).find(
    (entry) => entry.kind === input.kind && entry.sourceId === input.sourceId,
  );
  if (!item) throw new DomainError(t("T-032"));
  const [existing] = await ctx.tx
    .select()
    .from(credential)
    .where(
      and(
        eq(credential.personId, personId),
        eq(credential.kind, input.kind),
        eq(credential.sourceId, input.sourceId),
      ),
    )
    .for("update");
  const publicId = existing?.publicId ?? randomBytes(16).toString("base64url");
  if (existing) {
    await ctx.tx
      .update(credential)
      .set({ title: item.title, termCode: item.termCode, publishedAt: now, revokedAt: null })
      .where(eq(credential.id, existing.id));
  } else {
    await ctx.tx.insert(credential).values({
      publicId,
      personId,
      kind: input.kind,
      sourceId: input.sourceId,
      title: item.title,
      termCode: item.termCode,
      publishedAt: now,
    });
  }
  await ctx.audit({
    action: "credential.published",
    entityType: "credential",
    entityId: publicId,
    after: { kind: input.kind, title: item.title, termCode: item.termCode },
  });
  return { publicId };
}

/** Publicar un elemento propio de la trayectoria (ADR-171 regla 2). */
export function publishCredentialAs(
  actor: Actor,
  input: { kind: CredentialKind; sourceId: string },
  now = new Date(),
): Promise<{ publicId: string }> {
  return runCommand(actor, (ctx) => publishCredential(ctx, input, now));
}

/** Dejar de publicar una credencial propia: su página dice que ya no está publicada. */
export function revokeCredentialAs(
  actor: Actor,
  publicId: string,
  now = new Date(),
): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const personId = ctx.actor.personId;
    if (!personId) throw new DomainError(t("T-032"));
    const [row] = await ctx.tx
      .update(credential)
      .set({ revokedAt: now })
      .where(and(eq(credential.publicId, publicId), eq(credential.personId, personId)))
      .returning({ id: credential.id });
    if (!row) throw new DomainError(t("T-032"));
    await ctx.audit({
      action: "credential.revoked",
      entityType: "credential",
      entityId: publicId,
    });
  });
}

/** Lo que muestra la página pública de una credencial, o `null` si no existe. */
export async function getPublicCredential(publicId: string): Promise<PublicCredential | null> {
  const [row] = await getDb()
    .select()
    .from(credential)
    .where(eq(credential.publicId, publicId))
    .limit(1);
  if (!row) return null;
  const people = await getPeopleByIds([row.personId]);
  return {
    personName: people.get(row.personId)?.fullName?.trim() ?? "",
    title: row.title,
    termCode: row.termCode,
    publishedAt: row.publishedAt,
    revoked: row.revokedAt !== null,
  };
}

/** Al anonimizar a la persona se borran sus credenciales (ADR-171 regla 5). */
export async function deleteCredentialsFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(credential)
    .where(eq(credential.personId, personId))
    .returning({ id: credential.id });
  return rows.length;
}
