import { describe, expect, it, vi } from "vitest";
import { DOWNLOAD_SCREEN_PARAM, namedScreen } from "@/app/_lib/download";
import { safeBack, withQuery } from "@/app/_lib/search";
import { safeNextPath } from "@/modules/identity/domain/pure";
import { APP_SCREEN, internalPath } from "@/shared/lib/internal-path";

vi.mock("@/env", () => ({ getEnv: () => ({ APP_URL: "https://oe-sintetica.example" }) }));

// DT-087 (ADR-114, regla 1): una sola regla decide a dónde se vuelve. Las rutas hostiles son las del
// escenario: segmentos de punto, codificados una o varias veces, y barras invertidas.

const ORIGIN = "https://oe-sintetica.example";

/** La ruta que un navegador pide de verdad: la norma de URL resuelve los segmentos de punto. */
function requested(destination: string): string {
  return new URL(destination, ORIGIN).pathname;
}

/** Destinos que el ingreso tiene que descartar, cada uno escrito para salir de `/app`. */
const HOSTILE_NEXT = [
  "/app/../api/mis-datos",
  "/app/./../api/mis-datos",
  "/app/../api/mis-datos?descarga=1",
  "/app/../ingresar",
  "/app/%2e%2e/api/mis-datos",
  "/app/%2E%2E/api/mis-datos",
  "/app/.%2e/api/mis-datos",
  "/app/%2E./api/mis-datos",
  "/app/%252e%252e/api/mis-datos",
  "/app/%25252e%25252e/api/mis-datos",
  "/app/%2525252525252e%2525252525252e/api/mis-datos",
  "/app/..%2fapi/mis-datos",
  "/app/..%5capi/mis-datos",
  "/app\\..\\api\\mis-datos",
  "/app/..\\api/mis-datos",
  "/app/..",
  "/app/.",
  "/app/..#seguridad",
  "/./api/mis-datos",
  "/%2e/api/mis-datos",
  "/%2fotro-sitio.example",
  "/%61pi/mis-datos",
  "/%69ngresar",
  "/app/..\u0001",
];

/** Destinos que la aplicación arma hoy, más los puntos que no son un segmento de punto. */
const LEGIT_NEXT = [
  "/app",
  "/admin",
  "/app/ajustes",
  "/app/ajustes?x=1",
  "/app/ajustes#seguridad",
  "/app/carnet?descarga=1",
  "/app/solicitudes",
  "/app/encuesta/AbC-_123",
  "/app/convocatorias/k3j2h1g0f9",
  "/app/normativa/k3j2h1g0f9?descarga=1",
  "/a/e2eqr00001?c=123456",
  "/admin/segmentos",
  "/admin/permanencia/cierre?termino=2026-2&accion=cerrar",
  "/admin/personas?q=ana+mar%C3%ADa&estado=*&descarga=1",
  "/apisonadora",
  "/app/archivo.v2/..oculto/...",
  "/app/buscar?q=../..&r=%2e%2e&s=\\",
];

describe("el destino después del ingreso (safeNextPath)", () => {
  it("un navegador resuelve los segmentos de punto del escenario a una ruta de /api", () => {
    expect(requested("/app/../api/mis-datos")).toBe("/api/mis-datos");
    expect(requested("/app/%2e%2e/api/mis-datos")).toBe("/api/mis-datos");
    expect(requested("/app\\..\\api\\mis-datos")).toBe("/api/mis-datos");
    expect(requested("/admin/../api/export/personas")).toBe("/api/export/personas");
  });

  it("descarta una ruta con segmentos de punto, también codificados, y con barras invertidas", () => {
    const leaked = HOSTILE_NEXT.filter((hostile) => safeNextPath(hostile) !== "/app");
    expect(leaked).toEqual([]);
  });

  it("deja pasar los destinos que la aplicación arma hoy", () => {
    const rejected = LEGIT_NEXT.filter((legit) => safeNextPath(legit) !== legit);
    expect(rejected).toEqual([]);
  });

  it("descarta un destino de más de 2.000 caracteres y usa el respaldo pedido", () => {
    const longest = `/app/buscar?q=${"a".repeat(1_986)}`;
    expect(longest).toHaveLength(2_000);
    expect(safeNextPath(longest)).toBe(longest);
    expect(safeNextPath(`${longest}a`)).toBe("/app");
    expect(safeNextPath("/app/../api/mis-datos", "/admin")).toBe("/admin");
  });

  it("lo que deja pasar es lo que el navegador pide, y nunca /api ni /ingresar", () => {
    for (const destination of [...HOSTILE_NEXT, ...LEGIT_NEXT]) {
      const next = safeNextPath(destination);
      const path = requested(next);
      expect(path, destination).toBe(next.split(/[?#]/)[0]);
      expect(path, destination).not.toMatch(/^\/(api|ingresar)(\/|$)/);
    }
  });
});

/** Vueltas que una action del admin tiene que descartar: todas empiezan por su área. */
const HOSTILE_BACK = [
  "/admin/../api/mis-datos",
  "/admin/./../api/mis-datos",
  "/admin/../api/export/personas?q=x",
  "/admin/../app/ajustes",
  "/admin/%2e%2e/api/mis-datos",
  "/admin/%2E%2E/api/mis-datos",
  "/admin/.%2E/api/mis-datos",
  "/admin/%252e%252e/api/mis-datos",
  "/admin/..%2fapi/mis-datos",
  "/admin/..%5capi/mis-datos",
  "/admin/..",
  "/admin/.",
  "/admin/ledger/..",
];

describe("la vuelta de una action (safeBack)", () => {
  const fallback = "/admin/ledger";

  it("descarta una vuelta con segmentos de punto, también codificados", () => {
    const leaked = HOSTILE_BACK.filter(
      (hostile) => safeBack(hostile, "/admin", fallback) !== fallback,
    );
    expect(leaked).toEqual([]);
  });

  it("la redirección que arma la action con esa vuelta se queda en su área", () => {
    const escaped = HOSTILE_BACK.map((hostile) =>
      withQuery(safeBack(hostile, "/admin", fallback), { guardado: "1" }),
    ).filter((target) => !target.startsWith("/admin/"));
    expect(escaped).toEqual([]);
  });

  it("acota a una sola sección sin dejar subir a la de al lado", () => {
    const within = "/app/gh-points/coleccion";
    expect(safeBack(`${within}/../retos`, within, within)).toBe(within);
    expect(safeBack(`${within}/%2e%2e/retos`, within, within)).toBe(within);
    expect(safeBack(`${within}/insignias?insignia=x.y`, within, within)).toBe(
      `${within}/insignias?insignia=x.y`,
    );
  });

  it("conserva sus caracteres seguros: sin fragmento, sin dos puntos y sin marcas de HTML", () => {
    for (const unsafe of [
      "/admin/ledger#saldo",
      "/admin/ledger:8080",
      "/admin/ledger?q=<b>",
      "/admin/ledger?q='",
    ]) {
      expect(safeBack(unsafe, "/admin", fallback), unsafe).toBe(fallback);
    }
  });

  it("deja pasar las vueltas que las pantallas arman hoy", () => {
    const legit = [
      "/admin",
      "/admin/ledger?q=ana&persona=k3j2h1g0f9",
      "/admin/personas/abc-123?pestana=datos",
      "/admin/gamificacion/revision?estado=PENDING&q=ana+mar%C3%ADa",
      "/admin/gamificacion/retos/k3j2h1g0f9",
      "/admin/documentos/acta.v2",
    ];
    expect(legit.filter((back) => safeBack(back, "/admin", fallback) !== back)).toEqual([]);
  });
});

describe("la pantalla que nombra una descarga (namedScreen)", () => {
  const fallback = "/admin/personas";
  // Una ruta que reconociera de más: cualquier cosa bajo el admin.
  const lax = /^\/admin\/.*$/;

  function named(screen: string): string {
    return namedScreen(new URLSearchParams({ [DOWNLOAD_SCREEN_PARAM]: screen }), lax, fallback);
  }

  it("descarta los segmentos de punto aunque la ruta de descarga reconozca de más", () => {
    expect(HOSTILE_BACK.filter((hostile) => named(hostile) !== fallback)).toEqual([]);
  });

  it("deja pasar la pantalla que la ruta reconoce, con su búsqueda", () => {
    expect(named("/admin/grupos?q=ana+mar%C3%ADa&estado=*")).toBe(
      "/admin/grupos?q=ana+mar%C3%ADa&estado=*",
    );
    expect(namedScreen(new URLSearchParams(), lax, fallback)).toBe(fallback);
  });
});

describe("la regla que comparten (internalPath)", () => {
  const anywhere = { within: "/", outside: [] };

  it("devuelve el destino tal como llegó, con su búsqueda y su fragmento", () => {
    expect(internalPath("/app/ajustes?x=1#seguridad", APP_SCREEN)).toBe(
      "/app/ajustes?x=1#seguridad",
    );
    expect(internalPath("/admin/ledger", { within: "/admin", outside: [] })).toBe("/admin/ledger");
  });

  it("rechaza lo que no es una ruta de este origen", () => {
    for (const foreign of [
      undefined,
      null,
      42,
      ["/app"],
      { toString: () => "/app" },
      "",
      "app",
      "https://otro-sitio.example/app",
      "//otro-sitio.example",
      "/\\otro-sitio.example",
      "javascript:alert(1)",
      "/app\n",
      "/app/x y",
      "/app/.\t./api",
    ]) {
      expect(internalPath(foreign, anywhere), String(foreign)).toBeNull();
    }
  });

  it("deshace hasta tres capas de codificación y con más no sigue: rechaza", () => {
    expect(internalPath("/app/100%252525", APP_SCREEN)).toBe("/app/100%252525");
    expect(internalPath("/app/%25252e%25252e/x", APP_SCREEN)).toBeNull();
    expect(internalPath("/app/100%25252525", APP_SCREEN)).toBeNull();
    expect(internalPath("/app/%2525252541", APP_SCREEN)).toBeNull();
  });

  it("un % suelto o mal formado no esconde la capa de adentro", () => {
    expect(internalPath("/app/100%", APP_SCREEN)).toBe("/app/100%");
    expect(internalPath("/app/%zz/%252e%252e/api/mis-datos", APP_SCREEN)).toBeNull();
    expect(internalPath("/app/%252e%252e/100%25", APP_SCREEN)).toBeNull();
  });

  it("exige el área a la ruta escrita y a la decodificada", () => {
    const admin = { within: "/admin", outside: [] };
    expect(internalPath("/admin", admin)).toBe("/admin");
    expect(internalPath("/admin?q=x", admin)).toBe("/admin?q=x");
    expect(internalPath("/administrador", admin)).toBeNull();
    expect(internalPath("/%61dmin/ledger", admin)).toBeNull();
    expect(internalPath("/admin%2fledger", admin)).toBeNull();
    expect(internalPath("/api%2fmis-datos", APP_SCREEN)).toBeNull();
    expect(internalPath("/%2561pi/mis-datos", APP_SCREEN)).toBeNull();
  });

  it("un área mal declarada no deja pasar nada", () => {
    expect(internalPath("/app", { within: "", outside: [] })).toBeNull();
    expect(internalPath("/app", { within: "app", outside: [] })).toBeNull();
    expect(internalPath("/app", { within: "/", outside: ["api"] })).toBeNull();
  });
});
