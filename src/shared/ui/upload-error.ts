// El texto de una subida que falló (ADR-118 regla 22). Un `fetch` que rechaza lanza un `TypeError` con el
// texto del navegador («Failed to fetch», «Load failed») y una action que falla trae el párrafo en inglés
// de Next: ninguno es para la persona. Solo se muestra el motivo de un fallo que la casa lanzó a propósito.

/** Un fallo con un motivo que la persona puede leer: un texto del inventario o lo que respondió la casa. */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** El motivo si el fallo es de la casa; si no, el texto del inventario que pasa quien llama. */
export function uploadErrorMessage(error: unknown, fallback: string): string {
  return error instanceof UploadError ? error.message : fallback;
}
