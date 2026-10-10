import { t, tList } from "@/shared/copy";
import { parseCsv } from "@/shared/lib/csv";
import {
  documentTypeSchema,
  hasInstitutionalDomain,
  normalizePhone,
  parseBirthDate,
} from "./person-pure";

// Reglas puras del roster (13-importacion-del-roster.md, ADR-029, ADR-034): lectura del CSV, mapeo de
// columnas, validación fila por fila y diff contra lo existente. Sin I/O.

export const ROSTER_COLUMNS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "program",
  "committees",
  "entry",
  "status",
  "role",
  "transfer",
  "personalEmail",
  "notes",
  "documentType",
  "documentNumber",
  "epikId",
  "birthDate",
] as const;

export type RosterColumn = (typeof ROSTER_COLUMNS)[number];

/** Cabeceras que se reconocen (ya normalizadas: mayúsculas, sin tildes); la primera es el nombre oficial. */
export const HEADER_ALIASES: Record<RosterColumn, string[]> = {
  firstName: ["NOMBRE", "NOMBRES"],
  lastName: ["APELLIDO", "APELLIDOS"],
  email: ["CORREO", "CORREO INSTITUCIONAL", "EMAIL", "E-MAIL"],
  phone: ["CELULAR", "TELEFONO", "CEL"],
  program: ["PREGRADO", "PROGRAMA", "CARRERA"],
  committees: ["COMITES", "COMITE"],
  entry: ["ENTRADA A LA OE", "ENTRADA", "SEMESTRE DE INGRESO", "INGRESO", "INGRESO A LA OE"],
  status: ["ESTADO"],
  role: ["CARGO", "CARGOS"],
  transfer: ["TRANSFERENCIA"],
  personalEmail: ["CORREO PERSONAL", "EMAIL PERSONAL"],
  notes: ["OBSERVACIONES", "OBSERVACION", "NOTAS"],
  documentType: ["TIPO DE DOCUMENTO"],
  documentNumber: ["DOCUMENTO", "NUMERO DE DOCUMENTO"],
  epikId: ["ID EPIK", "ID DE EPIK"],
  birthDate: ["FECHA DE NACIMIENTO"],
};

/** Columnas sin las cuales una persona nueva no se puede crear (el correo siempre es obligatoria). */
export const REQUIRED_FOR_NEW: readonly RosterColumn[] = [
  "firstName",
  "lastName",
  "email",
  "committees",
  "entry",
  "status",
];

export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeText(raw: string): string {
  return raw.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function detectMapping(headers: string[]): Array<RosterColumn | null> {
  const used = new Set<RosterColumn>();
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    for (const column of ROSTER_COLUMNS) {
      if (!used.has(column) && HEADER_ALIASES[column].includes(normalized)) {
        used.add(column);
        return column;
      }
    }
    return null;
  });
}

export interface RosterRowInput {
  row: number;
  values: Partial<Record<RosterColumn, string>>;
}

/** Filas de datos (sin la cabecera) como valores por columna mapeada; las filas vacías se saltan. */
export function rowsFromCells(
  cells: string[][],
  mapping: Array<RosterColumn | null>,
): RosterRowInput[] {
  const inputs: RosterRowInput[] = [];
  cells.slice(1).forEach((line, index) => {
    const values: Partial<Record<RosterColumn, string>> = {};
    mapping.forEach((column, position) => {
      if (column) {
        values[column] = (line[position] ?? "").trim();
      }
    });
    if (Object.values(values).some((value) => value !== "")) {
      inputs.push({ row: index + 2, values });
    }
  });
  return inputs;
}

const TERM_CODE = /^(\d{4})\s*-\s*([12])$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LATIN_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** `2024-2`, `2024 - 2`, `2024-08-15` o `15/08/2024` → `2024-2`; null si no se entiende. */
export function parseEntryTerm(raw: string): string | null {
  const value = raw.trim().toUpperCase().replace("II", "2").replace("I", "1");
  const code = value.match(TERM_CODE);
  if (code) {
    return `${code[1]}-${code[2]}`;
  }
  const iso = value.match(ISO_DATE);
  if (iso) {
    return `${iso[1]}-${Number(iso[2]) <= 6 ? 1 : 2}`;
  }
  const latin = value.match(LATIN_DATE);
  if (latin) {
    return `${latin[3]}-${Number(latin[2]) <= 6 ? 1 : 2}`;
  }
  return null;
}

export type RosterStatus = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";

const STATUS_WORDS: Record<string, { status: RosterStatus; probation: boolean }> = {
  activo: { status: "ACTIVE", probation: false },
  activa: { status: "ACTIVE", probation: false },
  nuevo: { status: "ACTIVE", probation: false },
  nueva: { status: "ACTIVE", probation: false },
  junta: { status: "ACTIVE", probation: false },
  licencia: { status: "ON_LEAVE", probation: false },
  "en licencia": { status: "ON_LEAVE", probation: false },
  practica: { status: "ON_LEAVE", probation: false },
  intercambio: { status: "ON_LEAVE", probation: false },
  honorario: { status: "HONORARY", probation: false },
  honoraria: { status: "HONORARY", probation: false },
  retirado: { status: "INACTIVE", probation: false },
  retirada: { status: "INACTIVE", probation: false },
  prueba: { status: "ACTIVE", probation: true },
  "en prueba": { status: "ACTIVE", probation: true },
  "periodo de prueba": { status: "ACTIVE", probation: true },
};

export function parseStatus(raw: string): { status: RosterStatus; probation: boolean } | null {
  return STATUS_WORDS[normalizeText(raw)] ?? null;
}

export function splitList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Coeficiente de Dice sobre bigramas: sugerencia de sigla parecida. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (x === y) {
    return 1;
  }
  if (x.length < 2 || y.length < 2) {
    return 0;
  }
  const bigrams = (value: string) => {
    const set = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i += 1) {
      const key = value.slice(i, i + 2);
      set.set(key, (set.get(key) ?? 0) + 1);
    }
    return set;
  };
  const left = bigrams(x);
  const right = bigrams(y);
  let shared = 0;
  for (const [key, n] of left) {
    shared += Math.min(n, right.get(key) ?? 0);
  }
  return (2 * shared) / (x.length - 1 + (y.length - 1));
}

export function suggestCommittee(sigla: string, candidates: string[]): string | null {
  let best: { value: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = similarity(sigla, candidate);
    if (score > 0.4 && (best === null || score > best.score)) {
      best = { value: candidate, score };
    }
  }
  return best?.value ?? null;
}

export interface RosterCommittee {
  id: string;
  slug: string;
  name: string;
  /** Un comité desactivado se reconoce por su sigla, pero no recibe gente (ADR-073 regla 3). */
  status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
}

export interface RosterRole {
  code: string;
  label: string;
  /** Retirado del catálogo de comités (ADR-060 regla 4); el roster lo traduce a `replacedByCode`. */
  retired?: boolean;
  replacedByCode?: string | null;
}

export interface RosterCatalog {
  committees: RosterCommittee[];
  roles: RosterRole[];
  termCodes: string[];
  domains: string[];
  /** Personas que ya existen, por correo: para el modo actualización y para conservar cargos y transferencias. */
  existing: Map<string, ExistingPerson>;
}

export interface ParsedCommittee {
  committeeId: string;
  slug: string;
  name: string;
  /** Cargo principal (el primero de la lista), para quien todavía lee uno solo. */
  roleCode: string;
  /** Todos los cargos de la persona en ese comité, titulares o codirecciones (ADR-058). */
  roles: ParsedRole[];
  /** Cargo que no está en el catálogo: se crea al aplicar (T-486). */
  newRoleLabel?: string;
}

export interface ParsedRole {
  roleCode: string;
  coDirector: boolean;
  /** Cargo que no está en el catálogo: se crea al aplicar (T-486). */
  newLabel?: string;
}

export interface RoleLabelAssignment {
  label: string;
  coDirector: boolean;
}

export interface ValidatedRow {
  row: number;
  email: string | null;
  values: Partial<Record<RosterColumn, string>>;
  firstName?: string;
  lastName?: string;
  phone?: string;
  program?: string;
  personalEmail?: string;
  notes?: string;
  documentType?: string;
  documentNumber?: string;
  epikId?: string;
  birthDate?: string;
  committees?: ParsedCommittee[];
  entryTerm?: string;
  status?: RosterStatus;
  probation?: boolean;
  transferSlug?: string | null;
  errors: string[];
  warnings: string[];
}

export interface RosterValidation {
  rows: ValidatedRow[];
  updateMode: boolean;
  missingRequired: RosterColumn[];
  missingTerms: string[];
  unknownRoles: string[];
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{([a-zA-Zñáéíóú ]+)\}/g,
    (match, key: string) => values[key.trim()] ?? match,
  );
}

export function roleCodeFromLabel(label: string): string {
  return (
    normalizeHeader(label)
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "OTRO"
  );
}

function findRole(label: string, roles: RosterRole[]): RosterRole | null {
  const wanted = normalizeText(label);
  return (
    roles.find(
      (role) => normalizeText(role.label) === wanted || role.code === roleCodeFromLabel(label),
    ) ?? null
  );
}

function findCommittee(sigla: string, committees: RosterCommittee[]): RosterCommittee | null {
  const wanted = normalizeText(sigla);
  return (
    committees.find(
      (item) => normalizeText(item.slug) === wanted || normalizeText(item.name) === wanted,
    ) ?? null
  );
}

/**
 * `General de A3; Logística de A3; Codirección de Financiero de PIXEL` o `General` (un solo comité)
 * → cargos por sigla, varios por comité y con codirección (ADR-058). Devuelve los cargos por sigla
 * normalizada y los errores de forma (índices de T-165).
 */
export function parseRoleAssignments(
  raw: string,
  committees: RosterCommittee[],
  parsed: RosterCommittee[],
): { bySlug: Map<string, RoleLabelAssignment[]>; error: number | null } {
  const bySlug = new Map<string, RoleLabelAssignment[]>();
  const add = (slug: string, item: RoleLabelAssignment) => {
    const list = bySlug.get(slug) ?? [];
    list.push(item);
    bySlug.set(slug, list);
  };
  for (const part of splitList(raw)) {
    // "Codirección de Financiero de PIXEL": con o sin tilde, con o sin guion.
    const co = part.match(/^co-?direcci[oó]n\s+(?:de|del)\s+(.+)$/i);
    const rest = co ? (co[1] ?? "").trim() : part;
    const coDirector = co !== null;
    const match = rest.match(/^(.+?)\s+(?:de|del|en)\s+(.+)$/i);
    if (match) {
      const target = findCommittee((match[2] ?? "").trim(), committees);
      if (!target) {
        return { bySlug, error: 2 };
      }
      add(target.slug, { label: (match[1] ?? "").trim(), coDirector });
      continue;
    }
    if (parsed.length > 1) {
      return { bySlug, error: 7 };
    }
    const only = parsed[0];
    if (only) {
      add(only.slug, { label: rest, coDirector });
    }
  }
  return { bySlug, error: null };
}

function isInstitutional(email: string, domains: string[]): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  return hasInstitutionalDomain(email, domains);
}

function shouted(name: string): boolean {
  const letters = name.replace(/[^\p{L}]/gu, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

export function validateRoster(
  inputs: RosterRowInput[],
  mapping: Array<RosterColumn | null>,
  catalog: RosterCatalog,
): RosterValidation {
  const errorTexts = tList("T-165");
  const warningTexts = tList("T-483");
  const text = (index: number, values: Record<string, string> = {}) =>
    fill(errorTexts[index] ?? "", values);
  const present = new Set(mapping.filter((column): column is RosterColumn => column !== null));
  const missingRequired = REQUIRED_FOR_NEW.filter((column) => !present.has(column));
  const updateMode = missingRequired.length > 0;
  const emailCounts = new Map<string, number>();
  for (const input of inputs) {
    const email = (input.values.email ?? "").trim().toLowerCase();
    if (email) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }
  const titulars = new Map<string, number>();
  const unknownRoles = new Set<string>();
  // Una sigla mal escrita se sugiere solo contra comités vivos (ADR-073 regla 1).
  const siglas = catalog.committees
    .filter((item) => item.status !== "INACTIVE")
    .map((item) => item.slug);

  const rows: ValidatedRow[] = inputs.map((input) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const values = input.values;
    const email = (values.email ?? "").trim().toLowerCase() || null;
    const result: ValidatedRow = { row: input.row, email, values, errors, warnings };
    if (!email || !isInstitutional(email, catalog.domains)) {
      errors.push(text(1));
    } else if ((emailCounts.get(email) ?? 0) > 1) {
      errors.push(text(0));
    }
    const current = email ? catalog.existing.get(email) : undefined;
    if (updateMode && !current) {
      errors.push(text(9));
    }
    if (present.has("firstName")) {
      result.firstName = (values.firstName ?? "").trim();
      if (result.firstName && shouted(result.firstName)) {
        warnings.push(warningTexts[2] ?? "");
      }
    }
    if (present.has("lastName")) {
      result.lastName = (values.lastName ?? "").trim();
    }
    if (!updateMode && (!result.firstName || !result.lastName)) {
      errors.push(text(9));
    }
    if (present.has("phone") && values.phone) {
      const phone = normalizePhone(values.phone);
      result.phone = phone.value;
      if (!phone.normalized) {
        warnings.push(warningTexts[1] ?? "");
      }
    } else if (present.has("phone")) {
      result.phone = "";
    }
    if (present.has("program")) {
      result.program = values.program?.trim() ?? "";
    }
    if (present.has("personalEmail")) {
      result.personalEmail = values.personalEmail?.trim().toLowerCase() ?? "";
    }
    if (present.has("notes")) {
      result.notes = values.notes?.trim() ?? "";
    }
    // Un dato opcional vacío o inválido no borra lo que ya se conoce de la persona (ADR-046).
    for (const field of ["documentNumber", "epikId"] as const) {
      const value = values[field]?.trim();
      if (!present.has(field) || !value) continue;
      if (
        value.length > 80 ||
        [...value].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      ) {
        warnings.push(t("T-2080", { campo: HEADER_ALIASES[field][0] ?? field }));
      } else {
        result[field] = value;
      }
    }
    if (present.has("documentType") && values.documentType?.trim()) {
      const aliases: Record<string, string> = {
        "CEDULA DE CIUDADANIA": "CC",
        "TARJETA DE IDENTIDAD": "TI",
        "CEDULA DE EXTRANJERIA": "CE",
        "CEDULA DE EXTRAJERIA": "CE",
      };
      const normalized = normalizeHeader(values.documentType);
      const parsed = documentTypeSchema.safeParse(aliases[normalized] ?? normalized);
      if (parsed.success) result.documentType = parsed.data;
      else warnings.push(t("T-2080", { campo: HEADER_ALIASES.documentType[0] ?? "" }));
    }
    if (present.has("birthDate") && values.birthDate?.trim()) {
      const parsed = parseBirthDate(values.birthDate.trim());
      if (parsed) result.birthDate = parsed;
      else warnings.push(t("T-2081"));
    }
    if (present.has("status")) {
      const status = parseStatus(values.status ?? "");
      if (!status) {
        errors.push(normalizeText(values.status ?? "") === "graduado" ? t("T-2083") : text(5));
      } else {
        result.status = status.status;
        result.probation = status.probation;
        if (
          status.status !== "INACTIVE" &&
          current?.status === "INACTIVE" &&
          current.endReason === "EXPULSION"
        ) {
          warnings.push(
            t("T-2208", {
              nombre:
                `${result.firstName || current.firstName} ${result.lastName || current.lastName}`.trim(),
            }),
          );
        }
      }
    }
    if (present.has("entry")) {
      const term = parseEntryTerm(values.entry ?? "");
      if (!term) {
        errors.push(text(4));
      } else {
        result.entryTerm = term;
        if (current?.entryTerm && current.entryTerm !== term) {
          errors.push(t("T-2084"));
        }
      }
    }
    const committeesPresent = present.has("committees");
    if (committeesPresent || (present.has("role") && current)) {
      const parsed: RosterCommittee[] = [];
      if (committeesPresent) {
        for (const sigla of splitList(values.committees ?? "")) {
          const target = findCommittee(sigla, catalog.committees);
          if (!target) {
            errors.push(text(2, { sigla, sugerencia: suggestCommittee(sigla, siglas) ?? "—" }));
          } else if (target.status === "INACTIVE") {
            errors.push(t("T-2619", { sigla: target.name }));
          } else if (!parsed.some((item) => item.id === target.id)) {
            parsed.push(target);
          }
        }
        if (parsed.length > 3) {
          errors.push(text(3));
        }
        if (parsed.length === 0 && result.status !== "INACTIVE" && !updateMode) {
          errors.push(text(9));
        }
        // Sin columna ESTADO el roster no reactiva a nadie, y a quien está de baja no se le cambian
        // los comités (ADR-118 regla 11). Con la columna, el caso que no vuelve es el de T-2208.
        if (parsed.length > 0 && !present.has("status") && staysInactive(current, undefined)) {
          warnings.push(
            t("T-3247", {
              nombre:
                `${result.firstName || current?.firstName || ""} ${result.lastName || current?.lastName || ""}`.trim(),
            }),
          );
        }
      } else {
        for (const item of current?.committees ?? []) {
          const target = findCommittee(item.slug, catalog.committees);
          if (target) {
            parsed.push(target);
          }
        }
      }
      const roles = new Map<string, RoleLabelAssignment[]>();
      if (present.has("role") && values.role) {
        const assignments = parseRoleAssignments(values.role, catalog.committees, parsed);
        if (assignments.error !== null) {
          errors.push(text(assignments.error, { sigla: values.role, sugerencia: "—" }));
        }
        for (const [slug, list] of assignments.bySlug) {
          roles.set(slug, list);
        }
      }
      // Sin columna CARGO se conservan los cargos que la persona ya tiene; con la columna, vacío es Miembro.
      const keptRoles = (slug: string): ParsedRole[] =>
        present.has("role")
          ? []
          : existingRoles(
              current?.committees.find((item) => item.slug === slug) ?? { roleCode: "MIEMBRO" },
            ).map((item) => ({ roleCode: item.roleCode, coDirector: item.coDirector }));
      result.committees = parsed.map((target) => {
        const wanted = roles.get(target.slug);
        const parsedRoles: ParsedRole[] = wanted
          ? wanted.map((item) => {
              const role = findRole(item.label, catalog.roles);
              if (role?.retired) {
                const replacement = role.replacedByCode
                  ? catalog.roles.find((known) => known.code === role.replacedByCode)
                  : undefined;
                if (replacement) {
                  warnings.push(t("T-2213", { cargo: role.label, nuevo: replacement.label }));
                  return { roleCode: replacement.code, coDirector: item.coDirector };
                }
                errors.push(t("T-2214", { cargo: role.label }));
              }
              if (role) {
                return { roleCode: role.code, coDirector: item.coDirector };
              }
              unknownRoles.add(item.label);
              return {
                roleCode: roleCodeFromLabel(item.label),
                coDirector: item.coDirector,
                newLabel: item.label,
              };
            })
          : keptRoles(target.slug);
        for (const role of parsedRoles) {
          if (!role.coDirector) {
            const key = `${target.id}:${role.roleCode}`;
            titulars.set(key, (titulars.get(key) ?? 0) + 1);
          }
        }
        const first = parsedRoles.find((role) => !role.newLabel) ?? parsedRoles[0];
        const unknown = parsedRoles.find((role) => role.newLabel)?.newLabel;
        return {
          committeeId: target.id,
          slug: target.slug,
          name: target.name,
          roleCode: first?.roleCode ?? "MIEMBRO",
          roles: parsedRoles,
          ...(unknown !== undefined ? { newRoleLabel: unknown } : {}),
        };
      });
    }
    if (!present.has("transfer")) {
      result.transferSlug = current?.committees.find((item) => item.transferredIn)?.slug ?? null;
    } else {
      const raw = values.transfer?.trim() ?? "";
      if (raw) {
        const target = findCommittee(raw, catalog.committees);
        if (!target) {
          errors.push(text(2, { sigla: raw, sugerencia: suggestCommittee(raw, siglas) ?? "—" }));
        } else {
          result.transferSlug = target.slug;
        }
      } else {
        result.transferSlug = null;
      }
    }
    return result;
  });

  // Un solo titular por cargo, comité y término (ADR-058): la codirección no cuenta.
  for (const row of rows) {
    for (const item of row.committees ?? []) {
      for (const role of item.roles.filter((role) => !role.coDirector)) {
        if ((titulars.get(`${item.committeeId}:${role.roleCode}`) ?? 0) > 1) {
          const label = catalog.roles.find((known) => known.code === role.roleCode)?.label;
          row.errors.push(
            text(8, { comité: item.name, cargo: label ?? role.newLabel ?? role.roleCode }),
          );
        }
      }
    }
  }
  return {
    rows,
    updateMode,
    missingRequired,
    missingTerms: [
      ...new Set(
        rows
          .filter(
            (row) =>
              row.errors.length === 0 &&
              row.entryTerm &&
              !catalog.termCodes.includes(row.entryTerm),
          )
          .map((row) => row.entryTerm as string),
      ),
    ].sort(),
    unknownRoles: [...unknownRoles].sort(),
  };
}

export interface ExistingPerson {
  personId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  program: string | null;
  personalEmail: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  epikId?: string | null;
  birthDate?: string | null;
  entryTerm?: string | null;
  /** Motivo de la salida cuando está retirada; una expulsión no se reactiva por el roster (ADR-060 regla 3). */
  endReason?: string | null;
  status: RosterStatus | null;
  probation: boolean;
  committees: Array<{
    slug: string;
    roleCode: string;
    /** Todos los cargos vivos (ADR-058); si falta, se deriva del cargo principal. */
    roles?: Array<{ roleCode: string; coDirector: boolean }>;
    transferredIn: boolean;
  }>;
}

/** Los cargos de una pertenencia existente, derivados del principal cuando la lectura no los trae. */
export function existingRoles(item: {
  roleCode: string;
  roles?: Array<{ roleCode: string; coDirector: boolean }>;
}): Array<{ roleCode: string; coDirector: boolean }> {
  if (item.roles) {
    return item.roles;
  }
  return item.roleCode !== "MIEMBRO" ? [{ roleCode: item.roleCode, coDirector: false }] : [];
}

/**
 * Quien está de baja y sigue de baja después de esta fila: sin columna ESTADO el roster no toca el
 * estado, y a quien fue expulsado no lo reactiva ni con ella (ADR-060 regla 3). A esa persona el
 * roster no le cambia los comités (ADR-118 regla 11) ni la fila del término (ADR-120 regla 1).
 */
export function staysInactive(
  current: Pick<ExistingPerson, "status" | "endReason"> | undefined,
  wanted: RosterStatus | undefined,
): boolean {
  if (current?.status !== "INACTIVE") {
    return false;
  }
  return wanted === undefined || wanted === "INACTIVE" || current.endReason === "EXPULSION";
}

export type DiffGroup = "NEW" | "CHANGED" | "UNCHANGED" | "ERROR";

export interface DiffRow {
  row: ValidatedRow;
  group: DiffGroup;
  changes: RosterColumn[];
}

/** Qué cambiaría en cada persona; las columnas ausentes no cuentan (modo actualización). */
export function diffRoster(rows: ValidatedRow[], existing: Map<string, ExistingPerson>): DiffRow[] {
  return rows.map((row) => {
    if (row.errors.length > 0) {
      return { row, group: "ERROR", changes: [] };
    }
    const current = row.email ? existing.get(row.email) : undefined;
    if (!current) {
      return { row, group: "NEW", changes: [] };
    }
    const changes: RosterColumn[] = [];
    if (row.firstName !== undefined && row.firstName !== current.firstName)
      changes.push("firstName");
    if (row.lastName !== undefined && row.lastName !== current.lastName) changes.push("lastName");
    if (row.phone !== undefined && row.phone !== (current.phone ?? "")) changes.push("phone");
    if (row.program !== undefined && row.program !== (current.program ?? ""))
      changes.push("program");
    if (row.personalEmail !== undefined && row.personalEmail !== (current.personalEmail ?? "")) {
      changes.push("personalEmail");
    }
    for (const field of ["documentType", "documentNumber", "epikId", "birthDate"] as const) {
      if (row[field] !== undefined && row[field] !== (current[field] ?? "")) changes.push(field);
    }
    // Lo que el roster no va a escribir no es un cambio: quien sigue de baja conserva su estado
    // (ADR-060 regla 3, con el aviso T-2208 si fue expulsado) y su fila del término, con la prueba
    // que tuviera (ADR-120 regla 1).
    const keepsOut = staysInactive(current, row.status);
    if (row.status !== undefined && row.status !== current.status && !keepsOut) {
      changes.push("status");
    }
    // A quien ya existe sin membresía el roster se la crea, traiga o no ESTADO el archivo: pasa a
    // tener estado, y eso es un cambio aunque ninguna columna lo diga (ADR-120 regla 2).
    if (current.status === null) {
      changes.push("status");
    }
    if (row.probation !== undefined && row.probation !== current.probation && !keepsOut) {
      changes.push("status");
    }
    if (row.committees !== undefined && row.status !== "INACTIVE" && !keepsOut) {
      const rolesKey = (roles: Array<{ roleCode: string; coDirector: boolean }>) =>
        roles
          .map((role) => `${role.roleCode}${role.coDirector ? "*" : ""}`)
          .sort()
          .join("+");
      const wanted = row.committees
        .map((item) => `${item.slug}:${rolesKey(item.roles)}:${row.transferSlug === item.slug}`)
        .sort()
        .join("|");
      const have = current.committees
        .map((item) => `${item.slug}:${rolesKey(existingRoles(item))}:${item.transferredIn}`)
        .sort()
        .join("|");
      if (wanted !== have) changes.push("committees");
    }
    return {
      row,
      group: changes.length > 0 ? "CHANGED" : "UNCHANGED",
      changes: [...new Set(changes)],
    };
  });
}

export { parseCsv };
