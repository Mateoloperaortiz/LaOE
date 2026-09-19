// Lectura de FormData en las server actions (ADR-082). Una sola definición de cada regla: antes había
// 23 copias de `text`, dos de ellas sin recortar, y la diferencia importa.

/** Campo de texto recortado; ausente o archivo cuenta como vacío. */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Campo tal como llegó, sin recortar: contraseñas y cualquier valor donde un espacio es parte del dato. */
export function formRaw(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Campo recortado, o `undefined` si quedó vacío: para opcionales que Zod no debe ver como `""`. */
export function formOptional(formData: FormData, name: string): string | undefined {
  return formText(formData, name) || undefined;
}
