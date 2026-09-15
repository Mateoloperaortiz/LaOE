import { committeeRolesLabel } from "@/modules/people";
import type { InteractionKind } from "../schema";

// Traduce un evento de dominio a una entrada de la línea de tiempo (02-crm.md). Sin I/O: los nombres
// de términos, comités y cargos llegan por `lookup` y los textos por `labels` (T-458 y catálogos).

/** Eventos que producen una interacción automática (01-arquitectura.md). */
export const TIMELINE_EVENTS = [
  "person.imported",
  "membership.changed",
  "committee-membership.changed",
  "committee-removal.requested",
  "appointment.changed",
  "consent.changed",
  "person.updated",
  "person.email-changed",
  "person.deletion-requested",
  "person.data-exported",
  "person.anonymized",
  "permission.granted",
  "permission.revoked",
  "checkin.approved",
  "checkin.pending",
  "checkin.cancelled",
  "checkin.excused",
  "points.adjusted",
  "points.reversed",
  "wordle.completed",
  "evaluation.recorded",
  "leader-score.recorded",
  "manual-credit.granted",
  "work-group-membership.changed",
  "permanence.decided",
  "membership-term.changed",
  "submission.received",
  "registration.created",
  "card.created",
  "card.moved",
  "stage.changed",
  "person.admitted",
  "request.created",
  "request.decided",
  "request.withdrawn",
  "call-entry.changed",
  "sanction.recorded",
  "sanction.revoked",
  "challenge.completed",
  "challenge.rejected",
  "badge.unlocked",
  "booster.granted",
] as const;

export interface TimelineLabels {
  /** Los dieciséis textos de T-458, en orden. */
  texts: string[];
  /** Los textos de participación de T-667, en orden (fase 3). */
  participationTexts: string[];
  /** Los nombres de booster de T-2451, en orden (ADR-067); los usa booster.granted. */
  boosterNames?: string[];
  /** Los textos de permanencia de T-832, en orden (fase 4; los dos últimos, ADR-056). */
  permanenceTexts: string[];
  /** Los textos de admisión, aliados y contactos de T-1046, en orden (fase 5). */
  crmTexts: string[];
  /** El pedido de retiro de un comité por su dirección, T-2171 (ADR-058). */
  directionTexts: string[];
  /** Sanción registrada y revocada, T-2234, y los tipos de T-2229 (ADR-060 regla 6). */
  sanctionTexts?: string[];
  sanctionKinds?: Record<string, string>;
  /** Las etapas de la persona de T-1047, en el orden del modelo. */
  stages: Record<string, string>;
  /** Los estados de una solicitud de T-876, en el orden del modelo. */
  requestStatuses: Record<string, string>;
  /** Los estados de una inscripción a convocatoria de T-899, en el orden del modelo. */
  callEntryStatuses: Record<string, string>;
  /** Las decisiones del cierre de T-802, en el orden del modelo. */
  decisions: Record<string, string>;
  statuses: Record<string, string>;
  appointmentKinds: Record<string, string>;
  permissions: Record<string, string>;
  purposes: Record<string, string>;
  fields: Record<string, string>;
}

export interface TimelineLookup {
  termCode(id: string): string;
  committeeName(id: string): string;
  roleLabel(code: string): string;
}

export interface TimelineEntry {
  personId: string | null;
  /** Sujeto alternativo desde la fase 5: una organización (notas y tarjetas de patrocinio). */
  organizationId: string | null;
  actorId: string | null;
  kind: InteractionKind;
  summary: string;
  metadata: Record<string, unknown>;
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{([a-zA-Zñáéíóú ]+)\}/g,
    (match, key: string) => values[key.trim()] ?? match,
  );
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

export function summarizeEvent(
  type: string,
  payload: Record<string, unknown>,
  labels: TimelineLabels,
  lookup: TimelineLookup,
): TimelineEntry | null {
  const personId = str(payload, "personId") || null;
  const organizationId = str(payload, "organizationId") || null;
  if (!personId && !organizationId) {
    return null;
  }
  const actorId = str(payload, "actorId") || null;
  const text = (index: number) => labels.texts[index] ?? "";
  const entry = (
    kind: InteractionKind,
    summary: string,
    metadata: Record<string, unknown> = {},
  ): TimelineEntry => ({
    personId,
    organizationId,
    actorId,
    kind,
    summary,
    metadata: { event: type, ...metadata },
  });

  switch (type) {
    case "person.imported":
      return entry("IMPORTED", fill(text(0), { término: str(payload, "termCode") }));
    case "membership.changed": {
      const from = str(payload, "from");
      const to = str(payload, "to");
      const reason = str(payload, "reason") || str(payload, "endReason");
      if (!from) {
        // La membresía nace con "dar de alta": lo anota person.admitted.
        return null;
      }
      if (to === "INACTIVE") {
        return entry("MEMBERSHIP", fill(text(2), { motivo: reason || "—" }), { from, to });
      }
      if (from === "INACTIVE") {
        return entry("MEMBERSHIP", text(3), { from, to });
      }
      return entry(
        "MEMBERSHIP",
        fill(text(1), {
          de: label(labels.statuses, from),
          a: label(labels.statuses, to),
          motivo: reason || "—",
        }),
        { from, to },
      );
    }
    case "committee-membership.changed": {
      const committees = Array.isArray(payload.committees) ? payload.committees : [];
      const names = committees
        .map((item) => {
          if (!item || typeof item !== "object") {
            return "";
          }
          const row = item as Record<string, unknown>;
          // Con `roles` (ADR-058) se leen todos los cargos; un payload viejo trae solo el principal.
          const roles = (Array.isArray(row.roles) ? row.roles : [])
            .filter((role): role is Record<string, unknown> => !!role && typeof role === "object")
            .map((role) => ({
              roleCode: str(role, "roleCode"),
              roleLabel: lookup.roleLabel(str(role, "roleCode")),
              coDirector: role.coDirector === true,
            }));
          const cargo =
            roles.length > 0
              ? committeeRolesLabel(roles, lookup.roleLabel("MIEMBRO"))
              : lookup.roleLabel(str(row, "roleCode"));
          return `${lookup.committeeName(str(row, "committeeId"))} · ${cargo}`;
        })
        .filter(Boolean);
      return entry(
        "COMMITTEES",
        fill(text(4), {
          término: lookup.termCode(str(payload, "termId")),
          comités: names.length > 0 ? names.join(", ") : "—",
        }),
      );
    }
    case "committee-removal.requested":
      return entry(
        "COMMITTEES",
        fill(labels.directionTexts[0] ?? "", {
          comité: lookup.committeeName(str(payload, "committeeId")),
          motivo: str(payload, "reason") || "—",
        }),
        { committeeId: str(payload, "committeeId"), termId: str(payload, "termId") },
      );
    case "appointment.changed": {
      const cargo = label(labels.appointmentKinds, str(payload, "kind"));
      const término = lookup.termCode(str(payload, "termId"));
      return entry(
        "APPOINTMENT",
        str(payload, "action") === "REMOVED"
          ? fill(text(6), { cargo })
          : fill(text(5), { cargo, término }),
      );
    }
    case "consent.changed": {
      const propósito = label(labels.purposes, str(payload, "purpose"));
      return entry(
        "CONSENT",
        str(payload, "action") === "REVOKED"
          ? fill(text(8), { propósito })
          : fill(text(7), { propósito }),
      );
    }
    case "person.updated": {
      const fields = Array.isArray(payload.fields)
        ? payload.fields.filter((item): item is string => typeof item === "string")
        : [];
      return entry(
        "DATA",
        fill(text(9), { campos: fields.map((f) => label(labels.fields, f)).join(", ") }),
      );
    }
    case "person.email-changed":
      return entry("DATA", text(10));
    case "person.deletion-requested":
      return entry("DATA", text(11));
    case "person.data-exported":
      return entry("DATA", text(12));
    case "person.anonymized":
      return entry("DATA", text(13));
    case "checkin.approved": {
      const points = typeof payload.points === "number" ? payload.points : 0;
      const ocasion = str(payload, "occasionTitle");
      const participation = (index: number) => labels.participationTexts[index] ?? "";
      return entry(
        "PARTICIPATION",
        points > 0
          ? fill(participation(1), { n: String(points), ocasion })
          : fill(participation(0), { ocasion }),
        { occasionId: str(payload, "occasionId"), points, category: str(payload, "category") },
      );
    }
    case "checkin.pending":
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[2] ?? "", { ocasion: str(payload, "occasionTitle") }),
        { occasionId: str(payload, "occasionId") },
      );
    case "checkin.cancelled":
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[3] ?? "", {
          ocasion: str(payload, "occasionTitle"),
          motivo: str(payload, "reason") || "—",
        }),
        { occasionId: str(payload, "occasionId") },
      );
    case "checkin.excused":
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[7] ?? "", { ocasion: str(payload, "occasionTitle") }),
        { occasionId: str(payload, "occasionId"), excused: true },
      );
    case "challenge.completed": {
      const points = typeof payload.points === "number" ? payload.points : 0;
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[8] ?? "", {
          reto: str(payload, "challengeTitle"),
          n: String(points),
        }),
        {
          participationId: str(payload, "participationId"),
          challengeId: str(payload, "challengeId"),
          termId: str(payload, "termId"),
          points,
        },
      );
    }
    case "challenge.rejected":
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[11] ?? "", {
          reto: str(payload, "challengeTitle"),
          motivo: str(payload, "reason"),
        }),
        {
          participationId: str(payload, "participationId"),
          challengeId: str(payload, "challengeId"),
          termId: str(payload, "termId"),
        },
      );
    case "badge.unlocked": {
      // Los logros de la conciliación histórica no ensucian la línea de tiempo.
      if (payload.historical === true) {
        return null;
      }
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[9] ?? "", {
          insignia: str(payload, "name"),
          nivel: String(payload.level ?? ""),
        }),
        {
          achievementId: str(payload, "achievementId"),
          code: str(payload, "code"),
          level: payload.level ?? null,
        },
      );
    }
    case "booster.granted": {
      // El booster por insignia ya lo cuenta badge.unlocked; solo el manual de GH entra acá.
      if (str(payload, "source") !== "MANUAL") {
        return null;
      }
      const kinds = ["PLUS_50", "PLUS_100"];
      const kind = str(payload, "kind");
      const booster =
        labels.boosterNames?.[kinds.indexOf(kind)] ?? labels.boosterNames?.[0] ?? kind;
      return entry("PARTICIPATION", fill(labels.participationTexts[10] ?? "", { booster }), {
        boosterId: str(payload, "boosterId"),
        kind,
      });
    }
    case "sanction.recorded":
      return entry(
        "MEMBERSHIP",
        fill(labels.sanctionTexts?.[0] ?? "", {
          tipo: label(labels.sanctionKinds ?? {}, str(payload, "kind")),
          causal: str(payload, "cause"),
        }),
        { sanctionId: str(payload, "sanctionId"), kind: str(payload, "kind") },
      );
    case "sanction.revoked":
      return entry(
        "MEMBERSHIP",
        fill(labels.sanctionTexts?.[1] ?? "", {
          tipo: label(labels.sanctionKinds ?? {}, str(payload, "kind")),
          motivo: str(payload, "reason") || "—",
        }),
        { sanctionId: str(payload, "sanctionId"), kind: str(payload, "kind") },
      );
    case "wordle.completed": {
      const points = typeof payload.points === "number" ? payload.points : 0;
      const attempts = typeof payload.attempts === "number" ? payload.attempts : 0;
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[6] ?? "", {
          fecha: str(payload, "day"),
          intentos: String(attempts),
          n: String(points),
        }),
        {
          gameId: str(payload, "gameId"),
          termId: str(payload, "termId"),
          day: str(payload, "day"),
          attempts,
          points,
        },
      );
    }
    case "points.adjusted":
    case "points.reversed": {
      const points = typeof payload.points === "number" ? payload.points : 0;
      return entry(
        "PARTICIPATION",
        fill(labels.participationTexts[type === "points.adjusted" ? 4 : 5] ?? "", {
          n: String(points),
          motivo: str(payload, "reason") || "—",
        }),
        { termId: str(payload, "termId"), points },
      );
    }
    case "evaluation.recorded": {
      const permanence = (index: number) => labels.permanenceTexts[index] ?? "";
      const good = str(payload, "evaluation") === "GOOD";
      return entry(
        "PERMANENCE",
        fill(permanence(good ? 0 : 1), {
          grupo: str(payload, "groupName"),
          evaluador: str(payload, "evaluatorName") || "GH",
          nota: str(payload, "note"),
        }),
        { groupId: str(payload, "groupId"), evaluation: str(payload, "evaluation") },
      );
    }
    case "leader-score.recorded": {
      const value = typeof payload.value === "number" ? payload.value : 0;
      const weight = typeof payload.weight === "number" ? payload.weight : 0;
      const note = str(payload, "note");
      return entry(
        "PERMANENCE",
        `${fill(labels.permanenceTexts[2] ?? "", {
          criterio: str(payload, "criterion"),
          comité: lookup.committeeName(str(payload, "committeeId")),
          valor: String(value),
          peso: String(weight),
        })}${note ? `: ${note}` : ""}`,
        { ruleId: str(payload, "ruleId"), value, weight },
      );
    }
    case "manual-credit.granted": {
      const value = typeof payload.value === "number" ? payload.value : 0;
      return entry(
        "PERMANENCE",
        fill(labels.permanenceTexts[3] ?? "", {
          criterio: str(payload, "criterion"),
          valor: String(value),
          motivo: str(payload, "reason"),
        }),
        { ruleId: str(payload, "ruleId"), value },
      );
    }
    case "work-group-membership.changed": {
      const joined = str(payload, "change") === "JOINED";
      return entry(
        "PERMANENCE",
        fill(labels.permanenceTexts[joined ? 4 : 5] ?? "", { grupo: str(payload, "groupName") }),
        { groupId: str(payload, "groupId"), change: str(payload, "change") },
      );
    }
    case "permanence.decided": {
      const decision = str(payload, "decision");
      const committee = str(payload, "committeeId");
      const reason = str(payload, "reason");
      return entry(
        "PERMANENCE",
        `${fill(labels.permanenceTexts[6] ?? "", {
          término: lookup.termCode(str(payload, "termId")),
          decisión: `${label(labels.decisions, decision)}${committee ? ` (${lookup.committeeName(committee)})` : ""}`,
        })}${reason ? `: ${reason}` : ""}`,
        { termId: str(payload, "termId"), committeeId: committee || null, decision },
      );
    }
    case "membership-term.changed": {
      const probation = payload.probation === true;
      const committee = str(payload, "committeeId");
      // Con comité usa los textos décimo y undécimo de T-832 (ADR-060 regla 2).
      const index = committee ? (probation ? 9 : 10) : probation ? 7 : 8;
      return entry(
        "PERMANENCE",
        fill(labels.permanenceTexts[index] ?? "", {
          término: lookup.termCode(str(payload, "termId")),
          comité: committee ? lookup.committeeName(committee) : "",
          motivo: str(payload, "reason") || "—",
        }),
        { termId: str(payload, "termId"), committeeId: committee || null, probation },
      );
    }
    case "submission.received":
      return entry(
        "FORM",
        fill(labels.crmTexts[0] ?? "", { formulario: str(payload, "formTitle") }),
        {
          submissionId: str(payload, "submissionId"),
          formId: str(payload, "formId"),
        },
      );
    case "registration.created":
      return entry(
        "FORM",
        fill(labels.crmTexts[1] ?? "", { edición: str(payload, "editionName") }),
        {
          editionId: str(payload, "editionId"),
          submissionId: str(payload, "submissionId"),
        },
      );
    case "card.created":
      return entry(
        "PIPELINE",
        fill(labels.crmTexts[2] ?? "", {
          pipeline: str(payload, "pipelineName"),
          etapa: str(payload, "stageName"),
        }),
        { cardId: str(payload, "cardId"), pipelineId: str(payload, "pipelineId") },
      );
    case "card.moved":
      return entry(
        "PIPELINE",
        fill(labels.crmTexts[3] ?? "", {
          etapa: str(payload, "stageName"),
          pipeline: str(payload, "pipelineName"),
        }),
        {
          cardId: str(payload, "cardId"),
          pipelineId: str(payload, "pipelineId"),
          won: payload.won === true,
          lost: payload.lost === true,
        },
      );
    case "stage.changed":
      return entry(
        "MEMBERSHIP",
        fill(labels.crmTexts[4] ?? "", { etapa: label(labels.stages, str(payload, "to")) }),
        { from: str(payload, "from"), to: str(payload, "to") },
      );
    case "person.admitted": {
      const committees = Array.isArray(payload.committees)
        ? payload.committees.filter((item): item is string => typeof item === "string")
        : [];
      return entry(
        "MEMBERSHIP",
        fill(labels.crmTexts[5] ?? "", {
          término: str(payload, "termCode") || lookup.termCode(str(payload, "termId")),
          comités: committees.join(", "),
        }),
        { termId: str(payload, "termId") },
      );
    }
    case "request.created":
      return entry("REQUEST", fill(labels.crmTexts[6] ?? "", { tipo: str(payload, "kindLabel") }), {
        requestId: str(payload, "requestId"),
        kind: str(payload, "kind"),
      });
    case "request.decided":
    case "request.withdrawn": {
      const status = type === "request.withdrawn" ? "WITHDRAWN" : str(payload, "status");
      const reason = str(payload, "reason");
      const base = fill(labels.crmTexts[7] ?? "", {
        tipo: str(payload, "kindLabel"),
        estado: label(labels.requestStatuses, status).toLowerCase(),
        motivo: reason,
      });
      return entry("REQUEST", reason ? base : base.replace(/:\s*$/, ""), {
        requestId: str(payload, "requestId"),
        kind: str(payload, "kind"),
        status,
      });
    }
    case "call-entry.changed":
      return entry(
        "CALL",
        fill(labels.crmTexts[8] ?? "", {
          convocatoria: str(payload, "callTitle"),
          estado: label(labels.callEntryStatuses, str(payload, "status")).toLowerCase(),
        }),
        {
          callId: str(payload, "callId"),
          groupId: str(payload, "groupId"),
          status: str(payload, "status"),
        },
      );
    case "permission.granted":
    case "permission.revoked": {
      const permiso = label(labels.permissions, str(payload, "code"));
      return entry(
        "PERMISSION",
        fill(type === "permission.granted" ? text(14) : text(15), { permiso }),
        { code: str(payload, "code"), committeeId: payload.committeeId ?? null },
      );
    }
    default:
      return null;
  }
}
