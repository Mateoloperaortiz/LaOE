/**
 * Contra qué servidor corre la E2E (ADR-123 regla 1, DT-338). `build` es `next start` sobre lo
 * compilado, que es lo que prueba el CI. `dev` compila cada ruta la primera vez que se visita:
 * sirve para iterar sobre unas pocas, pero una corrida completa sin nada compilado lo atasca
 * hacia su minuto 8 y lo que cae ahí se queda sin tiempo.
 */
type E2eServer = "build" | "dev";

type Source = Readonly<Record<string, string | undefined>>;

/**
 * Opciones de `playwright test` que se llevan el argumento siguiente: ese valor no es un archivo.
 * Las de valor opcional (`--debug`, `--only-changed`, `-u`) también lo toman si no empieza por `-`.
 * La prueba unitaria la compara con el `--help` del Playwright instalado.
 */
const VALUE_OPTIONS = new Set([
  "--browser",
  "-c",
  "--config",
  "--debug",
  "-G",
  "--grep-invert",
  "--global-timeout",
  "-j",
  "--workers",
  "--last-failed-file",
  "--max-failures",
  "--only-changed",
  "--output",
  "--repeat-each",
  "--reporter",
  "--retries",
  "--run-agents",
  "--shard",
  "--test-list",
  "--test-list-invert",
  "--timeout",
  "--trace",
  "--tsconfig",
  "-u",
  "--update-snapshots",
  "--ui-host",
  "--ui-port",
  "--update-source-method",
]);
/** Se lleva todos los argumentos que sigan hasta la próxima opción. */
const VARIADIC_OPTIONS = new Set(["--project"]);

/**
 * Un filtro de archivos o de nombre: `E2E_FILES`, un archivo posicional, `--grep` o `-g`. Lo demás
 * que recorta una corrida (`--grep-invert`, `--last-failed`, `--shard`) no cuenta: puede dejarla
 * casi entera, y equivocarse hacia el build solo cuesta compilar.
 *
 * Un archivo o un nombre vacío tampoco cuenta: Playwright no recorta nada con él y corre la suite
 * entera, que es lo que llega con `-g "$PATRON"` y la variable sin definir. `E2E_FILES` vacía sí
 * cuenta, porque la configuración de Playwright la rechaza y no corre nada.
 */
function hasFilter(env: Source, args: readonly string[]): boolean {
  if (env.E2E_FILES !== undefined) return true;
  let taken: "none" | "next" | "rest" = "none";
  for (const [index, arg] of args.entries()) {
    if (arg === "--") return args.slice(index + 1).some((file) => file !== "");
    if (arg === "-g" || arg === "--grep") {
      if (args[index + 1] !== "") return true;
      taken = "next";
      continue;
    }
    if (arg.startsWith("--grep=")) {
      if (arg !== "--grep=") return true;
      taken = "none";
      continue;
    }
    if (arg.startsWith("-")) {
      if (arg.includes("=")) taken = "none";
      else if (VARIADIC_OPTIONS.has(arg)) taken = "rest";
      else taken = VALUE_OPTIONS.has(arg) ? "next" : "none";
      continue;
    }
    if (taken === "none" && arg !== "") return true;
    if (taken === "next") taken = "none";
  }
  return false;
}

/** `E2E_SERVER` fuerza un modo; vacía equivale a no escrita y un valor que no se reconoce se rechaza. */
function forcedServer(env: Source): E2eServer | null {
  const value = env.E2E_SERVER;
  if (value === undefined || value === "") return null;
  if (value !== "build" && value !== "dev") {
    throw new Error(`E2E_SERVER debe ser build o dev, no «${value}»`);
  }
  return value;
}

/**
 * Decide el servidor de una corrida y si el lanzador compila antes. En el CI va contra el build y
 * no compila, porque lo hizo su propio paso; en local, sin filtro va contra el build y con filtro
 * contra dev.
 */
export function planE2eServer(
  env: Source,
  args: readonly string[],
): { server: E2eServer; compile: boolean } {
  const ci = Boolean(env.CI);
  const server = forcedServer(env) ?? (ci || !hasFilter(env, args) ? "build" : "dev");
  return { server, compile: server === "build" && !ci };
}

/**
 * Lo que el lanzador ya decidió y dejó escrito en `E2E_SERVER` para Playwright, que no vuelve a
 * mirar los argumentos: sin esa marca no hay servidor que elegir.
 */
export function decidedE2eServer(env: Source): E2eServer {
  const server = forcedServer(env);
  if (!server) throw new Error("Falta E2E_SERVER: el servidor de la E2E lo decide su lanzador");
  return server;
}

/**
 * El entorno con que el lanzador compila: el de la corrida, con su mismo origen (`APP_URL`), y lo
 * que fija el paso «Build de producción para e2e» del CI. El OTP fijo va vacío y no ausente: Next
 * lee el `.env` al compilar y no pisa una variable que ya viene escrita. Solo lo admite después
 * el proceso de pruebas, que corre con `NODE_ENV=test`.
 */
export function e2eBuildEnvironment(
  env: Source,
): Record<string, string | undefined> & { NODE_ENV: "production"; OTP_FIXED_CODE: "" } {
  return { ...env, NODE_ENV: "production", OTP_FIXED_CODE: "" };
}
