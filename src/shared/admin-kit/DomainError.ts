// Error de regla de negocio con mensaje para la persona (ya viene del inventario de textos).
export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
