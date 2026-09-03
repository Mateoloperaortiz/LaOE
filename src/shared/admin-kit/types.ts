import type { z } from "zod";

// Contratos del admin kit (ADR-017). Un módulo declara su recurso; el kit lo lista, edita y exporta.
// El kit no conoce a los módulos: recibe estas definiciones por parámetro.

export interface ListParams {
  q: string;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
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
  | { text: string; href: string };

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
}

/** Quién ejecuta: el kit solo necesita saber su id y si es ADMIN; los comandos reciben el actor completo. */
export interface KitActor {
  personId: string;
  isAdmin: boolean;
}

export interface RowAction<Row> {
  key: string;
  label: string;
  /** Solo se muestra cuando aplica a la fila. */
  applies?(row: Row): boolean;
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
  runRowAction?(actor: KitActor, actionKey: string, id: string): Promise<void>;
  /** Las escrituras exigen un OTP reciente (ADR-010, step-up). */
  stepUp?: boolean;
  /** El export tiene datos personales: step-up y auditoría. */
  personalData?: boolean;
  exportRow(row: Row): Record<string, string | number | null>;
}

// Solo las claves que existen en el inventario de textos.
export type AnyResource = ResourceDefinition<{ id: string }, unknown>;

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
