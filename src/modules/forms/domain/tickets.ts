import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { getEdition } from "@/modules/events";
import { getPeopleByIds } from "@/modules/people";
import { t } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { editionRegistration } from "../schema";

// La entrada propia de un inscrito (ADR-187, regla 8 de ADR-085): cada inscripción a una edición
// lleva un código de un solo dueño. La base guarda solo su hash; el código vive en el enlace
// `/entrada/<código>` que recibe quien se inscribe, y lo lee quien opera la puerta con su sesión.

/** Un código nuevo y su hash: el código sale una sola vez, en la respuesta de la inscripción. */
export function newTicket(): { code: string; hash: string } {
  const code = randomBytes(18).toString("base64url");
  return { code, hash: hashTicket(code) };
}

export function hashTicket(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Lo que el lector trae: el código solo o el enlace entero de la entrada. */
export function ticketCodeFrom(scanned: string): string {
  const value = scanned.trim();
  const match = /\/entrada\/([A-Za-z0-9_-]+)\/?$/.exec(value);
  return match?.[1] ?? value;
}

export interface TicketView {
  editionId: string;
  editionName: string;
  eventName: string;
  startsAt: Date;
  location: string;
  name: string;
  checkedInAt: Date | null;
}

/** La entrada por su código, para la página pública del inscrito. */
export async function getTicket(code: string): Promise<TicketView | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  const [row] = await getDb()
    .select({
      editionId: editionRegistration.editionId,
      personId: editionRegistration.personId,
      checkedInAt: editionRegistration.checkedInAt,
    })
    .from(editionRegistration)
    .where(eq(editionRegistration.ticketHash, hashTicket(code)));
  if (!row) return null;
  const [edition, people] = await Promise.all([
    getEdition(row.editionId),
    getPeopleByIds([row.personId]),
  ]);
  if (!edition) return null;
  const who = people.get(row.personId);
  return {
    editionId: edition.id,
    editionName: edition.name,
    eventName: edition.eventName,
    startsAt: edition.startsAt,
    location: edition.location,
    name: who?.fullName ?? "",
    checkedInAt: row.checkedInAt,
  };
}

/**
 * Quien opera la puerta lee la entrada: la primera vez marca la llegada; la segunda dice a qué hora
 * entró. Una entrada de otra edición no pasa.
 */
export function checkInTicketAs(
  actor: Actor,
  editionId: string,
  scanned: string,
  now = new Date(),
): Promise<{ ok: boolean; message: string }> {
  return runCommand(actor, async (ctx) => {
    const [row] = await ctx.tx
      .select()
      .from(editionRegistration)
      .where(
        and(
          eq(editionRegistration.editionId, editionId),
          eq(editionRegistration.ticketHash, hashTicket(ticketCodeFrom(scanned))),
        ),
      )
      .for("update");
    if (!row || row.status !== "REGISTERED") return { ok: false, message: t("T-5026") };
    const people = await getPeopleByIds([row.personId]);
    const who = people.get(row.personId);
    const name = who?.fullName ?? "";
    if (row.checkedInAt) {
      return {
        ok: false,
        message: t("T-5027", { nombre: name, hora: formatTime(row.checkedInAt) }),
      };
    }
    await ctx.tx
      .update(editionRegistration)
      .set({ checkedInAt: now, checkedInById: ctx.actor.personId })
      .where(eq(editionRegistration.id, row.id));
    await ctx.audit({
      action: "edition-registration.checked-in",
      entityType: "edition_registration",
      entityId: row.id,
      after: { editionId, checkedInAt: now.toISOString() },
    });
    return { ok: true, message: t("T-5028", { nombre: name }) };
  });
}

/** Cuántos inscritos ya entraron, de cuántos. */
export async function ticketCounts(editionId: string): Promise<{ inside: number; total: number }> {
  const [inside, total] = await Promise.all([
    getDb()
      .select({ n: count() })
      .from(editionRegistration)
      .where(
        and(
          eq(editionRegistration.editionId, editionId),
          isNotNull(editionRegistration.checkedInAt),
        ),
      ),
    getDb()
      .select({ n: count() })
      .from(editionRegistration)
      .where(
        and(
          eq(editionRegistration.editionId, editionId),
          eq(editionRegistration.status, "REGISTERED"),
        ),
      ),
  ]);
  return { inside: inside[0]?.n ?? 0, total: total[0]?.n ?? 0 };
}
