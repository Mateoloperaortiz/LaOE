// La única regla para decidir a dónde se vuelve dentro de este origen (ADR-114, regla 1). La usan
// el destino del ingreso (`safeNextPath`), la vuelta de una action (`safeBack`) y la pantalla que
// nombra una descarga (`namedScreen`).

/** Dónde puede quedar un destino. Los dos lados se declaran siempre: no hay área por omisión. */
export interface InternalPathArea {
  /** El destino es esta ruta o queda debajo de ella; `"/"` es todo el origen. */
  readonly within: string;
  /** El destino no es ninguna de estas rutas ni queda debajo de ellas. */
  readonly outside: readonly string[];
}

/** Una pantalla de la aplicación: cualquier ruta propia salvo el ingreso y la API (05-acceso.md). */
export const APP_SCREEN: InternalPathArea = { within: "/", outside: ["/ingresar", "/api"] };

// Capas de codificación que se deshacen antes de decidir. Una ruta de la aplicación no trae ninguna
// en sus segmentos; con más de tres no se sigue: se rechaza.
const MAX_ENCODING_LAYERS = 3;

/**
 * La ruta con cada `%XX` cambiado por su byte, capa por capa, hasta que no queda ninguno. Va byte a
 * byte porque solo sirve para decidir: lo que se busca (`.`, `/`, `\` y los nombres de las áreas) es
 * ASCII, y un `%` suelto o mal formado se queda como está en vez de frenar las capas de adentro.
 */
function decodedPath(path: string): string | null {
  let current = path;
  for (let layer = 0; layer <= MAX_ENCODING_LAYERS; layer += 1) {
    const next = current.replace(/%([0-9a-f]{2})/gi, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
    if (next === current) {
      return current;
    }
    current = next;
  }
  return null;
}

/** Espacios y caracteres de control: el navegador los quita antes de resolver la ruta. */
function hasSpaceOrControl(value: string): boolean {
  if (/\s/.test(value)) {
    return true;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function under(path: string, area: string): boolean {
  return area === "/" || path === area || path.startsWith(`${area}/`);
}

function inArea(path: string, { within, outside }: InternalPathArea): boolean {
  return under(path, within) && !outside.some((area) => under(path, area));
}

/**
 * El destino tal como llegó, si es una ruta de este origen que el navegador va a pedir tal como está
 * escrita y queda en el área; si no, `null`, y quien llama pone su respaldo.
 *
 * Rechaza lo que no es texto ni empieza por `/`, los espacios y caracteres de control, y, mirando la
 * ruta (sin búsqueda ni fragmento) ya decodificada: las barras invertidas, el `//` inicial y los
 * segmentos `.` y `..`, que el navegador resuelve aunque vengan como `%2e`. El área se exige a la
 * ruta escrita y a la decodificada: un prefijo codificado ni entra a un área ni sale de una vedada.
 */
export function internalPath(input: unknown, area: InternalPathArea): string | null {
  if (typeof input !== "string" || !input.startsWith("/") || hasSpaceOrControl(input)) {
    return null;
  }
  if (![area.within, ...area.outside].every((declared) => declared.startsWith("/"))) {
    return null;
  }
  const path = input.split(/[?#]/)[0] ?? "";
  const decoded = decodedPath(path);
  if (decoded === null || decoded.includes("\\") || decoded.startsWith("//")) {
    return null;
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return inArea(path, area) && inArea(decoded, area) ? input : null;
}
