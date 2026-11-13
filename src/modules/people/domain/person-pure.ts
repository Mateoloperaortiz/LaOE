import { z } from "zod";
import { APP_TIME_ZONE, dateKeyIn } from "@/shared/lib/dates-pure";

// Reglas puras sobre datos de la persona (sin I/O).

/** Dominio institucional exacto o cualquiera de sus subdominios. Única definición de la regla. */
export function hasInstitutionalDomain(email: string, domains: readonly string[]): boolean {
  const domain = email.split("@")[1] ?? "";
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** UID físico de cuatro bytes; la representación guardada conserva ceros y usa pares en mayúsculas. */
export const CARD_UID_PATTERN = /^[0-9A-F]{2}(?: [0-9A-F]{2}){3}$/;

export function normalizeCardUid(raw: string): string {
  const compact = raw.trim().toUpperCase().replace(/[ :-]/g, "");
  return /^[0-9A-F]{8}$/.test(compact)
    ? (compact.match(/.{2}/g) ?? []).join(" ")
    : raw.trim().toUpperCase();
}

export const cardUidSchema = z
  .string()
  .transform(normalizeCardUid)
  .pipe(z.string().regex(CARD_UID_PATTERN));

export const DOCUMENT_TYPE_CODES = ["CC", "TI", "CE", "PPT"] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPE_CODES);

/** Fecha civil ISO real y no futura; no convierte el nacimiento a un instante en Bogotá. */
export function parseBirthDate(
  value: string,
  today = dateKeyIn(APP_TIME_ZONE, new Date()),
): string | null {
  const date = value.trim();
  if (!z.iso.date().safeParse(date).success || date.startsWith("0000-") || date > today) {
    return null;
  }
  return date;
}

export const birthDateSchema = z
  .string()
  .trim()
  .refine((value) => parseBirthDate(value) !== null);

/** Presenta el mismo día del calendario guardado, sin el desplazamiento UTC → Bogotá. */
export function formatBirthDate(value: string): string {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", dateStyle: "long" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

export interface NormalizedPhone {
  value: string;
  /** Verdadero cuando quedó en el formato canónico `+57` + 10 dígitos (13-importacion-del-roster.md). */
  normalized: boolean;
}

/** Diez dígitos que empiezan en 3 (con o sin +57) → `+57XXXXXXXXXX`; cualquier otra cosa se conserva tal cual. */
export function normalizePhone(raw: string): NormalizedPhone {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[\s().-]/g, "");
  if (/^\+?57\d{10}$/.test(digits)) {
    return { value: `+57${digits.slice(-10)}`, normalized: true };
  }
  if (/^3\d{9}$/.test(digits)) {
    return { value: `+57${digits}`, normalized: true };
  }
  return { value: trimmed, normalized: false };
}
