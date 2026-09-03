export class NotAuthenticatedError extends Error {
  constructor() {
    super("Sin sesión");
    this.name = "NotAuthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Sin permiso") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class StepUpRequiredError extends Error {
  constructor() {
    super("Esta acción pide un código nuevo");
    this.name = "StepUpRequiredError";
  }
}
