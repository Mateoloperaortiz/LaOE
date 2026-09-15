import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { getMembershipRef, listCommitteeIdsForPersonInTerm } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import type { RewardCaps } from "../gamification-types";

// Contexto del miembro para la gamificación (ADR-067): estado de la membresía, primer término
// (nuevo o veterano) y comités vigentes del término; lo resuelve el wrapper fuera del comando o
// dentro con ctx.tx.

export interface MemberContext {
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";
  firstTermId: string;
  committeeIds: string[];
}

/** null si la persona no tiene membresía: sin membresía no hay público elegible. */
export async function resolveMemberContext(
  personId: string,
  termId: string,
  exec: Executor = getDb(),
): Promise<MemberContext | null> {
  const ref = await getMembershipRef(personId, exec);
  if (!ref) {
    return null;
  }
  const committeeIds = await listCommitteeIdsForPersonInTerm(personId, termId, exec);
  return { status: ref.status, firstTermId: ref.firstTermId, committeeIds };
}

export interface GamificationSettings {
  enabled: boolean;
  caps: RewardCaps;
  defaults: {
    trivia: number;
    presential: number;
    evidence: number;
    passPercent: number;
  };
}

/** Las tres claves `gamification.*` del app_config (sembradas por la migración 0030). */
export async function loadGamificationSettings(): Promise<GamificationSettings> {
  const [enabled, caps, defaults] = await Promise.all([
    requireConfig("gamification.enabled"),
    requireConfig("gamification.caps"),
    requireConfig("gamification.defaults"),
  ]);
  return { enabled, caps, defaults };
}
