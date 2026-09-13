import { z } from "zod";

// Solicitudes sin I/O (ADR-031, ADR-037): un payload por tipo y el conjunto de comités que resulta de un
// cambio para el semestre siguiente. El orden de REQUEST_KINDS es el de T-139 y T-894.

export const REQUEST_KINDS = ["LEAVE", "RESIGNATION", "TRANSFER", "EXCUSE"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const reason = z.string().trim().min(2).max(500);
const email = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

export const leavePayloadSchema = z.object({
  reason,
  /** Regreso previsto, obligatorio: desde mañana y hasta un año (Est. art. 5.4; ADR-060 regla 10). */
  until: z.iso.date(),
});

export const resignationPayloadSchema = z.object({
  reason,
  memorialConsent: z.boolean().default(false),
  contactConsent: z.boolean().default(false),
  personalEmail: email.optional(),
});

/** Causales de excusa válida del Anexo 1 del Reglamento, en el orden de T-2215 (ADR-060 regla 5). */
export const EXCUSE_CAUSES = [
  "ACADEMIC",
  "MEDICAL_APPOINTMENT",
  "MEDICAL_LEAVE",
  "EMERGENCY",
  "BEREAVEMENT",
  "WORK",
  "INSTITUTIONAL",
  "MOBILITY",
  "FAMILY",
  "LEGAL",
  "REPRESENTATION",
  "TECHNICAL",
  "SAFETY",
  "FORCE_MAJEURE",
] as const;
export type ExcuseCause = (typeof EXCUSE_CAUSES)[number];

/** Días hábiles después de la ocasión en que todavía se presenta una excusa (Anexo 1, parágrafo 1). */
export const EXCUSE_BUSINESS_DAYS = 3;

export const excusePayloadSchema = z.object({
  occasionId: z.string().trim().min(1, "T-2222"),
  cause: z.enum(EXCUSE_CAUSES, { message: "T-2222" }),
  reason,
  /** Soporte: un enlace o una descripción; opcional (Anexo 1, parágrafo 2). */
  evidence: z.string().trim().max(500).optional(),
});

export type ExcusePayload = z.infer<typeof excusePayloadSchema>;

export const transferPayloadSchema = z
  .object({
    leaveCommitteeIds: z.array(z.string().trim().min(1)).default([]),
    joinCommitteeIds: z.array(z.string().trim().min(1)).default([]),
    reason,
  })
  .superRefine((payload, ctx) => {
    if (payload.leaveCommitteeIds.length === 0 && payload.joinCommitteeIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["joinCommitteeIds"], message: "T-887" });
    }
    if (payload.joinCommitteeIds.some((id) => payload.leaveCommitteeIds.includes(id))) {
      ctx.addIssue({ code: "custom", path: ["joinCommitteeIds"], message: "T-887" });
    }
  });

export type LeavePayload = z.infer<typeof leavePayloadSchema>;
export type ResignationPayload = z.infer<typeof resignationPayloadSchema>;
export type TransferPayload = z.infer<typeof transferPayloadSchema>;

export const REQUEST_PAYLOAD_SCHEMAS = {
  LEAVE: leavePayloadSchema,
  RESIGNATION: resignationPayloadSchema,
  TRANSFER: transferPayloadSchema,
  EXCUSE: excusePayloadSchema,
} as const;

export interface CommitteeChange {
  /** Comités que siguen (con su cargo actual) más los nuevos, marcados como transferencia. */
  rows: Array<{ committeeId: string; roleCode: string; transferredIn: boolean }>;
  /** T-886 si el conjunto sale del rango; T-887 si no cambia nada. */
  error: "T-886" | "T-887" | null;
}

/** Conjunto de comités del término siguiente tras un cambio aprobado (ADR-037 regla 9). */
export function resultingCommittees(
  current: Array<{ committeeId: string; roleCode: string }>,
  payload: Pick<TransferPayload, "leaveCommitteeIds" | "joinCommitteeIds">,
  limits: { min: number; max: number },
): CommitteeChange {
  const kept = current.filter((row) => !payload.leaveCommitteeIds.includes(row.committeeId));
  const joining = payload.joinCommitteeIds.filter(
    (id) => !current.some((row) => row.committeeId === id),
  );
  const rows = [
    ...kept.map((row) => ({
      committeeId: row.committeeId,
      roleCode: row.roleCode,
      transferredIn: false,
    })),
    ...joining.map((committeeId) => ({ committeeId, roleCode: "MIEMBRO", transferredIn: true })),
  ];
  if (kept.length === current.length && joining.length === 0) {
    return { rows, error: "T-887" };
  }
  if (rows.length < limits.min || rows.length > limits.max) {
    return { rows, error: "T-886" };
  }
  return { rows, error: null };
}
