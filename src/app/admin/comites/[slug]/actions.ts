"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { committeeAnnouncementSchema, createCommitteeAnnouncementAs } from "@/modules/content";
import {
  createOccasionAs,
  createOccasionSeriesAs,
  occasionInputSchema,
} from "@/modules/participation";
import {
  addCommitteeMemberAs,
  type CommitteeRoleRow,
  committeeProfileSchema,
  getPeopleByIds,
  listCommitteeRoles,
  type RoleView,
  removalRequestSchema,
  requestCommitteeRemovalAs,
  rosterChangeSchema,
  setMemberRolesAs,
  setRepresentativeAs,
  updateCommitteeProfileAs,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import { bogotaInputToUtc, LOCAL_INPUT } from "@/shared/lib/dates";
import { clientIp } from "@/shared/lib/request";
import { requireCommitteeCapability } from "../_kit/capacidades";

// Acciones de ocasiones de la vista del comité (ADR-035 regla 15, ADR-058): quien tiene la capacidad
// OCCASIONS (ADMIN, líder técnico o la dirección por su cargo); una ocasión nueva nace en borrador con
// el comité fijo; la serie semanal crea reuniones abiertas sin puntos.

const slugSchema = z.string().regex(/^[a-z0-9-]+$/);

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function leaderOf(slug: string, returnTo: string) {
  const access = await requireCommitteeCapability(slug, "OCCASIONS", returnTo);
  return { actor: access.actor, committee: access.roster.committee };
}

function back(slug: string, extra: Record<string, string> = {}): string {
  const query = new URLSearchParams(extra).toString();
  return `/admin/comites/${slug}${query ? `?${query}` : ""}`;
}

const actividades = { area: "actividades" };

export async function proposeOccasionAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, committee } = await leaderOf(
    slug,
    back(slug, { ...actividades, accion: "nueva" }),
  );
  const parsed = occasionInputSchema.safeParse({
    title: text(formData, "title"),
    kind: "ACTIVITY",
    category: text(formData, "category") || "OTHER",
    description: text(formData, "description"),
    location: text(formData, "location"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt") || undefined,
    points: text(formData, "points") || "0",
    approval: text(formData, "approval") || "AUTO",
    committeeId: committee.id,
  });
  if (!parsed.success) {
    redirect(
      back(slug, {
        ...actividades,
        accion: "nueva",
        error: parsed.error.issues[0]?.message ?? t("T-260"),
      }),
    );
  }
  try {
    await createOccasionAs({ personId: actor.personId, ip: await clientIp() }, parsed.data);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...actividades, accion: "nueva", error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { ...actividades, guardado: "1" }));
}

const seriesSchema = z.object({
  title: z.string().trim().min(2).max(120),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(600),
  location: z.string().trim().max(200).default(""),
});

export async function createSeriesAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const { actor, committee } = await leaderOf(
    slug,
    back(slug, { ...actividades, accion: "serie" }),
  );
  const parsed = seriesSchema.safeParse({
    title: text(formData, "title"),
    firstDate: text(formData, "firstDate"),
    time: text(formData, "time"),
    durationMinutes: text(formData, "durationMinutes") || "90",
    location: text(formData, "location"),
  });
  const local = parsed.success ? `${parsed.data.firstDate}T${parsed.data.time}` : "";
  if (!parsed.success || !LOCAL_INPUT.test(local)) {
    redirect(back(slug, { ...actividades, accion: "serie", error: t("T-260") }));
  }
  try {
    const result = await createOccasionSeriesAs(
      { personId: actor.personId, ip: await clientIp() },
      {
        committeeId: committee.id,
        title: parsed.data.title,
        firstStartsAt: bogotaInputToUtc(local),
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location,
      },
    );
    revalidatePath(back(slug));
    redirect(
      back(slug, {
        ...actividades,
        serie: String(result.created),
        hasta: result.lastStartsAt ? result.lastStartsAt.toISOString() : "",
      }),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...actividades, accion: "serie", error: error.message }));
    }
    throw error;
  }
}

// Área Personas (ADR-058, decisión 4): agregar, cargos y pedido de retiro, con la capacidad ROSTER; las
// guardas finas viven en `people`. Las casillas se llaman `role-CODIGO` y `co-CODIGO`; un cargo de
// dirección que el actor no puede tocar (sin DIRECTION) se conserva como está.

const personas = { area: "personas" };

function rolesFromForm(
  formData: FormData,
  catalog: CommitteeRoleRow[],
  keep: RoleView[],
  canDirect: boolean,
): Array<{ roleCode: string; coDirector: boolean }> {
  const roles: Array<{ roleCode: string; coDirector: boolean }> = [];
  for (const role of catalog) {
    if (role.code === "MIEMBRO") {
      continue;
    }
    if (role.isLeadership && !canDirect) {
      const current = keep.find((item) => item.roleCode === role.code);
      if (current) {
        roles.push({ roleCode: role.code, coDirector: current.coDirector });
      }
      continue;
    }
    if (formData.get(`role-${role.code}`) === "on") {
      roles.push({ roleCode: role.code, coDirector: formData.get(`co-${role.code}`) === "on" });
    }
  }
  return roles;
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const q = text(formData, "q");
  const panel = { ...personas, accion: "agregar", ...(q ? { q } : {}) };
  const access = await requireCommitteeCapability(slug, "ROSTER", back(slug, panel));
  const term = access.roster.term;
  if (!term) {
    redirect(back(slug, { ...personas, error: t("T-2140") }));
  }
  const catalog = await listCommitteeRoles();
  const parsed = rosterChangeSchema.safeParse({
    personId: text(formData, "personId"),
    roles: rolesFromForm(formData, catalog, [], access.capabilities.has("DIRECTION")),
  });
  if (!parsed.success) {
    redirect(back(slug, { ...panel, error: t("T-260") }));
  }
  try {
    await addCommitteeMemberAs(
      { personId: access.actor.personId, ip: await clientIp() },
      { committeeId: access.roster.committee.id, termId: term.id },
      access.context,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...panel, error: error.message }));
    }
    throw error;
  }
  const people = await getPeopleByIds([parsed.data.personId]);
  revalidatePath(back(slug));
  redirect(
    back(slug, {
      ...personas,
      agregado: people.get(parsed.data.personId)?.fullName?.trim() ?? "",
    }),
  );
}

export async function setRolesAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const personId = text(formData, "personId");
  const panel = { ...personas, accion: "cargos", persona: personId };
  const access = await requireCommitteeCapability(slug, "ROSTER", back(slug, panel));
  const term = access.roster.term;
  if (!term) {
    redirect(back(slug, { ...personas, error: t("T-2140") }));
  }
  const member = access.roster.members.find((item) => item.personId === personId);
  const catalog = await listCommitteeRoles();
  const parsed = rosterChangeSchema.safeParse({
    personId,
    roles: rolesFromForm(
      formData,
      catalog,
      member?.roles ?? [],
      access.capabilities.has("DIRECTION"),
    ),
  });
  if (!parsed.success) {
    redirect(back(slug, { ...panel, error: t("T-260") }));
  }
  try {
    await setMemberRolesAs(
      { personId: access.actor.personId, ip: await clientIp() },
      { committeeId: access.roster.committee.id, termId: term.id },
      access.context,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...panel, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { ...personas, guardado: "1" }));
}

export async function requestRemovalAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const personId = text(formData, "personId");
  const panel = { ...personas, accion: "retiro", persona: personId };
  const access = await requireCommitteeCapability(slug, "ROSTER", back(slug, panel));
  const term = access.roster.term;
  if (!term) {
    redirect(back(slug, { ...personas, error: t("T-2140") }));
  }
  const parsed = removalRequestSchema.safeParse({ personId, reason: text(formData, "reason") });
  if (!parsed.success) {
    redirect(back(slug, { ...panel, error: t("T-260") }));
  }
  try {
    await requestCommitteeRemovalAs(
      { personId: access.actor.personId, ip: await clientIp() },
      { committeeId: access.roster.committee.id, termId: term.id },
      access.context,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...panel, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { ...personas, pedido: "1" }));
}

// Área Comunicación (ADR-058, decisión 5): cartelera interna con BOARD y ficha con PROFILE.

const comunicacion = { area: "comunicacion" };

export async function createCommitteeAnnouncementAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const panel = { ...comunicacion, accion: "anuncio" };
  const access = await requireCommitteeCapability(slug, "BOARD", back(slug, panel));
  const parsed = committeeAnnouncementSchema.safeParse({
    title: text(formData, "title"),
    body: typeof formData.get("body") === "string" ? formData.get("body") : "",
    push: formData.get("push") === "on",
  });
  if (!parsed.success) {
    redirect(back(slug, { ...panel, error: t("T-260") }));
  }
  try {
    await createCommitteeAnnouncementAs(
      { personId: access.actor.personId, ip: await clientIp() },
      access.roster.committee.id,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...panel, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { ...comunicacion, guardado: "1" }));
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const access = await requireCommitteeCapability(slug, "PROFILE", back(slug, comunicacion));
  const parsed = committeeProfileSchema.safeParse({
    presentation:
      typeof formData.get("presentation") === "string" ? formData.get("presentation") : "",
    contactUrl: text(formData, "contactUrl"),
  });
  if (!parsed.success) {
    redirect(back(slug, { ...comunicacion, error: t("T-260") }));
  }
  try {
    await updateCommitteeProfileAs(
      { personId: access.actor.personId, ip: await clientIp() },
      access.roster.committee.id,
      parsed.data,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { ...comunicacion, error: error.message }));
    }
    throw error;
  }
  revalidatePath(back(slug));
  redirect(back(slug, { ...comunicacion, guardado: "1" }));
}

// Representantes ante la Asamblea Directiva (ADR-060 regla 7): quien tiene ROSTER nombra al titular y
// al suplente del término entre los miembros activos del comité.
const representativeIdSchema = z.string().regex(/^[a-z0-9-]*$/);

export async function setRepresentativesAction(formData: FormData): Promise<void> {
  const slug = slugSchema.parse(formData.get("slug"));
  const returnTo = back(slug, { area: "personas" });
  const access = await requireCommitteeCapability(slug, "ROSTER", returnTo);
  const term = await getCurrentTerm();
  if (!term) {
    redirect(back(slug, { area: "personas", error: t("T-260") }));
  }
  const actor = { personId: access.actor.personId, ip: await clientIp() };
  try {
    for (const role of ["TITULAR", "SUPLENTE"] as const) {
      await setRepresentativeAs(actor, {
        committeeId: access.roster.committee.id,
        termId: term.id,
        role,
        personId: representativeIdSchema.parse(text(formData, role.toLowerCase())) || null,
      });
    }
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(back(slug, { area: "personas", error: error.message }));
    }
    throw error;
  }
  revalidatePath(returnTo);
  revalidatePath("/admin/asambleas");
  redirect(back(slug, { area: "personas", guardado: "1" }));
}
