import { t } from "@/shared/copy";

// Reglas puras de la dirección del comité (ADR-058): cómo se leen varios cargos y qué cambio de
// cargos puede hacer cada quien. Sin I/O: el comando trae los estados y traduce el código a texto.

export interface RoleView {
  roleCode: string;
  roleLabel: string;
  coDirector: boolean;
}

/**
 * "General y Logística", "Codirección de General", "Financiero, Publicidad y Codirección de
 * Relaciones Públicas"; sin cargos, `fallback` (la etiqueta de Miembro).
 */
export function committeeRolesLabel(roles: readonly RoleView[], fallback: string): string {
  const labels = roles.map((role) =>
    role.coDirector ? t("T-2144", { cargo: role.roleLabel }) : role.roleLabel,
  );
  const last = labels[labels.length - 1];
  if (last === undefined) {
    return fallback;
  }
  if (labels.length === 1) {
    return last;
  }
  return t("T-2178", { lista: labels.slice(0, -1).join(", "), último: last });
}

export interface RoleState extends RoleView {
  isLeadership: boolean;
  required: boolean;
}

export interface DirectionActor {
  /** ADMIN toca su propia fila y puede dejar un cargo obligatorio sin titular. */
  isAdmin: boolean;
  /** Capacidades del actor sobre ese comité; ADMIN y el líder técnico las tienen todas. */
  capabilities: ReadonlySet<string>;
}

export type RolesChangeError = "T-2163" | "T-2167" | "T-2168" | "T-2169";

function sameRole(a: RoleState, b: RoleState): boolean {
  return a.roleCode === b.roleCode && a.coDirector === b.coDirector;
}

/** El cargo obligatorio cuyo titular quedaría vacante con el cambio, si hay alguno. */
export function vacatedRequiredRole(
  current: readonly RoleState[],
  target: readonly RoleState[],
): RoleState | null {
  return (
    current.find(
      (role) =>
        role.required &&
        !role.coDirector &&
        !target.some((item) => item.roleCode === role.roleCode && !item.coDirector),
    ) ?? null
  );
}

/**
 * Primer error de dejar los cargos de una persona como `target`, o null si pasa: nadie toca su propia
 * fila (T-2163); la codirección solo va en cargos de dirección (T-2169); asignar o quitar un cargo de
 * dirección exige `DIRECTION` (T-2167); un director no deja un cargo obligatorio sin titular (T-2168).
 */
export function checkRolesChange(input: {
  actor: DirectionActor;
  isSelf: boolean;
  current: readonly RoleState[];
  target: readonly RoleState[];
}): RolesChangeError | null {
  const { actor, isSelf, current, target } = input;
  if (isSelf && !actor.isAdmin) {
    return "T-2163";
  }
  if (target.some((role) => role.coDirector && !role.isLeadership)) {
    return "T-2169";
  }
  const touchesLeadership =
    current.some((role) => role.isLeadership && !target.some((item) => sameRole(item, role))) ||
    target.some((role) => role.isLeadership && !current.some((item) => sameRole(item, role)));
  if (touchesLeadership && !actor.isAdmin && !actor.capabilities.has("DIRECTION")) {
    return "T-2167";
  }
  if (vacatedRequiredRole(current, target) && !actor.isAdmin) {
    return "T-2168";
  }
  return null;
}

/** El texto de un error de cambio de cargos, con el cargo vacante cuando aplica. */
export function rolesChangeMessage(
  error: RolesChangeError,
  current: readonly RoleState[],
  target: readonly RoleState[],
): string {
  if (error === "T-2168") {
    return t("T-2168", { cargo: vacatedRequiredRole(current, target)?.roleLabel ?? "" });
  }
  return t(error);
}
