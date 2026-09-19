import "server-only";
import { notFound, redirect } from "next/navigation";
import { type Actor, getActor, hasPermission } from "@/modules/identity";
import {
  COMMITTEE_CAPABILITIES,
  type CommitteeCapability,
  type InternalRoster,
  listInternalRoster,
  listMyCommitteeCapabilities,
  type RosterActorContext,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";

// Capacidades del actor sobre un comité (ADR-058): ADMIN y el líder técnico (`COMMITTEE_LEADER`) las
// tienen todas; el resto sale de los cargos vivos de dirección en el término. Vive en src/app porque
// compone `identity` (permisos) con `people` (cargos), que no se conocen entre sí.

export interface CommitteeCapabilities {
  capabilities: Set<CommitteeCapability>;
  /** Líder técnico del comité: todas las capacidades sin depender del roster. */
  isLeader: boolean;
}

export async function committeeCapabilities(
  actor: Actor,
  committeeId: string,
  termId: string | null,
): Promise<CommitteeCapabilities> {
  const isLeader = hasPermission(actor, "COMMITTEE_LEADER", committeeId);
  if (actor.isAdmin || isLeader) {
    return { capabilities: new Set(COMMITTEE_CAPABILITIES), isLeader };
  }
  if (!termId) {
    return { capabilities: new Set(), isLeader: false };
  }
  const directed = await listMyCommitteeCapabilities(actor.personId, termId);
  const mine = directed.find((item) => item.committee.id === committeeId);
  return { capabilities: new Set(mine?.capabilities ?? []), isLeader: false };
}

export interface CommitteeAccess extends CommitteeCapabilities {
  actor: Actor;
  roster: InternalRoster;
  isAdmin: boolean;
  /** Cómo llega el actor a los comandos de `people`, que no conocen `Permission`. */
  context: RosterActorContext;
}

/** Null si el comité no existe o está inactivo. */
export async function committeeAccess(actor: Actor, slug: string): Promise<CommitteeAccess | null> {
  const roster = await listInternalRoster(slug);
  if (!roster) {
    return null;
  }
  const term = roster.term ?? (await getCurrentTerm());
  const { capabilities, isLeader } = await committeeCapabilities(
    actor,
    roster.committee.id,
    term?.id ?? null,
  );
  return {
    actor,
    roster,
    isAdmin: actor.isAdmin,
    isLeader,
    capabilities,
    context: { isAdmin: actor.isAdmin, allCapabilities: actor.isAdmin || isLeader },
  };
}

/** La página del comité: alguna capacidad. Sin sesión, a entrar; sin comité, 404; sin rol, a Mi OE. */
export async function requireCommitteeAccess(
  slug: string,
  returnTo: string,
): Promise<CommitteeAccess> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const access = await committeeAccess(actor, slug);
  if (!access) {
    notFound();
  }
  if (access.capabilities.size === 0) {
    redirect("/app");
  }
  return access;
}

/** Una acción o página de un área: la capacidad pedida. Sin comité, al inicio del admin; sin ella, a Mi OE. */
export async function requireCommitteeCapability(
  slug: string,
  capability: CommitteeCapability,
  returnTo: string,
): Promise<CommitteeAccess> {
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  const access = await committeeAccess(actor, slug);
  if (!access) {
    redirect("/admin");
  }
  if (!access.capabilities.has(capability)) {
    redirect("/app");
  }
  return access;
}
