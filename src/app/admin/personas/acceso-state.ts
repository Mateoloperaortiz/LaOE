import type { AccessGrantKind } from "@/modules/identity";

// Un archivo "use server" solo exporta funciones, así que el estado del formulario vive acá.
// El enlace emitido viaja en este estado y en ningún otro lado: no se guarda ni se vuelve a mostrar.
export interface IssueGrantState {
  personId: string | null;
  url: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  error: string | null;
  /**
   * El tipo de enlace que queda elegido en el formulario. Solo viene cuando la emisión no tuvo respuesta
   * (ADR-118 regla 20); con una respuesta de la casa el campo vuelve a activación, como antes.
   */
  kind?: AccessGrantKind;
}

export const initialIssueGrantState: IssueGrantState = {
  personId: null,
  url: null,
  qrSvg: null,
  expiresAt: null,
  error: null,
};

/**
 * La emisión no tuvo respuesta: el panel conserva lo que mostraba, pinta el aviso y deja elegido el tipo
 * de enlace que se pidió. Sin esto el campo vuelve solo a activación y el reintento emite el otro tipo.
 */
export function issueGrantRejected({
  previous,
  payload,
  message,
}: {
  previous: IssueGrantState;
  payload: FormData;
  message: string;
}): IssueGrantState {
  return {
    ...previous,
    error: message,
    kind: payload.get("kind") === "RECOVERY" ? "RECOVERY" : "ACTIVATION",
  };
}
