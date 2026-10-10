import type { z } from "zod";

// Contratos del admin kit (ADR-017). Un módulo declara su recurso; el kit lo lista, edita y exporta.
// El kit no conoce a los módulos: recibe estas definiciones por parámetro.

export interface ListParams {
  q: string;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
  /** Quién lista: para filtros como "mis tareas". */
  actor?: KitViewer;
}

export interface ListResult<Row> {
  rows: Row[];
  total: number;
}

export type Badge =
  | "amarillo"
  | "naranja"
  | "azul"
  | "sky"
  | "navy"
  | "paper"
  | "cream"
  | "yellow-soft";

export type CellValue =
  | string
  | number
  | null
  | { text: string; badge: Badge }
  // `note` va debajo del enlace: lo que hay que saber antes de seguirlo (ADR-121 regla 12).
  | { text: string; href: string; note?: string };

export interface Column<Row> {
  key: string;
  label: string;
  render(row: Row): CellValue;
  className?: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDefinition {
  key: string;
  label: string;
  options: FilterOption[];
}

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "checkbox"
  | "url"
  | "email"
  | "color";

export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  options?: FilterOption[];
  /** Etiqueta de la opción vacía de un select (por defecto "—"). */
  emptyOption?: string;
  required?: boolean;
  help?: string;
  /** No se puede cambiar al editar (por ejemplo, una sigla). */
  lockedOnEdit?: boolean;
  placeholder?: string;
  /** Alto de un textarea en líneas (por defecto 5; los cuerpos en Markdown piden más). */
  rows?: number;
  /** Tipografía de código solo para editores de Markdown, JSON u otros formatos. */
  textVariant?: "prose" | "code";
}

/** Quién lista o exporta: el kit solo necesita saber su id y si es ADMIN. */
export interface KitViewer {
  personId: string;
  isAdmin: boolean;
}

/**
 * Quién escribe por el kit: el actor del comando tal como lo arma `actorContext` (ADR-082 regla 2;
 * ADR-116 regla 10), con la IP del request y nada más de la sesión. El recurso lo entrega entero a
 * `runCommand` o a su comando «As»: es lo que lleva la IP a la auditoría. `ip` no es opcional; `null`
 * dice que el request no la trajo.
 */
export interface KitActor {
  personId: string;
  ip: string | null;
}

export interface RowAction<Row> {
  key: string;
  label: string;
  /** Solo se muestra cuando aplica a la fila. */
  applies?(row: Row): boolean;
}

export interface RowLink<Row> {
  key: string;
  label: string;
  href(row: Row): string;
  ariaLabel?(row: Row): string;
}

export interface ResourceDefinition<Row extends { id: string }, Input> {
  key: string;
  names: { singular: string; plural: string };
  basePath: string;
  columns: Column<Row>[];
  /** Filtros de la barra; una función cuando las opciones salen de la base (comités, segmentos). */
  filters?: FilterDefinition[] | (() => Promise<FilterDefinition[]>);
  schema: z.ZodType<Input, unknown>;
  fields: FieldDefinition[] | (() => Promise<FieldDefinition[]>);
  list(params: ListParams): Promise<ListResult<Row>>;
  get(id: string): Promise<Row | null>;
  toFormValues(row: Row): Record<string, string>;
  create?(actor: KitActor, input: Input): Promise<{ id: string }>;
  update?(actor: KitActor, id: string, input: Input): Promise<void>;
  rowActions?: RowAction<Row>[];
  /** Accesos visibles a las vistas del registro, junto a Editar. */
  rowLinks?: RowLink<Row>[];
  runRowAction?(actor: KitActor, actionKey: string, id: string): Promise<void>;
  /** Las escrituras exigen un OTP reciente (ADR-010, step-up). */
  stepUp?: boolean;
  /**
   * El export tiene datos personales: paso de seguridad reciente y fila de auditoría `export.csv`.
   * Obligatoria: un recurso que no la declara no compila (ADR-119 regla 9).
   */
  personalData: boolean;
  /** Quién puede listar y exportar: solo ADMIN (por defecto) o también la junta (ADR-036 regla 12). */
  access?: "ADMIN" | "ADMIN_OR_BOARD";
  exportRow(row: Row): Record<string, string | number | null>;
}

// Solo las claves que existen en el inventario de textos.
export type AnyResource = ResourceDefinition<{ id: string }, unknown>;

/** Recursos por clave. Dos con la misma clave es un error de registro: el segundo taparía al primero. */
export function indexResources(resources: readonly AnyResource[]): Map<string, AnyResource> {
  const byKey = new Map<string, AnyResource>();
  for (const resource of resources) {
    if (byKey.has(resource.key)) {
      throw new Error(`Recurso del admin registrado dos veces: ${resource.key}`);
    }
    byKey.set(resource.key, resource);
  }
  return byKey;
}

export async function resolveFilters(resource: AnyResource): Promise<FilterDefinition[]> {
  return typeof resource.filters === "function" ? resource.filters() : (resource.filters ?? []);
}

export interface FormState {
  ok: boolean;
  message: string | null;
  errors: Record<string, string>;
  values: Record<string, string>;
}

/** Separador de los valores de un multiselect dentro de `FormState.values`. */
/**
 * Tope de filas de un exporte CSV (ADR-118 regla 13). Lo que pasa de ahí no viaja: el archivo, la
 * pantalla y la auditoría lo dicen.
 */
export const EXPORT_ROW_LIMIT = 10_000;

export const MULTI_SEPARATOR = "";

/** Convierte un FormData en un objeto plano según los campos: vacíos a undefined, checkbox a booleano, multiselect a lista. */
export function formDataToInput(
  formData: FormData,
  fields: FieldDefinition[],
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === "checkbox") {
      const raw = formData.get(field.name);
      input[field.name] = raw === "on" || raw === "true";
      continue;
    }
    if (field.type === "multiselect") {
      input[field.name] = formData
        .getAll(field.name)
        .filter((item): item is string => typeof item === "string" && item.trim() !== "");
      continue;
    }
    const raw = formData.get(field.name);
    const value = typeof raw === "string" ? raw.trim() : "";
    input[field.name] = value === "" ? undefined : value;
  }
  return input;
}

export function formDataToValues(
  formData: FormData,
  fields: FieldDefinition[],
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === "multiselect") {
      values[field.name] = formData
        .getAll(field.name)
        .filter((item): item is string => typeof item === "string")
        .join(MULTI_SEPARATOR);
      continue;
    }
    const raw = formData.get(field.name);
    values[field.name] = typeof raw === "string" ? raw : "";
  }
  return values;
}

/** Los campos inmutables conservan el valor del servidor, aunque el cliente los omita o cambie. */
export function withLockedFormValues(
  formData: FormData,
  fields: FieldDefinition[],
  storedValues: Record<string, string>,
): FormData {
  const result = new FormData();
  for (const [key, value] of formData) result.append(key, value);
  for (const field of fields) {
    if (!field.lockedOnEdit) continue;
    result.delete(field.name);
    const value = storedValues[field.name] ?? "";
    if (field.type === "multiselect") {
      for (const selected of value ? value.split(MULTI_SEPARATOR) : []) {
        result.append(field.name, selected);
      }
    } else {
      result.set(field.name, value);
    }
  }
  return result;
}
