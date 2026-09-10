// Un archivo "use server" solo exporta funciones, así que el estado del formulario vive acá.
// El enlace emitido viaja en este estado y en ningún otro lado: no se guarda ni se vuelve a mostrar.
export interface IssueGrantState {
  personId: string | null;
  url: string | null;
  qrSvg: string | null;
  expiresAt: string | null;
  error: string | null;
}

export const initialIssueGrantState: IssueGrantState = {
  personId: null,
  url: null,
  qrSvg: null,
  expiresAt: null,
  error: null,
};
