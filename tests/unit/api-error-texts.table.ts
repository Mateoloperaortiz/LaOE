import type { ErrorText } from "../helpers/api-error-texts";

// El inventario de los textos con que las rutas de `src/app/api` responden un error, clasificado
// (DT-345, ADR-129 regla 13). Lo compara `tests/unit/api-error-texts.test.ts` con lo que lee del
// código: un texto que no está acá la pone en rojo, y una fila que ya no corresponde a ninguno,
// también. Ninguna ruta cambió lo que responde para entrar a esta tabla: dice lo que hay.
//
// Las clases:
// - `shown`: está escrito en la ruta y una persona lo puede leer, porque un componente pone
//   `body.error` en pantalla o porque a la ruta se llega por un enlace y el navegador pinta el
//   cuerpo. Es la deuda: no pasó por `docs/14-copy-y-textos.md` ni tiene la voz de ADR-086. Qué lee
//   esa persona espera la decisión abierta 82; hasta entonces una fila `shown` no cambia de texto.
// - `unread`: está escrito en la ruta y lo recibe un programa que mira solo el status. Es
//   diagnóstico para quien depura, no copy.
// - `catalog`: ya sale del catálogo, por su código.
// - `passed`: la ruta deja pasar un mensaje que no escribió, el de un error del dominio o el de una
//   lectura. La fila fija la expresión, no el texto: lo que diga se escribe donde nace.
//
// `reader` dice quién lo recibe, con el archivo donde se comprobó. Si cambia quién llama a una ruta
// (un componente que empieza a mostrar `body.error`, un enlace nuevo), cambia la clase de sus filas.

/** Con qué status sale y por dónde viaja, como lo lee el lector, y cuántas veces. */
type RowSite = Pick<ErrorText, "status" | "via"> & {
  /** Cuántas veces está escrito así en el archivo; una si no se dice. */
  count?: number;
};

export type ErrorTextRow = RowSite &
  (
    | { class: "shown" | "unread"; text: string; reader: string }
    | { class: "catalog"; code: string }
    | { class: "passed"; expression: string }
  );

const MEDIA_UPLOADERS =
  "Lo toma `houseMessage` (`src/shared/ui/bucket-upload.ts`) como el mensaje del rechazo y lo muestran `MediaUploader` en /admin/medios y `PhotoUploader` en la foto de perfil de /app/ajustes.";
const DOCUMENT_UPLOADER =
  "Lo toma `houseMessage` (`src/shared/ui/bucket-upload.ts`) como el mensaje del rechazo y lo muestra `DocumentUploader` en /admin/documentos.";
const ROSTER_UPLOADER =
  "Lo muestra `RosterUploader` en /admin/personas/importar, que pone `body.error` en pantalla cuando la casa rechaza el archivo.";
const EVIDENCE_UPLOADER =
  "El subidor de evidencias (`EvidenceUploader`) muestra su propio texto ante cualquier fallo y no repite lo que diga la casa.";
const PUSH_CLIENT =
  "El cliente de push (`push-client.ts`) mira solo `response.ok` y el 409 al guardar, y no lee la respuesta al borrar.";
const LIVE_CONSOLE =
  "La consola en vivo (`ConsolaEnVivo`) mira solo `response.ok` y pasa a su estado de rechazo sin leer el cuerpo.";
const ONE_CLICK =
  "El POST de un clic (RFC 8058) lo manda el cliente de correo desde la cabecera `List-Unsubscribe`, sin interfaz.";
const CALENDAR_APP =
  "La URL con su token se copia de /app/ajustes (`CalendarLink`) a una aplicación de calendario, que se suscribe y no le muestra el cuerpo a nadie.";
const MEDIA_LINK =
  "El nombre de cada archivo de /admin/medios enlaza a esta ruta y el navegador pinta el cuerpo; un `<img>` no lo muestra.";
const DOCUMENT_LINKS =
  "Los lectores de /app/normativa/[id] y de /admin/documentos/[id] enlazan a esta ruta y el navegador pinta el cuerpo.";
const EVIDENCE_LINKS =
  "Las evidencias de /admin/gamificacion/revision y de /admin/gamificacion/retos/[id] enlazan a esta ruta y el navegador pinta el cuerpo.";
const EXPORT_LINKS =
  "Los enlaces de exportar del admin (`ResourcePage`, /admin/junta, la mesa de cumplimiento y los segmentos) abren esta ruta y el navegador pinta el cuerpo.";
const PERSONAL_DATA_LINKS =
  "Los enlaces de /app/ajustes y de /autorizacion abren esta ruta y el navegador pinta el cuerpo.";
const SHOWCASE_LINK =
  "El enlace «Ver la vitrina pública» (T-2809) de /admin/the-games/[id] abre esta ruta y el navegador pinta el JSON; DÍAS (`src/lib/use-the-games.ts` del repo `dias`) mira solo el status.";
const DIAS_TEAM_ROUTE =
  "La pide DÍAS (`src/ui/the-games/Recorrido.tsx` del repo `dias`), que mira solo `response.ok`, y ninguna pantalla de la casa enlaza a esta ruta.";
const DIAS_HUB_4XX =
  "La pide DÍAS (`src/lib/hub.ts` del repo `dias`), que toma `body.error` como el mensaje de un 4xx y lo muestra en el hub de capitanes; a un origen que no está permitido el navegador no le deja leerlo.";
const DIAS_HUB_5XX =
  "La pide DÍAS (`src/lib/hub.ts` del repo `dias`), que trata un 5xx como falta de conexión y no usa `body.error`.";

/** Por archivo, con la ruta desde `src/app/api`. */
export const API_ERROR_TEXTS: Record<string, readonly ErrorTextRow[]> = {
  "admin/importaciones/roster/route.ts": [
    { status: 401, via: "error", class: "shown", text: "Sin sesión", reader: ROSTER_UPLOADER },
    { status: 403, via: "error", class: "shown", text: "Solo ADMIN", reader: ROSTER_UPLOADER },
    { status: 400, via: "error", class: "catalog", code: "T-488", count: 2 },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "baja/[token]/route.ts": [
    { status: 400, via: "body", class: "unread", text: "Token inválido", reader: ONE_CLICK },
    { status: 404, via: "body", class: "unread", text: "Token inválido", reader: ONE_CLICK },
  ],
  "documentos/[id]/pdf/route.ts": [
    {
      status: 404,
      via: "body",
      class: "shown",
      text: "No existe",
      reader: DOCUMENT_LINKS,
      count: 2,
    },
    { status: 403, via: "body", class: "shown", text: "Solo con sesión", reader: DOCUMENT_LINKS },
  ],
  "documentos/confirm/route.ts": [
    { status: 401, via: "error", class: "shown", text: "Sin sesión", reader: DOCUMENT_UPLOADER },
    { status: 403, via: "error", class: "shown", text: "Solo ADMIN", reader: DOCUMENT_UPLOADER },
    {
      status: 400,
      via: "error",
      class: "shown",
      text: "Petición inválida",
      reader: DOCUMENT_UPLOADER,
    },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "documentos/presign/route.ts": [
    { status: 401, via: "error", class: "shown", text: "Sin sesión", reader: DOCUMENT_UPLOADER },
    { status: 403, via: "error", class: "shown", text: "Solo ADMIN", reader: DOCUMENT_UPLOADER },
    {
      status: 400,
      via: "error",
      class: "shown",
      text: "Petición inválida",
      reader: DOCUMENT_UPLOADER,
    },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "export/[tipo]/route.ts": [
    { status: 404, via: "body", class: "shown", text: "No existe", reader: EXPORT_LINKS },
    { status: 403, via: "body", class: "shown", text: "Solo ADMIN", reader: EXPORT_LINKS },
  ],
  "health/route.ts": [
    { status: null, via: "error", class: "passed", expression: "database.error" },
  ],
  "ics/mi-agenda.ics/route.ts": [
    {
      status: 404,
      via: "body",
      class: "unread",
      text: "No existe",
      reader: CALENDAR_APP,
      count: 2,
    },
  ],
  "media/[id]/route.ts": [
    { status: 404, via: "body", class: "shown", text: "No existe", reader: MEDIA_LINK, count: 2 },
    { status: 403, via: "body", class: "shown", text: "Solo con sesión", reader: MEDIA_LINK },
  ],
  "media/confirm/route.ts": [
    { status: 401, via: "error", class: "shown", text: "Sin sesión", reader: MEDIA_UPLOADERS },
    {
      status: 400,
      via: "error",
      class: "shown",
      text: "Petición inválida",
      reader: MEDIA_UPLOADERS,
    },
    { status: 403, via: "error", class: "shown", text: "Solo ADMIN", reader: MEDIA_UPLOADERS },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "media/presign/route.ts": [
    { status: 401, via: "error", class: "shown", text: "Sin sesión", reader: MEDIA_UPLOADERS },
    {
      status: 400,
      via: "error",
      class: "shown",
      text: "Petición inválida",
      reader: MEDIA_UPLOADERS,
    },
    { status: 403, via: "error", class: "shown", text: "Solo ADMIN", reader: MEDIA_UPLOADERS },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "mis-datos/route.ts": [
    { status: 404, via: "body", class: "shown", text: "No existe", reader: PERSONAL_DATA_LINKS },
  ],
  "ocasiones/[id]/live/route.ts": [
    { status: 401, via: "error", class: "unread", text: "sin sesión", reader: LIVE_CONSOLE },
    { status: 404, via: "error", class: "unread", text: "no existe", reader: LIVE_CONSOLE },
    { status: 403, via: "error", class: "unread", text: "sin permiso", reader: LIVE_CONSOLE },
  ],
  "push/subscribe/route.ts": [
    {
      status: 401,
      via: "error",
      class: "unread",
      text: "Sin sesión",
      reader: PUSH_CLIENT,
      count: 2,
    },
    {
      status: 400,
      via: "error",
      class: "unread",
      text: "Suscripción inválida",
      reader: PUSH_CLIENT,
    },
    { status: 400, via: "error", class: "unread", text: "Petición inválida", reader: PUSH_CLIENT },
    { status: null, via: "error", class: "passed", expression: "error.message" },
  ],
  "retos/evidencia/[id]/route.ts": [
    {
      status: 404,
      via: "body",
      class: "shown",
      text: "No existe",
      reader: EVIDENCE_LINKS,
      count: 2,
    },
    { status: 403, via: "body", class: "shown", text: "Solo el autor", reader: EVIDENCE_LINKS },
  ],
  "retos/evidencia/presign/route.ts": [
    { status: 401, via: "error", class: "unread", text: "Sin sesión", reader: EVIDENCE_UPLOADER },
    {
      status: 400,
      via: "error",
      class: "unread",
      text: "Petición inválida",
      reader: EVIDENCE_UPLOADER,
    },
    { status: 403, via: "error", class: "catalog", code: "T-2442" },
    { status: 403, via: "error", class: "catalog", code: "T-2440" },
    { status: 400, via: "error", class: "passed", expression: "error.message" },
  ],
  "v1/the-games/[slug]/equipos/[numero]/route.ts": [
    { status: 404, via: "error", class: "unread", text: "no existe", reader: DIAS_TEAM_ROUTE },
    { status: 503, via: "error", class: "unread", text: "no disponible", reader: DIAS_TEAM_ROUTE },
  ],
  "v1/the-games/[slug]/route.ts": [
    {
      status: 404,
      via: "error",
      class: "shown",
      text: "no existe",
      reader: SHOWCASE_LINK,
      count: 2,
    },
    { status: 503, via: "error", class: "shown", text: "no disponible", reader: SHOWCASE_LINK },
  ],
  "v1/the-games/hub/apuestas/route.ts": [
    {
      status: 403,
      via: "error",
      class: "shown",
      text: "origen no permitido",
      reader: DIAS_HUB_4XX,
    },
    { status: 503, via: "error", class: "unread", text: "no disponible", reader: DIAS_HUB_5XX },
    { status: 401, via: "error", class: "catalog", code: "T-3038", count: 2 },
    { status: 400, via: "error", class: "catalog", code: "T-260", count: 2 },
    { status: null, via: "error", class: "passed", expression: "error.message" },
  ],
  "v1/the-games/hub/route.ts": [
    { status: 503, via: "error", class: "unread", text: "no disponible", reader: DIAS_HUB_5XX },
    { status: 401, via: "error", class: "catalog", code: "T-3038" },
  ],
  "v1/the-games/hub/sesion/route.ts": [
    {
      status: 403,
      via: "error",
      class: "shown",
      text: "origen no permitido",
      reader: DIAS_HUB_4XX,
      count: 2,
    },
    { status: 503, via: "error", class: "unread", text: "no disponible", reader: DIAS_HUB_5XX },
    { status: 400, via: "error", class: "catalog", code: "T-3036" },
    { status: 401, via: "error", class: "catalog", code: "T-3038" },
    { status: 409, via: "error", class: "passed", expression: "result.message" },
    { status: null, via: "error", class: "passed", expression: "result.message" },
  ],
};
