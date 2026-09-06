import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { listCommitteesByIds, listTermRoster } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { splitTitleBody } from "@/shared/copy/render";
import { formatDate } from "@/shared/lib/dates";
import { workGroup, workGroupEvaluator } from "../schema";
import { countPendingFor } from "./evaluations";
import { loadPeopleFacts, loadTermFacts } from "./facts";
import { noticePush } from "./notices-push-pure";
import { computePerson, noticesFor } from "./permanence-pure";

// Avisos de permanencia por push (ADR-038 regla 10): el programado `notices` calcula cada día los
// avisos de cada activo del término vigente (la misma `noticesFor` de Mi OE) y los manda al bus con
// una clave por persona y aviso; comms descarta lo que ya entregó.

const BATCH = 100;

async function listEvaluatorIds(termId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ personId: workGroupEvaluator.personId })
    .from(workGroupEvaluator)
    .innerJoin(workGroup, eq(workGroup.id, workGroupEvaluator.groupId))
    .where(eq(workGroup.termId, termId));
  return new Set(rows.map((row) => row.personId));
}

export interface NoticesResult {
  people: number;
  enqueued: number;
}

export async function runNotices(now = new Date()): Promise<NoticesResult> {
  const term = await getCurrentTerm(now);
  if (!term) {
    return { people: 0, enqueued: 0 };
  }
  const facts = await loadTermFacts(term.id);
  if (!facts) {
    return { people: 0, enqueued: 0 };
  }
  const roster = await listTermRoster(term.id);
  const personIds = [
    ...new Set(roster.filter((row) => row.status === "ACTIVE").map((row) => row.personId)),
  ];
  const committeeNames = new Map(
    (await listCommitteesByIds([...new Set(roster.map((row) => row.committeeId))])).map((item) => [
      item.id,
      item.name,
    ]),
  );
  const evaluators = await listEvaluatorIds(term.id);
  let enqueued = 0;
  for (let start = 0; start < personIds.length; start += BATCH) {
    const people = await loadPeopleFacts(facts, personIds.slice(start, start + BATCH));
    for (const person of people) {
      const result = computePerson(facts, person, now);
      const isEvaluator = evaluators.has(person.personId);
      const pending = isEvaluator ? await countPendingFor(person.personId, term.id) : 0;
      const notices = noticesFor(facts.term, result, facts.config, now, {
        pendingEvaluations: pending,
        isEvaluator,
      });
      for (const notice of notices) {
        const fecha = notice.values.fecha;
        const formatted =
          typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
            ? {
                ...notice,
                values: { ...notice.values, fecha: formatDate(new Date(`${fecha}T12:00:00Z`)) },
              }
            : notice;
        const push = noticePush(formatted, {
          termId: term.id,
          personId: person.personId,
          committeeName: notice.committeeId ? (committeeNames.get(notice.committeeId) ?? "") : "",
          now,
        });
        if (!push) {
          continue;
        }
        const { title, body } = splitTitleBody(push.text);
        await enqueueEvent(getDb(), {
          type: "notification.requested",
          payload: {
            kind: "REMINDER",
            recipients: [{ personId: person.personId }],
            title,
            body,
            url: push.url,
            dedupeKey: push.dedupeKey,
          },
          dedupeKey: push.dedupeKey,
        });
        enqueued += 1;
      }
    }
  }
  return { people: personIds.length, enqueued };
}
