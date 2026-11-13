import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  BOARD_SEATS,
  type BoardSeat,
  canParticipate,
  getMembershipRef,
  getPeopleByIds,
  listAppointmentsForTerm,
} from "@/modules/people";
import { workGroup, workGroupMembership } from "../schema";
import { WORK_COMMITTEES } from "./groups";

// La junta del semestre y sus comités de trabajo (ADR-194): los seis cargos de los Estatutos (art. 21),
// en ese orden, con quién los tiene y el comité de trabajo que dirige cada uno (art. 43 par. 1). Es una
// lectura: los cargos se nombran en la Persona 360 y los comités se siembran y se corrigen en Grupos.

export const BOARD_COMMITTEE_STATES = ["OK", "MISSING", "NO_LEADER", "OTHER_LEADER"] as const;
export type BoardCommitteeState = (typeof BOARD_COMMITTEE_STATES)[number];

export interface BoardSeatHolder {
  personId: string;
  name: string;
  /** Con membresía activa u honoraria; si no, está en licencia o salió. */
  operational: boolean;
}

export interface BoardSeatCommittee {
  code: string;
  name: string;
  groupId: string | null;
  leader: { personId: string; name: string } | null;
  members: number;
  state: BoardCommitteeState;
}

export interface BoardSeatRow {
  kind: BoardSeat;
  holders: BoardSeatHolder[];
  committees: BoardSeatCommittee[];
}

export interface BoardComposition {
  seats: BoardSeatRow[];
  /** Cargos vacantes, titulares sin membresía activa y comités que no están al día. */
  issues: number;
}

export async function boardComposition(termId: string): Promise<BoardComposition> {
  const db = getDb();
  const seatKinds: readonly string[] = BOARD_SEATS;
  const appointments = (await listAppointmentsForTerm(termId)).filter((row) =>
    seatKinds.includes(row.kind),
  );
  const catalog = WORK_COMMITTEES.filter(
    (item) => item.leaderKind !== null && seatKinds.includes(item.leaderKind),
  );
  const groups = await db
    .select({ id: workGroup.id, code: workGroup.code, leaderPersonId: workGroup.leaderPersonId })
    .from(workGroup)
    .where(
      and(
        eq(workGroup.termId, termId),
        eq(workGroup.kind, "WORK_COMMITTEE"),
        inArray(
          workGroup.code,
          catalog.map((item) => item.code),
        ),
      ),
    );
  const memberCounts =
    groups.length === 0
      ? []
      : await db
          .select({ groupId: workGroupMembership.groupId, n: count() })
          .from(workGroupMembership)
          .where(
            and(
              inArray(
                workGroupMembership.groupId,
                groups.map((group) => group.id),
              ),
              isNull(workGroupMembership.leftAt),
            ),
          )
          .groupBy(workGroupMembership.groupId);
  const people = await getPeopleByIds([
    ...new Set([
      ...appointments.map((row) => row.personId),
      ...groups.flatMap((group) => (group.leaderPersonId ? [group.leaderPersonId] : [])),
    ]),
  ]);
  const holderIds = [...new Set(appointments.map((row) => row.personId))];
  const operational = new Map(
    await Promise.all(
      holderIds.map(
        async (personId) =>
          [personId, canParticipate((await getMembershipRef(personId))?.status)] as const,
      ),
    ),
  );
  const nameOf = (personId: string) => people.get(personId)?.fullName ?? "";

  const seats = BOARD_SEATS.map((kind): BoardSeatRow => {
    const holders = appointments
      .filter((row) => row.kind === kind)
      .map((row) => ({
        personId: row.personId,
        name: nameOf(row.personId),
        operational: operational.get(row.personId) ?? false,
      }));
    const committees = catalog
      .filter((item) => item.leaderKind === kind)
      .map((item): BoardSeatCommittee => {
        const group = groups.find((row) => row.code === item.code) ?? null;
        const leaderId = group?.leaderPersonId ?? null;
        return {
          code: item.code,
          name: item.name,
          groupId: group?.id ?? null,
          leader: leaderId ? { personId: leaderId, name: nameOf(leaderId) } : null,
          members: memberCounts.find((row) => row.groupId === group?.id)?.n ?? 0,
          state: !group
            ? "MISSING"
            : !leaderId
              ? "NO_LEADER"
              : holders.some((holder) => holder.personId === leaderId)
                ? "OK"
                : "OTHER_LEADER",
        };
      });
    return { kind, holders, committees };
  });
  const issues = seats.reduce(
    (total, seat) =>
      total +
      (seat.holders.length === 0 ? 1 : 0) +
      seat.holders.filter((holder) => !holder.operational).length +
      seat.committees.filter((committee) => committee.state !== "OK").length,
    0,
  );
  return { seats, issues };
}
