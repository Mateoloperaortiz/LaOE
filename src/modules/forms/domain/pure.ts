import { z } from "zod";
import { normalizePhone } from "@/modules/people";

// Formularios propios sin I/O (ADR-013, ADR-037): esquema de campos y de acciones, validación de las
// respuestas por tipo, estado de apertura y constantes del rate limit. Los textos de error viajan como
// códigos de copy (T-853 a T-857) y los resuelve quien pinta.

export const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "SELECT",
  "MULTISELECT",
  "CHECKBOX",
  "DATE",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** Claves que, al crear la persona, se copian a sus datos (celular y programa). */
export const RESERVED_KEYS = ["phone", "program"] as const;

/** Nombre del campo trampa del formulario público: un humano no lo ve ni lo llena. */
export const HONEYPOT_FIELD = "sitio_web";

/** Rate limit por IP entre todos los formularios públicos, contado en form_submission como el OTP. */
export const FORM_WINDOW_MS = 15 * 60_000;
export const FORM_MAX_PER_IP = 10;

export const FORM_SLUG = /^[a-z0-9-]{2,60}$/;
export const FIELD_KEY = /^[a-z0-9_]{1,40}$/;

const baseField = z.object({
  key: z.string().trim().regex(FIELD_KEY),
  label: z.string().trim().min(1).max(120),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().default(false),
  help: z.string().trim().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
});

export const fieldSchema = baseField.superRefine((field, ctx) => {
  const needsOptions = field.type === "SELECT" || field.type === "MULTISELECT";
  if (needsOptions && (!field.options || field.options.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "T-927" });
  }
});

export type FormField = z.infer<typeof fieldSchema>;

export const fieldsSchema = z
  .array(fieldSchema)
  .max(40)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, index) => {
      if (seen.has(field.key)) {
        ctx.addIssue({ code: "custom", path: [index, "key"], message: "T-926" });
      }
      seen.add(field.key);
    });
  });

const actionsBase = z.object({
  createPerson: z.boolean().default(false),
  pipelineId: z.string().trim().min(1).optional(),
  editionId: z.string().trim().min(1).optional(),
  tagIds: z.array(z.string().trim().min(1)).max(20).default([]),
});

/** Entrar a un pipeline o inscribirse a una edición exige crear la persona (ADR-037 regla 3). */
export const actionsSchema = actionsBase.transform((actions) => ({
  ...actions,
  createPerson: actions.createPerson || Boolean(actions.pipelineId) || Boolean(actions.editionId),
}));

export type FormActions = z.infer<typeof actionsSchema>;

export function parseFields(raw: unknown): FormField[] {
  const parsed = fieldsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function parseActions(raw: unknown): FormActions {
  const parsed = actionsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { createPerson: false, tagIds: [] };
}

export type FormOpenState = "OPEN" | "CLOSED" | "FULL";

export interface FormWindow {
  status: "DRAFT" | "OPEN" | "CLOSED";
  opensAt: Date | null;
  closesAt: Date | null;
  maxSubmissions: number | null;
}

/** Abierto cuando está OPEN, dentro de su ventana y por debajo del tope (ADR-037 regla 3). */
export function formOpenState(
  form: FormWindow,
  submissions: number,
  now = new Date(),
): FormOpenState {
  if (form.status !== "OPEN") {
    return "CLOSED";
  }
  if (form.opensAt && now < form.opensAt) {
    return "CLOSED";
  }
  if (form.closesAt && now >= form.closesAt) {
    return "CLOSED";
  }
  if (form.maxSubmissions !== null && submissions >= form.maxSubmissions) {
    return "FULL";
  }
  return "OPEN";
}

export type AnswerValue = string | string[] | boolean;

export type AnswersResult =
  | { ok: true; answers: Record<string, AnswerValue> }
  | { ok: false; errors: Record<string, string> };

const email = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function readText(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function readList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string").map((s) => s.trim());
  }
  return typeof raw === "string" && raw.trim() ? [raw.trim()] : [];
}

function validDate(value: string): boolean {
  if (!isoDate.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Valida las respuestas contra los campos del formulario: obligatorios, correo, celular normalizado,
 * opción de la lista, selección múltiple, casilla y fecha. Devuelve valores limpios por clave.
 */
export function validateAnswers(fields: FormField[], raw: Record<string, unknown>): AnswersResult {
  const answers: Record<string, AnswerValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = raw[field.key];
    switch (field.type) {
      case "TEXT":
      case "TEXTAREA": {
        const text = readText(value).slice(0, field.type === "TEXT" ? 200 : 4000);
        if (!text && field.required) {
          errors[field.key] = "T-853";
        } else if (text) {
          answers[field.key] = text;
        }
        break;
      }
      case "EMAIL": {
        const text = readText(value);
        if (!text) {
          if (field.required) errors[field.key] = "T-853";
          break;
        }
        const parsed = email.safeParse(text);
        if (!parsed.success) {
          errors[field.key] = "T-854";
        } else {
          answers[field.key] = parsed.data;
        }
        break;
      }
      case "PHONE": {
        const text = readText(value);
        if (!text) {
          if (field.required) errors[field.key] = "T-853";
          break;
        }
        const phone = normalizePhone(text);
        if (!/^\+?[\d\s().-]{7,20}$/.test(phone.value)) {
          errors[field.key] = "T-855";
        } else {
          answers[field.key] = phone.value;
        }
        break;
      }
      case "SELECT": {
        const text = readText(value);
        if (!text) {
          if (field.required) errors[field.key] = "T-853";
          break;
        }
        if (!(field.options ?? []).includes(text)) {
          errors[field.key] = "T-856";
        } else {
          answers[field.key] = text;
        }
        break;
      }
      case "MULTISELECT": {
        const list = readList(value).filter(Boolean);
        if (list.length === 0) {
          if (field.required) errors[field.key] = "T-853";
          break;
        }
        const options = field.options ?? [];
        if (list.some((item) => !options.includes(item))) {
          errors[field.key] = "T-856";
        } else {
          answers[field.key] = [...new Set(list)];
        }
        break;
      }
      case "CHECKBOX": {
        const checked = value === true || value === "on" || value === "true" || value === "1";
        if (!checked && field.required) {
          errors[field.key] = "T-853";
        } else {
          answers[field.key] = checked;
        }
        break;
      }
      case "DATE": {
        const text = readText(value);
        if (!text) {
          if (field.required) errors[field.key] = "T-853";
          break;
        }
        if (!validDate(text)) {
          errors[field.key] = "T-857";
        } else {
          answers[field.key] = text;
        }
        break;
      }
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

/** Datos de la persona nueva que salen de las claves reservadas de la respuesta. */
export function personDataFromAnswers(answers: Record<string, AnswerValue>): {
  phone?: string;
  program?: string;
} {
  const phone = answers.phone;
  const program = answers.program;
  return {
    ...(typeof phone === "string" && phone ? { phone } : {}),
    ...(typeof program === "string" && program ? { program } : {}),
  };
}

/** Nombre, apellido y correo: implícitos en un formulario público. */
export const publicIdentitySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email,
});
