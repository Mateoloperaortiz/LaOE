import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { membership, person } from "../schema";
import { type SignInAccess, signInAccess } from "./access-pure";

// Lecturas explícitas que otros módulos pueden usar (ADR-001).

export type MembershipStatus = (typeof membership.$inferSelect)["status"];

/**
 * Los estados con ingreso de miembro: la licencia conserva la consulta de Mi OE y la autogestión de
 * datos propios. Un egresado también entra (ADR-184), pero no por su estado sino por su salida:
 * `signInAccess` decide con las dos cosas.
 */
export const SIGN_IN_STATUSES: readonly MembershipStatus[] = ["ACTIVE", "ON_LEAVE", "HONORARY"];

export interface MemberSummary {
  personId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  membershipStatus: MembershipStatus;
  /** Las sesiones creadas antes de esta marca no valen (ADR-034). */
  sessionsRevokedAt: Date | null;
  /** Con qué entra (ADR-184): miembro, egresado o `null` si no entra. */
  access: SignInAccess | null;
  canSignIn: boolean;
}

const summaryColumns = {
  personId: person.id,
  email: person.email,
  firstName: person.firstName,
  lastName: person.lastName,
  preferredName: person.preferredName,
  membershipStatus: membership.status,
  sessionsRevokedAt: person.sessionsRevokedAt,
  endReason: membership.endReason,
  anonymizedAt: person.anonymizedAt,
};

type SummaryRow = Omit<MemberSummary, "canSignIn" | "access"> & {
  endReason: string | null;
  anonymizedAt: Date | null;
};

function withSignIn({ endReason, anonymizedAt, ...row }: SummaryRow): MemberSummary {
  const access = signInAccess({ status: row.membershipStatus, endReason, anonymizedAt });
  return { ...row, access, canSignIn: access !== null };
}

/** Persona del roster que puede entrar, por su correo institucional en minúsculas. */
export async function findEligibleMemberByEmail(email: string): Promise<MemberSummary | null> {
  const [row] = await getDb()
    .select(summaryColumns)
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(person.email, email),
        or(
          inArray(membership.status, [...SIGN_IN_STATUSES]),
          and(
            eq(membership.status, "INACTIVE"),
            eq(membership.endReason, "GRADUATION"),
            isNull(person.anonymizedAt),
          ),
        ),
      ),
    )
    .limit(1);
  return row ? withSignIn(row) : null;
}

export async function getMemberSummary(personId: string): Promise<MemberSummary | null> {
  const [row] = await getDb()
    .select(summaryColumns)
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId))
    .limit(1);
  return row ? withSignIn(row) : null;
}
