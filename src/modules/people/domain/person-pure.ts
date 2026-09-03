// Reglas puras sobre datos de la persona (sin I/O).

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
