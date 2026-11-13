import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { getCurrentTerm } from "@/modules/terms";
import { appointment, membership, person } from "../schema";

// Quién decide por un cargo de la junta (ADR-195 regla 2, que generaliza la ADR-193). Decide quien tiene
// el nombramiento del cargo en el término vigente y la membresía activa u honoraria. Si una vicepresidencia
// no tiene a nadie así (vacante, en licencia o fuera), decide la Presidencia; si falta la Presidencia,
// sus decisiones esperan. Nunca se presta ADMIN: todo sale de los nombramientos del término.

/** Los seis cargos de la junta, en el orden de los Estatutos (art. 21). */
export const BOARD_SEATS = [
  "PRESIDENT",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_PUBLIC_RELATIONS",
  "VP_COMMUNICATIONS",
  "VP_GH",
] as const;
export type BoardSeat = (typeof BOARD_SEATS)[number];

/** Cómo decide: como titular del cargo o como Presidencia que suple a una VP ausente. */
export type SeatAuthority = "HOLDER" | "PRESIDENCY";

const OPERATING = ["ACTIVE", "HONORARY"] as const;

/** Las personas con ese nombramiento en el término y la membresía activa u honoraria. */
async function operatingHolders(
  termId: string,
  seat: BoardSeat,
  exec: Executor,
  personId?: string,
): Promise<string[]> {
  const rows = await exec
    .selectDistinct({ personId: appointment.personId })
    .from(appointment)
    .innerJoin(membership, eq(membership.personId, appointment.personId))
    .innerJoin(person, eq(person.id, appointment.personId))
    .where(
      and(
        personId === undefined ? undefined : eq(appointment.personId, personId),
        eq(appointment.termId, termId),
        eq(appointment.kind, seat),
        inArray(membership.status, [...OPERATING]),
        isNull(person.anonymizedAt),
      ),
    );
  return rows.map((row) => row.personId);
}

/** Cómo decide esa persona por el cargo en el término, o `null` si no le toca. */
export async function seatAuthorityInTerm(
  personId: string,
  seat: BoardSeat,
  termId: string,
  exec: Executor = getDb(),
): Promise<SeatAuthority | null> {
  if ((await operatingHolders(termId, seat, exec, personId)).length > 0) return "HOLDER";
  if (seat === "PRESIDENT") return null;
  if ((await operatingHolders(termId, "PRESIDENT", exec, personId)).length === 0) return null;
  return (await operatingHolders(termId, seat, exec)).length > 0 ? null : "PRESIDENCY";
}

/** Lo mismo en el término vigente. */
export async function currentSeatAuthority(
  personId: string,
  seat: BoardSeat,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<SeatAuthority | null> {
  const current = await getCurrentTerm(now, exec);
  if (!current) return null;
  return seatAuthorityInTerm(personId, seat, current.id, exec);
}

/** Los cargos por los que esa persona decide en el término, en el orden de los Estatutos. */
export async function seatsDecidedBy(
  personId: string,
  termId: string,
  exec: Executor = getDb(),
): Promise<Array<{ seat: BoardSeat; as: SeatAuthority }>> {
  const seats: Array<{ seat: BoardSeat; as: SeatAuthority }> = [];
  for (const seat of BOARD_SEATS) {
    const as = await seatAuthorityInTerm(personId, seat, termId, exec);
    if (as) seats.push({ seat, as });
  }
  return seats;
}

/** Quiénes deciden hoy por el cargo: sus titulares o, si la VP falta, la Presidencia. */
export async function seatDeciders(
  seat: BoardSeat,
  termId: string,
  exec: Executor = getDb(),
): Promise<string[]> {
  const holders = await operatingHolders(termId, seat, exec);
  if (holders.length > 0 || seat === "PRESIDENT") return holders;
  return operatingHolders(termId, "PRESIDENT", exec);
}
