import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { appointmentChanged } from "@/domain-events/people";
import { getMacroeventEdition, listEditionRefs, macroeventRoleCodes } from "@/modules/events";
import { listAllTerms } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { appointment, committee, macroeventRole, membership, person } from "../schema";
import { assertNoInhabilities, BOARD_KINDS, type Override } from "./inhabilities";

// Cargos de junta y de GH (ADR-034, punto 13): visibles, con historia por término; no otorgan permisos.
// Desde ADR-060 (regla 9) también los cargos de la mesa directiva de un macroevento: llevan la edición
// y el cargo del catálogo `macroevent_role`, con un titular y una codirección por cargo, y se nombran
// desde la edición, no desde la Persona 360.

export type AppointmentKind = (typeof appointment.$inferSelect)["kind"];

export const APPOINTMENT_KINDS: readonly AppointmentKind[] = [
  "PRESIDENT",
  "VP_GH",
  "VP_PUBLIC_RELATIONS",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_COMMUNICATIONS",
  "GH_HEAD",
  "GH_DIRECTOR",
  "MACROEVENT_DIRECTOR",
  "OTHER",
];

/** Los que se nombran desde la Persona 360; el de macroevento sale de la edición. */
export const BOARD_APPOINTMENT_KINDS: readonly AppointmentKind[] = APPOINTMENT_KINDS.filter(
  (kind) => kind !== "MACROEVENT_DIRECTOR",
);

export const appointmentInputSchema = z
  .object({
    kind: z.enum([
      "PRESIDENT",
      "VP_GH",
      "VP_PUBLIC_RELATIONS",
      "VP_ADMIN",
      "VP_FINANCE",
      "VP_COMMUNICATIONS",
      "GH_HEAD",
      "GH_DIRECTOR",
      "OTHER",
    ]),
    termId: z.string().trim().min(1),
    committeeId: z.string().trim().min(1).optional(),
    title: z.string().trim().max(80).optional(),
  })
  .refine((input) => input.kind !== "OTHER" || (input.title ?? "").length > 0, {
    path: ["title"],
    message: t("T-260"),
  });

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

/** Cargos de la mesa directiva de un macroevento (Regl. art. 41 a 43), en el orden del catálogo. */
export const MACROEVENT_ROLE_CODES = [
  "GENERAL",
  "LOGISTICA",
  "FINANZAS",
  "RELACIONES_PUBLICAS",
  "MERCADEO",
  "GESTION_HUMANA",
  "THE_GAMES",
  "CARNIVAL",
  "SEGURIDAD",
  "AGENDA_ACADEMICA",
] as const;

export const macroeventDirectorInputSchema = z.object({
  editionId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
  personId: z.string().trim().min(1),
  roleCode: z.enum(MACROEVENT_ROLE_CODES),
  coDirector: z.boolean().default(false),
});

export type MacroeventDirectorInput = z.input<typeof macroeventDirectorInputSchema>;

export interface AppointmentLabelInput {
  kind: AppointmentKind;
  title: string | null;
  roleLabel?: string | null;
  editionLabel?: string | null;
  coDirector?: boolean;
}

/**
 * Etiqueta de un cargo: la de T-444 por tipo; el título si es "Otro"; y para un cargo de macroevento
 * "{cargo} · {edición}" (T-2268) o "{cargo} (codirección) · {edición}" (T-2269).
 */
export function appointmentLabel(item: AppointmentLabelInput): string {
  const label = tList("T-444")[APPOINTMENT_KINDS.indexOf(item.kind)] ?? item.kind;
  if (item.kind === "MACROEVENT_DIRECTOR" && item.roleLabel) {
    return t(item.coDirector ? "T-2269" : "T-2268", {
      cargo: item.roleLabel,
      edición: item.editionLabel ?? "",
    });
  }
  return item.kind === "OTHER" && item.title ? item.title : label;
}

export interface AppointmentView {
  id: string;
  kind: AppointmentKind;
  title: string | null;
  termId: string;
  termCode: string;
  committeeId: string | null;
  committeeName: string | null;
  editionId: string | null;
  editionLabel: string | null;
  roleCode: string | null;
  roleLabel: string | null;
  coDirector: boolean;
  createdAt: Date;
}

/** "Evento · Edición" por id de edición, para etiquetar cargos de macroevento. */
export async function editionLabelsFor(ids: Iterable<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set([...ids].filter((id): id is string => id !== null))];
  const refs = await listEditionRefs(unique);
  return new Map([...refs.values()].map((ref) => [ref.id, `${ref.eventName} · ${ref.name}`]));
}

export async function listAppointments(personId: string): Promise<AppointmentView[]> {
  const [rows, terms] = await Promise.all([
    getDb()
      .select({
        id: appointment.id,
        kind: appointment.kind,
        title: appointment.title,
        termId: appointment.termId,
        committeeId: appointment.committeeId,
        committeeName: committee.name,
        editionId: appointment.editionId,
        roleCode: appointment.roleCode,
        roleLabel: macroeventRole.label,
        coDirector: appointment.coDirector,
        createdAt: appointment.createdAt,
      })
      .from(appointment)
      .leftJoin(committee, eq(committee.id, appointment.committeeId))
      .leftJoin(macroeventRole, eq(macroeventRole.code, appointment.roleCode))
      .where(eq(appointment.personId, personId)),
    listAllTerms(),
  ]);
  const editions = await editionLabelsFor(rows.map((row) => row.editionId));
  const termById = new Map(terms.map((term) => [term.id, term]));
  return rows
    .map((row) => ({
      ...row,
      termCode: termById.get(row.termId)?.code ?? "",
      committeeName: row.committeeName ?? null,
      editionLabel: row.editionId ? (editions.get(row.editionId) ?? null) : null,
      roleLabel: row.roleLabel ?? null,
    }))
    .sort(
      (a, b) =>
        (termById.get(b.termId)?.startsOn ?? "").localeCompare(
          termById.get(a.termId)?.startsOn ?? "",
        ) || a.kind.localeCompare(b.kind),
    );
}

export async function addAppointment(
  ctx: CommandContext,
  personId: string,
  input: AppointmentInput,
  override?: Override,
): Promise<{ id: string }> {
  // Junta y mesa de un comité no conviven (Regl. art. 11; ADR-060 regla 11).
  if ((BOARD_KINDS as readonly string[]).includes(input.kind)) {
    await assertNoInhabilities(ctx, {
      personId,
      termId: input.termId,
      replacing: [],
      wanted: [],
      wantsBoard: true,
      override,
    });
  }
  const values = {
    personId,
    kind: input.kind,
    termId: input.termId,
    committeeId: input.committeeId ?? null,
    title: input.title ?? null,
  };
  const [row] = await ctx.tx.insert(appointment).values(values).returning({ id: appointment.id });
  if (!row) {
    throw new Error("No se pudo crear el cargo");
  }
  await ctx.audit({
    action: "appointment.added",
    entityType: "appointment",
    entityId: row.id,
    after: values,
  });
  await ctx.emit(
    eventOf(appointmentChanged, {
      actorId: ctx.actor.personId,
      personId,
      action: "ADDED",
      kind: input.kind,
      termId: input.termId,
    }),
  );
  return row;
}

export async function removeAppointment(ctx: CommandContext, id: string): Promise<void> {
  const [row] = await ctx.tx.select().from(appointment).where(eq(appointment.id, id));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx.delete(appointment).where(eq(appointment.id, id));
  await ctx.audit({
    action: "appointment.removed",
    entityType: "appointment",
    entityId: id,
    before: row,
  });
  await ctx.emit(
    eventOf(appointmentChanged, {
      actorId: ctx.actor.personId,
      personId: row.personId,
      action: "REMOVED",
      kind: row.kind,
      termId: row.termId,
      editionId: row.editionId,
    }),
  );
}

// Mesa directiva de un macroevento (ADR-060 regla 9).

export interface MacroeventRoleRow {
  code: string;
  label: string;
  sortOrder: number;
}

export async function listMacroeventRoles(eventSlug?: string): Promise<MacroeventRoleRow[]> {
  const codes = eventSlug ? macroeventRoleCodes(eventSlug) : MACROEVENT_ROLE_CODES;
  const rows = await getDb()
    .select()
    .from(macroeventRole)
    .where(inArray(macroeventRole.code, [...codes]))
    .orderBy(asc(macroeventRole.sortOrder));
  return eventSlug ? rows.sort((a, b) => codes.indexOf(a.code) - codes.indexOf(b.code)) : rows;
}

export interface MacroeventBoardRow {
  id: string;
  personId: string;
  fullName: string;
  roleCode: string;
  roleLabel: string;
  coDirector: boolean;
  termId: string;
}

/** La mesa de una edición en el orden del catálogo, el titular antes que la codirección. */
export async function listMacroeventBoard(editionId: string): Promise<MacroeventBoardRow[]> {
  const rows = await getDb()
    .select({
      id: appointment.id,
      personId: appointment.personId,
      fullName: person.fullName,
      roleCode: macroeventRole.code,
      roleLabel: macroeventRole.label,
      coDirector: appointment.coDirector,
      termId: appointment.termId,
    })
    .from(appointment)
    .innerJoin(person, eq(person.id, appointment.personId))
    .innerJoin(macroeventRole, eq(macroeventRole.code, appointment.roleCode))
    .where(eq(appointment.editionId, editionId))
    .orderBy(asc(macroeventRole.sortOrder), asc(appointment.coDirector));
  return rows.map((row) => ({ ...row, fullName: row.fullName ?? "" }));
}

/** Si la persona es titular o codirección de un cargo en la mesa de una edición. Lo relee el dominio
 *  de `competition` dentro de su transacción (ADR-089 regla 10). */
export async function isMacroeventDirector(
  personId: string,
  editionId: string,
  roleCode: string,
  exec: Executor = getDb(),
): Promise<boolean> {
  const [row] = await exec
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.personId, personId),
        eq(appointment.editionId, editionId),
        eq(appointment.roleCode, roleCode),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Las ediciones en cuya mesa la persona tiene un cargo dado (ADR-089 regla 10). */
export async function listDirectedEditionIds(
  personId: string,
  roleCode: string,
  exec: Executor = getDb(),
): Promise<string[]> {
  const rows = await exec
    .select({ editionId: appointment.editionId })
    .from(appointment)
    .where(and(eq(appointment.personId, personId), eq(appointment.roleCode, roleCode)));
  return rows.flatMap((row) => (row.editionId ? [row.editionId] : []));
}

/**
 * Nombra a alguien en la mesa de una edición: solo un miembro activo, un titular y una codirección por
 * cargo y una sola persona por cargo en la edición (Regl. art. 27 par. 3, aplicado a macroeventos).
 * Las guardas cruzadas con comités y junta llegan con la regla 11.
 */
export async function addMacroeventDirector(
  ctx: CommandContext,
  raw: MacroeventDirectorInput,
  override?: Override,
): Promise<{ id: string }> {
  const input = macroeventDirectorInputSchema.parse(raw);
  const edition = await getMacroeventEdition(input.editionId, ctx.tx);
  if (!edition || !macroeventRoleCodes(edition.eventSlug).includes(input.roleCode)) {
    throw new DomainError(t("T-2351"), "roleCode");
  }
  const [titularTomado, codireccionTomada, soloActivos, yaEnLaMesa] = tList("T-2271");
  const [member] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, input.personId))
    .limit(1);
  if (member?.status !== "ACTIVE") {
    throw new DomainError(soloActivos ?? "");
  }
  const current = await ctx.tx
    .select({
      personId: appointment.personId,
      roleCode: appointment.roleCode,
      coDirector: appointment.coDirector,
    })
    .from(appointment)
    .where(eq(appointment.editionId, input.editionId));
  if (current.some((row) => row.personId === input.personId)) {
    throw new DomainError(yaEnLaMesa ?? "");
  }
  if (
    current.some((row) => row.roleCode === input.roleCode && row.coDirector === input.coDirector)
  ) {
    throw new DomainError((input.coDirector ? codireccionTomada : titularTomado) ?? "");
  }
  // Topes entre comités y macroeventos (Regl. art. 27 par. 3 y 4; ADR-060 regla 11).
  await assertNoInhabilities(ctx, {
    personId: input.personId,
    termId: input.termId,
    replacing: [{ kind: "MACROEVENT", scopeId: input.editionId }],
    wanted: [
      {
        kind: "MACROEVENT",
        scopeId: input.editionId,
        roleCode: input.roleCode,
        coDirector: input.coDirector,
      },
    ],
    override,
  });
  const values = {
    personId: input.personId,
    kind: "MACROEVENT_DIRECTOR" as const,
    termId: input.termId,
    editionId: input.editionId,
    roleCode: input.roleCode,
    coDirector: input.coDirector,
  };
  const [row] = await ctx.tx.insert(appointment).values(values).returning({ id: appointment.id });
  if (!row) {
    throw new Error("No se pudo crear el cargo de macroevento");
  }
  await ctx.audit({
    action: "appointment.added",
    entityType: "appointment",
    entityId: row.id,
    after: values,
  });
  await ctx.emit(
    eventOf(appointmentChanged, {
      actorId: ctx.actor.personId,
      personId: input.personId,
      action: "ADDED",
      kind: values.kind,
      termId: input.termId,
      editionId: input.editionId,
      roleCode: input.roleCode,
      coDirector: input.coDirector,
    }),
  );
  return row;
}

/** Cargos de macroevento vivos de varias personas en un término (para inhabilidades y elegibilidad). */
export async function listMacroeventDirectorsForTerm(
  termId: string,
  personIds: readonly string[],
): Promise<Array<{ personId: string; editionId: string; roleCode: string; coDirector: boolean }>> {
  if (personIds.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select({
      personId: appointment.personId,
      editionId: appointment.editionId,
      roleCode: appointment.roleCode,
      coDirector: appointment.coDirector,
    })
    .from(appointment)
    .where(
      and(
        eq(appointment.termId, termId),
        eq(appointment.kind, "MACROEVENT_DIRECTOR"),
        inArray(appointment.personId, [...personIds]),
      ),
    );
  return rows.flatMap((row) =>
    row.editionId && row.roleCode
      ? [{ ...row, editionId: row.editionId, roleCode: row.roleCode }]
      : [],
  );
}
