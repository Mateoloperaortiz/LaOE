// El id con el que llega un alcance (ADR-122 regla 1; ADR-123 regla 19). Un comando recibe el objeto
// de su página y lo lee por acá: el tipo dice que el alcance viene, pero quien llama puede no haber
// pasado por TypeScript, así que lo que no sea un texto con algo no es un id. Comparar ese id con la
// fila, y decidir qué se responde si falta, es de cada comando.

/** El id, o `null` si lo que llegó no es un texto con algo. */
export function asScopeId(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** El id que el alcance trae bajo `key`, o `null` si el alcance no llegó, no lo trae o no es un id. */
export function scopeId(scope: unknown, key: string): string | null {
  return asScopeId((scope as Record<string, unknown> | null | undefined)?.[key]);
}
