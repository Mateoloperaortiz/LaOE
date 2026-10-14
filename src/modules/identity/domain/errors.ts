export class ForbiddenError extends Error {
  constructor(message = "Sin permiso") {
    super(message);
    this.name = "ForbiddenError";
  }
}
