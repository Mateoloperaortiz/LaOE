import type { InteractionKind } from "../schema";

// Traduce un evento de dominio a una entrada de la línea de tiempo (02-crm.md). Sin I/O: los nombres
// de términos, comités y cargos llegan por `lookup` y los textos por `labels` (T-458 y catálogos).

/** Eventos que producen una interacción automática (01-arquitectura.md). */
export const TIMELINE_EVENTS = [
  "person.imported",
  "membership.changed",
  "committee-membership.changed",
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
  "points.adjusted",
  "points.reversed",
  "evaluation.recorded",
  "leader-score.recorded",
  "manual-credit.granted",
  "work-group-membership.changed",
  "permanence.decided",
] as const;

export interface TimelineLabels {
  /** Los dieciséis textos de T-458, en orden. */
  texts: string[];
  /** Los textos de participación de T-667, en orden (fase 3). */
  participationTexts: string[];
  /** Los textos de permanencia de T-832, en orden (fase 4). */
  permanenceTexts: string[];
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
  personId: string;
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
  const personId = str(payload, "personId");
  if (!personId) {
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
        .map((item) =>
          item && typeof item === "object"
            ? `${lookup.committeeName(str(item as Record<string, unknown>, "committeeId"))} · ${lookup.roleLabel(str(item as Record<string, unknown>, "roleCode"))}`
            : "",
        )
        .filter(Boolean);
      return entry(
        "COMMITTEES",
        fill(text(4), {
          término: lookup.termCode(str(payload, "termId")),
          comités: names.length > 0 ? names.join(", ") : "—",
        }),
      );
    }
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
