import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { listAllTerms } from "@/modules/terms";
import { dateKeyIn } from "@/shared/lib/dates";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRole,
  membership,
  person,
} from "../schema";
import type { AppointmentKind } from "./appointments";
import { liveConsentExists } from "./consents";

// Galería de egresados (ADR-030): quienes salieron, con consentimiento MEMORIAL vivo y sin anonimizar,
// agrupados por el año de salida; la foto solo con consentimiento de directorio.

export interface AlumniEntry {
  personId: string;
  fullName: string;
  photoAssetId: string | null;
  /** "A3 · General", sin repetir comités. */
  committees: string[];
  appointments: Array<{ kind: AppointmentKind; title: string | null; termCode: string }>;
  fromTermCode: string | null;
  toTermCode: string | null;
}

export interface AlumniYear {
  year: number;
  entries: AlumniEntry[];
}

export async function listAlumniByYear(): Promise<AlumniYear[]> {
  const db = getDb();
  const timeZone = getEnv().APP_TIMEZONE;
  const [people, terms] = await Promise.all([
    db
      .select({
        id: person.id,
        fullName: person.fullName,
        photoAssetId: person.photoAssetId,
        endedAt: membership.endedAt,
        firstTermId: membership.firstTermId,
        lastTermId: membership.lastTermId,
        photoAllowed: liveConsentExists("DIRECTORY_PHOTO"),
      })
      .from(person)
      .innerJoin(membership, eq(membership.personId, person.id))
      .where(
        and(eq(person.stage, "ALUMNI"), isNull(person.anonymizedAt), liveConsentExists("MEMORIAL")),
      )
      .orderBy(asc(person.fullName)),
    listAllTerms(),
  ]);
  if (people.length === 0) {
    return [];
  }
  const ids = people.map((row) => row.id);
  const [committees, appointments] = await Promise.all([
    db
      .select({
        personId: committeeMembership.personId,
        name: committee.name,
        role: committeeRole.label,
        isLeadership: committeeRole.isLeadership,
      })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
      .where(inArray(committeeMembership.personId, ids))
      .orderBy(asc(committee.name)),
    db
      .select({
        personId: appointment.personId,
        kind: appointment.kind,
        title: appointment.title,
        termId: appointment.termId,
      })
      .from(appointment)
      .where(inArray(appointment.personId, ids)),
  ]);
  const termById = new Map(terms.map((term) => [term.id, term]));
  const years = new Map<number, AlumniEntry[]>();
  for (const row of people) {
    const lastTerm = row.lastTermId ? termById.get(row.lastTermId) : undefined;
    const year = row.endedAt
      ? Number.parseInt(dateKeyIn(timeZone, row.endedAt).slice(0, 4), 10)
      : lastTerm
        ? Number.parseInt(lastTerm.code.slice(0, 4), 10)
        : new Date().getUTCFullYear();
    const seen = new Map<string, string>();
    for (const item of committees.filter((c) => c.personId === row.id)) {
      // Se conserva el cargo más alto que tuvo en ese comité.
      const current = seen.get(item.name);
      if (!current || (item.isLeadership && !current.includes(item.role))) {
        seen.set(item.name, `${item.name} · ${item.role}`);
      }
    }
    const entry: AlumniEntry = {
      personId: row.id,
      fullName: row.fullName?.trim() ?? "",
      photoAssetId: row.photoAllowed ? row.photoAssetId : null,
      committees: [...seen.values()],
      appointments: appointments
        .filter((a) => a.personId === row.id)
        .map((a) => ({
          kind: a.kind,
          title: a.title,
          termCode: termById.get(a.termId)?.code ?? "",
        })),
      fromTermCode: termById.get(row.firstTermId)?.code ?? null,
      toTermCode: lastTerm?.code ?? null,
    };
    years.set(year, [...(years.get(year) ?? []), entry]);
  }
  return [...years.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({ year, entries }));
}
