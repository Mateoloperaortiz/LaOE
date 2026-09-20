// Error de regla de negocio con mensaje para la persona (ya viene del inventario de textos). Vive aquí y
// no en el admin kit: lo lanza el dominio de todos los módulos, que no tiene por qué conocer la UI (ADR-083).
export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
