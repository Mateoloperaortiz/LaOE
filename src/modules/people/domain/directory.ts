import { and, asc, count, eq, exists, ilike, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getCurrentTerm, type TermRow } from "@/modules/terms";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRole,
  membership,
  person,
} from "../schema";
import type { AppointmentKind } from "./appointments";
import type { RoleView } from "./committee-direction-pure";
import { rolesOf } from "./committee-memberships";
import { listLiveRolesByMembership } from "./committee-role-assignments";
import { liveConsentExists } from "./consents";
import type { MembershipStatus } from "./reads";

// Directorio y comités internos de Mi OE (06-mapa-del-sitio.md): nombre, foto con consentimiento,
// comités del término con el cargo y cargos de junta. Nunca correos ni celulares.

const DIRECTORY_STATUSES: MembershipStatus[] = ["ACTIVE", "ON_LEAVE", "HONORARY"];

export interface DirectoryCommittee {
  committeeId: string;
  slug: string;
  name: string;
  logoKey: string | null;
  /** Cargo principal derivado; `roles` trae todos los vivos con codirección (ADR-058). */
  roleCode: string;
  roleLabel: string;
  isLeadership: boolean;
  roles: RoleView[];
}

export interface DirectoryEntry {
  personId: string;
  fullName: string;
  preferredName: string | null;
  photoAssetId: string | null;
  status: MembershipStatus;
  committees: DirectoryCommittee[];
  appointments: Array<{ kind: AppointmentKind; title: string | null }>;
}

export interface DirectoryParams {
  q: string;
  committeeId: string | null;
  page: number;
  pageSize: number;
}

export interface DirectoryPage {
  rows: DirectoryEntry[];
  total: number;
  term: TermRow | null;
}

const baseColumns = {
  personId: person.id,
  fullName: person.fullName,
  preferredName: person.preferredName,
  photoAssetId: person.photoAssetId,
  status: membership.status,
};

type BaseRow = {
  personId: string;
  fullName: string | null;
  preferredName: string | null;
  photoAssetId: string | null;
  status: MembershipStatus;
  photoAllowed: boolean;
};

async function decorate(rows: BaseRow[], term: TermRow | null): Promise<DirectoryEntry[]> {
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.personId);
  const [committees, appointments] = await Promise.all([
    term
      ? getDb()
          .select({
            membershipId: committeeMembership.id,
            personId: committeeMembership.personId,
            committeeId: committee.id,
            slug: committee.slug,
            name: committee.name,
            logoKey: committee.logoKey,
            roleCode: committeeMembership.roleCode,
            roleLabel: committeeRole.label,
            isLeadership: committeeRole.isLeadership,
          })
          .from(committeeMembership)
          .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
          .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
          .where(
            and(
              inArray(committeeMembership.personId, ids),
              eq(committeeMembership.termId, term.id),
              isNull(committeeMembership.leftAt),
            ),
          )
          .orderBy(asc(committee.name))
      : Promise.resolve([]),
    term
      ? getDb()
          .select({
            personId: appointment.personId,
            kind: appointment.kind,
            title: appointment.title,
          })
          .from(appointment)
          .where(and(inArray(appointment.personId, ids), eq(appointment.termId, term.id)))
      : Promise.resolve([]),
  ]);
  const roles = await listLiveRolesByMembership(
    getDb(),
    committees.map((item) => item.membershipId),
  );
  return rows.map((row) => ({
    personId: row.personId,
    fullName: row.fullName?.trim() ?? "",
    preferredName: row.preferredName,
    photoAssetId: row.photoAllowed ? row.photoAssetId : null,
    status: row.status,
    committees: committees
      .filter((item) => item.personId === row.personId)
      .map(({ personId: _personId, membershipId, ...item }) => ({
        ...item,
        roles: rolesOf(roles, membershipId),
      })),
    appointments: appointments
      .filter((item) => item.personId === row.personId)
      .map((item) => ({ kind: item.kind, title: item.title })),
  }));
}

/** Miembros con membresía viva (activos, en licencia y honorarios), por nombre, con filtro por comité. */
export async function listDirectory(params: DirectoryParams): Promise<DirectoryPage> {
  const db = getDb();
  const term = await getCurrentTerm();
  const conditions = [
    inArray(membership.status, DIRECTORY_STATUSES),
    eq(person.stage, "MEMBER"),
    isNull(person.anonymizedAt),
  ];
  const q = params.q.trim();
  if (q) {
    conditions.push(ilike(person.fullName, `%${q}%`));
  }
  if (params.committeeId && term) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(committeeMembership)
          .where(
            and(
              eq(committeeMembership.personId, person.id),
              eq(committeeMembership.committeeId, params.committeeId),
              eq(committeeMembership.termId, term.id),
              isNull(committeeMembership.leftAt),
            ),
          ),
      ),
    );
  }
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select({ ...baseColumns, photoAllowed: liveConsentExists("DIRECTORY_PHOTO") })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .where(where)
      .orderBy(asc(person.fullName))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db
      .select({ n: count() })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .where(where),
  ]);
  return { rows: await decorate(rows, term), total: totals[0]?.n ?? 0, term };
}

export interface InternalCommittee {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  presentation: string | null;
  contactUrl: string | null;
  memberCount: number;
}

/** Todos los comités activos, publicados o no, con cuántas personas tienen este término. */
export async function listInternalCommittees(): Promise<InternalCommittee[]> {
  const db = getDb();
  const term = await getCurrentTerm();
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: committee.id,
        slug: committee.slug,
        name: committee.name,
        logoKey: committee.logoKey,
        presentation: committee.presentation,
        contactUrl: committee.contactUrl,
      })
      .from(committee)
      .where(eq(committee.status, "ACTIVE"))
      .orderBy(asc(committee.name)),
    term
      ? db
          .select({ committeeId: committeeMembership.committeeId, n: count() })
          .from(committeeMembership)
          .where(and(eq(committeeMembership.termId, term.id), isNull(committeeMembership.leftAt)))
          .groupBy(committeeMembership.committeeId)
      : Promise.resolve([]),
  ]);
  const countById = new Map(counts.map((row) => [row.committeeId, row.n]));
  return rows.map((row) => ({ ...row, memberCount: countById.get(row.id) ?? 0 }));
}

export interface RosterMember {
  personId: string;
  fullName: string;
  preferredName: string | null;
  photoAssetId: string | null;
  status: MembershipStatus;
  /** Cargo principal derivado; `roles` trae todos los vivos con codirección (ADR-058). */
  roleCode: string;
  roleLabel: string;
  isLeadership: boolean;
  roles: RoleView[];
}

export interface InternalRoster {
  committee: InternalCommittee;
  term: TermRow | null;
  members: RosterMember[];
}

/** El comité con quienes están este término: la dirección primero, luego por nombre. */
export async function listInternalRoster(slug: string): Promise<InternalRoster | null> {
  const db = getDb();
  const [found] = await db
    .select({
      id: committee.id,
      slug: committee.slug,
      name: committee.name,
      logoKey: committee.logoKey,
      presentation: committee.presentation,
      contactUrl: committee.contactUrl,
    })
    .from(committee)
    .where(and(eq(committee.slug, slug), eq(committee.status, "ACTIVE")))
    .limit(1);
  if (!found) {
    return null;
  }
  const term = await getCurrentTerm();
  if (!term) {
    return { committee: { ...found, memberCount: 0 }, term: null, members: [] };
  }
  const rows = await db
    .select({
      ...baseColumns,
      membershipId: committeeMembership.id,
      photoAllowed: liveConsentExists("DIRECTORY_PHOTO"),
      roleCode: committeeMembership.roleCode,
      roleLabel: committeeRole.label,
      isLeadership: committeeRole.isLeadership,
    })
    .from(committeeMembership)
    .innerJoin(person, eq(person.id, committeeMembership.personId))
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
    .where(
      and(
        eq(committeeMembership.committeeId, found.id),
        eq(committeeMembership.termId, term.id),
        isNull(committeeMembership.leftAt),
        isNull(person.anonymizedAt),
        inArray(membership.status, DIRECTORY_STATUSES),
      ),
    )
    .orderBy(asc(person.fullName));
  const roles = await listLiveRolesByMembership(
    db,
    rows.map((row) => row.membershipId),
  );
  const members: RosterMember[] = rows
    .map((row) => ({
      personId: row.personId,
      fullName: row.fullName?.trim() ?? "",
      preferredName: row.preferredName,
      photoAssetId: row.photoAllowed ? row.photoAssetId : null,
      status: row.status,
      roleCode: row.roleCode,
      roleLabel: row.roleLabel,
      isLeadership: row.isLeadership,
      roles: rolesOf(roles, row.membershipId),
    }))
    .sort((a, b) => Number(b.isLeadership) - Number(a.isLeadership));
  return { committee: { ...found, memberCount: members.length }, term, members };
}
