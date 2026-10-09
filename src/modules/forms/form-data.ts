// Sin dependencias: lo usan las actions y también el navegador, que con esto devuelve a los campos lo que
// la persona escribió cuando la acción no respondió (ADR-118 regla 20). Vive en la raíz del módulo porque
// un componente client no importa `domain/`.

/** Lo que hace falta saber de un campo para leerlo; un `FormField` lo cumple. */
type AnswerField = { key: string; type: string };

/** Lee del FormData los valores de los campos tipados (con el prefijo `f.`) para validarlos. */
export function answersFromFormData(
  formData: FormData,
  fields: readonly AnswerField[],
  prefix = "f.",
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const field of fields) {
    const name = `${prefix}${field.key}`;
    if (field.type === "MULTISELECT") {
      raw[field.key] = formData
        .getAll(name)
        .filter((item): item is string => typeof item === "string");
    } else if (field.type === "CHECKBOX") {
      raw[field.key] = formData.get(name) === "on";
    } else {
      const value = formData.get(name);
      raw[field.key] = typeof value === "string" ? value : "";
    }
  }
  return raw;
}
