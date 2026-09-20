import { permissionGranted, permissionRevoked } from "@/domain-events/identity";
import {
  appointmentChanged,
  committeeMembershipChanged,
  committeeRemovalRequested,
  consentChanged,
  membershipChanged,
  membershipTermChanged,
  personAdmitted,
  personAnonymized,
  personDeletionRequested,
  personEmailChanged,
  personImported,
  personUpdated,
  sanctionRecorded,
  sanctionRevoked,
  stageChanged,
} from "@/domain-events/people";
import { personDataExported } from "@/domain-events/system";
import { committeeRolesLabel } from "@/modules/people";
import { fill, label, rule, type TimelineRule } from "./kit";

// La persona y su membresía: roster, estados, comités, cargos, consentimientos, datos, sanciones y permisos.

export const PEOPLE_RULES: readonly TimelineRule[] = [
  rule(personImported, ({ termCode }, { labels }) => ({
    kind: "IMPORTED",
    summary: fill(labels.texts[0] ?? "", { término: termCode }),
  })),

  rule(membershipChanged, ({ from, to, reason, endReason }, { labels }) => {
    if (!from) {
      // La membresía nace con "dar de alta": lo anota person.admitted.
      return null;
    }
    const motivo = reason || endReason || "—";
    const metadata = { from, to };
    if (to === "INACTIVE") {
      return { kind: "MEMBERSHIP", summary: fill(labels.texts[2] ?? "", { motivo }), metadata };
    }
    if (from === "INACTIVE") {
      return { kind: "MEMBERSHIP", summary: labels.texts[3] ?? "", metadata };
    }
    return {
      kind: "MEMBERSHIP",
      summary: fill(labels.texts[1] ?? "", {
        de: label(labels.statuses, from),
        a: label(labels.statuses, to),
        motivo,
      }),
      metadata,
    };
  }),

  rule(committeeMembershipChanged, ({ termId, committees }, { labels, lookup }) => {
    const names = committees.map((row) => {
      const roles = row.roles.map((role) => ({
        roleCode: role.roleCode,
        roleLabel: lookup.roleLabel(role.roleCode),
        coDirector: role.coDirector,
      }));
      // Una pertenencia sin cargos registrados se cuenta por su cargo principal.
      const cargo =
        roles.length > 0
          ? committeeRolesLabel(roles, lookup.roleLabel("MIEMBRO"))
          : lookup.roleLabel(row.roleCode);
      return `${lookup.committeeName(row.committeeId)} · ${cargo}`;
    });
    return {
      kind: "COMMITTEES",
      summary: fill(labels.texts[4] ?? "", {
        término: lookup.termCode(termId),
        comités: names.length > 0 ? names.join(", ") : "—",
      }),
    };
  }),

  rule(committeeRemovalRequested, ({ committeeId, termId, reason }, { labels, lookup }) => ({
    kind: "COMMITTEES",
    summary: fill(labels.directionTexts[0] ?? "", {
      comité: lookup.committeeName(committeeId),
      motivo: reason || "—",
    }),
    metadata: { committeeId, termId },
  })),

  rule(appointmentChanged, ({ action, kind, termId }, { labels, lookup }) => {
    const cargo = label(labels.appointmentKinds, kind);
    return {
      kind: "APPOINTMENT",
      summary:
        action === "REMOVED"
          ? fill(labels.texts[6] ?? "", { cargo })
          : fill(labels.texts[5] ?? "", { cargo, término: lookup.termCode(termId) }),
    };
  }),

  rule(consentChanged, ({ purpose, action }, { labels }) => {
    const propósito = label(labels.purposes, purpose);
    return {
      kind: "CONSENT",
      summary: fill(labels.texts[action === "REVOKED" ? 8 : 7] ?? "", { propósito }),
    };
  }),

  rule(personUpdated, ({ fields }, { labels }) => ({
    kind: "DATA",
    summary: fill(labels.texts[9] ?? "", {
      campos: fields.map((field) => label(labels.fields, field)).join(", "),
    }),
  })),
  rule(personEmailChanged, (_payload, { labels }) => ({
    kind: "DATA",
    summary: labels.texts[10] ?? "",
  })),
  rule(personDeletionRequested, (_payload, { labels }) => ({
    kind: "DATA",
    summary: labels.texts[11] ?? "",
  })),
  rule(personDataExported, (_payload, { labels }) => ({
    kind: "DATA",
    summary: labels.texts[12] ?? "",
  })),
  rule(personAnonymized, (_payload, { labels }) => ({
    kind: "DATA",
    summary: labels.texts[13] ?? "",
  })),

  rule(stageChanged, ({ from, to }, { labels }) => ({
    kind: "MEMBERSHIP",
    summary: fill(labels.crmTexts[4] ?? "", { etapa: label(labels.stages, to) }),
    metadata: { from, to },
  })),

  rule(personAdmitted, ({ termId, termCode, committees }, { labels, lookup }) => ({
    kind: "MEMBERSHIP",
    summary: fill(labels.crmTexts[5] ?? "", {
      término: termCode || lookup.termCode(termId),
      comités: committees.join(", "),
    }),
    metadata: { termId },
  })),

  rule(membershipTermChanged, ({ termId, committeeId, probation, reason }, { labels, lookup }) => {
    // Con comité usa los textos décimo y undécimo de T-832 (ADR-060 regla 2).
    const index = committeeId ? (probation ? 9 : 10) : probation ? 7 : 8;
    return {
      kind: "PERMANENCE",
      summary: fill(labels.permanenceTexts[index] ?? "", {
        término: lookup.termCode(termId),
        comité: committeeId ? lookup.committeeName(committeeId) : "",
        motivo: reason || "—",
      }),
      metadata: { termId, committeeId: committeeId || null, probation },
    };
  }),

  rule(sanctionRecorded, ({ sanctionId, kind, cause }, { labels }) => ({
    kind: "MEMBERSHIP",
    summary: fill(labels.sanctionTexts?.[0] ?? "", {
      tipo: label(labels.sanctionKinds ?? {}, kind),
      causal: cause,
    }),
    metadata: { sanctionId, kind },
  })),
  rule(sanctionRevoked, ({ sanctionId, kind, reason }, { labels }) => ({
    kind: "MEMBERSHIP",
    summary: fill(labels.sanctionTexts?.[1] ?? "", {
      tipo: label(labels.sanctionKinds ?? {}, kind),
      motivo: reason || "—",
    }),
    metadata: { sanctionId, kind },
  })),

  rule(permissionGranted, ({ code, committeeId }, { labels }) => ({
    kind: "PERMISSION",
    summary: fill(labels.texts[14] ?? "", { permiso: label(labels.permissions, code) }),
    metadata: { code, committeeId },
  })),
  rule(permissionRevoked, ({ code, committeeId }, { labels }) => ({
    kind: "PERMISSION",
    summary: fill(labels.texts[15] ?? "", { permiso: label(labels.permissions, code) }),
    metadata: { code, committeeId },
  })),
];
