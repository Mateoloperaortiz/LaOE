import type { TermRow } from "@/modules/terms";
import { countPendingFor } from "./evaluations";
import { loadPeopleFacts, loadTermFacts } from "./facts";
import { listMyGroupRoles } from "./groups";
import {
  computePerson,
  evaluationWindow,
  type Notice,
  noticesFor,
  type PermanenceConfig,
  type PersonPermanence,
  type TermLike,
} from "./permanence-pure";
import { getSnapshot, snapshotToResult } from "./snapshots";

// La vista propia (ADR-036 regla 5): en vivo mientras el término está abierto, congelada después.
// Sirve a /app/permanencia, a la barra del inicio y a la pestaña Permanencia de la Persona 360.

export interface PersonPermanenceView {
  term: TermLike;
  config: PermanenceConfig;
  result: PersonPermanence;
  /** true cuando se calculó ahora; false cuando viene del snapshot congelado. */
  live: boolean;
  computedAt: Date;
  notices: Notice[];
  /** La ventana de evaluación, para la bandeja del evaluador. */
  window: { opensOn: string; open: boolean };
}

function emptyResult(personId: string): PersonPermanence {
  return {
    personId,
    status: "INACTIVE",
    isNew: false,
    probation: false,
    expulsionWarning: false,
    evaluated: false,
    general: [],
    generalTotal: 0,
    generalMax: 0,
    results: [],
    mandatory: {
      required: { ordinary: 0, boardElection: false, runoff: false },
      attended: { ordinary: 0, boardElection: false, runoff: false },
      met: true,
      missing: [],
      lost: [],
      excused: [],
      upcoming: [],
      induction: { required: false, attended: false, excused: false, pending: false },
    },
  };
}

export async function getPersonPermanence(
  personId: string,
  termOrId: string | TermRow,
  now = new Date(),
): Promise<PersonPermanenceView | null> {
  const termId = typeof termOrId === "string" ? termOrId : termOrId.id;
  const facts = await loadTermFacts(termOrId);
  if (!facts) {
    return null;
  }
  const snapshot = await getSnapshot(personId, termId);
  const frozen = snapshot?.frozenAt !== null && snapshot !== null;
  let result: PersonPermanence;
  let live = false;
  let computedAt = now;
  if (frozen || facts.term.permanenceClosedAt) {
    result = snapshot ? snapshotToResult(snapshot) : emptyResult(personId);
    computedAt = snapshot?.computedAt ?? now;
  } else {
    const [person] = await loadPeopleFacts(facts, [personId]);
    result = person ? computePerson(facts, person, now) : emptyResult(personId);
    live = true;
  }
  const roles = await listMyGroupRoles(personId, termId);
  const pending = roles.evaluates.length > 0 ? await countPendingFor(personId, termId) : 0;
  const notices = noticesFor(facts.term, result, facts.config, now, {
    pendingEvaluations: pending,
    isEvaluator: roles.evaluates.length > 0,
  });
  return {
    term: facts.term,
    config: facts.config,
    result,
    live,
    computedAt,
    notices,
    window: evaluationWindow(facts.term, facts.config, now),
  };
}
