// Traduce los errores de PostgreSQL que el dominio necesita distinguir.

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

interface PgErrorShape {
  code?: string;
  constraint?: string;
}

function findPgError(error: unknown): PgErrorShape | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth += 1) {
    const candidate = current as PgErrorShape & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

/** Nombre del índice o restricción violada, o null si el error es de otro tipo. */
function uniqueViolationConstraint(error: unknown): string | null {
  const pgError = findPgError(error);
  return pgError?.code === UNIQUE_VIOLATION ? (pgError.constraint ?? "") : null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const violated = uniqueViolationConstraint(error);
  return violated !== null && (constraint === undefined || violated === constraint);
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const pgError = findPgError(error);
  return (
    pgError?.code === CHECK_VIOLATION &&
    (constraint === undefined || pgError.constraint === constraint)
  );
}
