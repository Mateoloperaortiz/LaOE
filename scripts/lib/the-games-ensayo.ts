import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { getCompetitionBySlug } from "@/modules/competition";
import { createEdition } from "@/modules/events";
import { event, eventEdition } from "@/modules/events/schema";
import { permission } from "@/modules/identity/schema";
import { membership, person } from "@/modules/people/schema";
import { buildTheGamesRehearsal } from "./seed-the-games";

// Ensayo de The Games en un entorno con datos reales (ADR-089 regla 2): la competencia de ensayo se
// opera igual que la real y se archiva después. Si falta, crea la edición 2026 de Días EAFIT en
// borrador, con las fechas que confirmó la OE (del lunes 28 de septiembre a las 8:00 al viernes 2 de
// octubre a las 20:00). Los equipos y las bases son de ensayo, sin personas sintéticas: el ADMIN que
// lo corre queda como juez de la base 1 del jueves. Idempotente por slug.

export class RehearsalError extends Error {}

export interface RehearsalResult {
  competitionId: string;
  editionCreated: boolean;
  created: boolean;
  codes: string[];
}

export async function prepareTheGamesRehearsal(input: {
  adminEmail: string;
  slug: string;
  rotationsPerDay?: number;
}): Promise<RehearsalResult> {
  const db = getDb();
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(permission, eq(permission.personId, person.id))
    .where(
      and(
        eq(person.email, input.adminEmail.trim().toLowerCase()),
        inArray(membership.status, ["ACTIVE", "HONORARY"]),
        eq(permission.code, "ADMIN"),
      ),
    )
    .limit(1);
  if (!admin) throw new RehearsalError("El --admin tiene que ser un ADMIN con membresía activa");
  const actor = { personId: admin.id, isAdmin: true, ip: null };

  const existing = await getCompetitionBySlug(input.slug);
  if (existing) {
    return { competitionId: existing.id, editionCreated: false, created: false, codes: [] };
  }

  const [dias] = await db.select().from(event).where(eq(event.slug, "dias-eafit")).limit(1);
  if (!dias) throw new RehearsalError("Falta el evento dias-eafit");
  let editionCreated = false;
  let [edition] = await db
    .select({ id: eventEdition.id })
    .from(eventEdition)
    .where(and(eq(eventEdition.eventId, dias.id), eq(eventEdition.slug, "2026")))
    .limit(1);
  if (!edition) {
    edition = await runCommand(actor, (ctx) =>
      createEdition(ctx, {
        eventId: dias.id,
        slug: "2026",
        name: "2026",
        description: "",
        // 8:00 del lunes y 20:00 del viernes en Bogotá (UTC−5).
        startsAt: new Date("2026-09-28T13:00:00Z"),
        endsAt: new Date("2026-10-03T01:00:00Z"),
        location: "Universidad EAFIT",
        publicationStatus: "DRAFT",
        committeeIds: [],
      }),
    );
    editionCreated = true;
  }

  const { id, codes } = await buildTheGamesRehearsal({
    editionId: edition.id,
    actor,
    slug: input.slug,
    name: "Ensayo de The Games",
    rotationsPerDay: input.rotationsPerDay ?? 15,
    judgeIds: [admin.id],
  });
  return { competitionId: id, editionCreated, created: true, codes };
}
