import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { committeeMembership, person } from "../schema";

// La capa social (ADR-175): la actividad de una persona se ve en la comunidad solo si ella lo prendió.
// Este módulo guarda la preferencia y responde quién la tiene prendida y quién es del comité.

/** Si la persona tiene prendida su actividad en la comunidad. */
export async function getSocialVisible(personId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ visible: person.socialVisible })
    .from(person)
    .where(eq(person.id, personId));
  return row?.visible ?? false;
}

/** De estas personas, las que tienen prendida su actividad (y no están anonimizadas). */
export async function socialVisibleIds(personIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return new Set();
  const rows = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(
      and(inArray(person.id, ids), eq(person.socialVisible, true), isNull(person.anonymizedAt)),
    );
  return new Set(rows.map((row) => row.id));
}

/** Prender o apagar la actividad propia; apagarla la esconde desde ya, también lo que ya salió. */
export function setSocialVisibleAs(actor: Actor, visible: boolean): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const personId = ctx.actor.personId;
    if (!personId) return;
    await ctx.tx.update(person).set({ socialVisible: visible }).where(eq(person.id, personId));
    await ctx.audit({
      action: "person.social-visibility",
      entityType: "person",
      entityId: personId,
      after: { socialVisible: visible },
    });
  });
}

/** De estas personas, las que están hoy en el comité en ese semestre (pertenencia sin salida). */
export async function committeeMembersAmong(
  committeeId: string,
  termId: string,
  personIds: string[],
): Promise<Set<string>> {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return new Set();
  const rows = await getDb()
    .select({ id: committeeMembership.personId })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.committeeId, committeeId),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
        inArray(committeeMembership.personId, ids),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/** Las personas del comité en el semestre, con su nombre, para elegir a quién aplaudir. */
export async function listCommitteeMates(
  committeeId: string,
  termId: string,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await getDb()
    .select({ id: person.id, name: person.fullName })
    .from(committeeMembership)
    .innerJoin(person, eq(person.id, committeeMembership.personId))
    .where(
      and(
        eq(committeeMembership.committeeId, committeeId),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
        isNull(person.anonymizedAt),
      ),
    );
  return rows
    .map((row) => ({ id: row.id, name: row.name?.trim() ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
