// Bases exclusivas para las pruebas de integración: nunca la de desarrollo, donde corre el poller.
// Cada ranura concurrente de Vitest (`VITEST_POOL_ID`) usa la suya, para que el vaciado entre
// pruebas de un archivo no borre lo que otro archivo está escribiendo en paralelo.

const MAX_INTEGRATION_WORKERS = 4;
const WORKER_SUFFIX = /_test(?:_w\d+)?$/;

type WorkerEnv = Readonly<Record<string, string | undefined>>;

function positiveWorkerCount(raw: string | undefined, label: string): number {
  if (raw === undefined || raw === "") return 1;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} debe ser un entero entre 1 y ${MAX_INTEGRATION_WORKERS}`);
  }
  const value = Number(raw);
  if (value < 1 || value > MAX_INTEGRATION_WORKERS) {
    throw new Error(`${label} debe ser un entero entre 1 y ${MAX_INTEGRATION_WORKERS}`);
  }
  return value;
}

/** Cuántos archivos de integración pueden correr a la vez en este proceso. */
export function integrationWorkers(env: WorkerEnv = process.env): number {
  const raw = env.INTEGRATION_WORKERS;
  return raw === undefined || raw === "" ? 2 : positiveWorkerCount(raw, "INTEGRATION_WORKERS");
}

/** La ranura de Vitest de este proceso; sin Vitest o en serie es la primera. */
export function integrationPoolId(
  env: WorkerEnv = process.env,
  workers = integrationWorkers(env),
): number {
  const poolId = positiveWorkerCount(env.VITEST_POOL_ID, "VITEST_POOL_ID");
  if (poolId > workers) {
    throw new Error(
      `VITEST_POOL_ID=${poolId} no tiene base preparada: INTEGRATION_WORKERS vale ${workers}`,
    );
  }
  return poolId;
}

/** ¿Apunta la URL a una base de integración, de la ranura que sea? Para guardas de subprocesos. */
export function isTestDatabaseUrl(value: string): boolean {
  try {
    return WORKER_SUFFIX.test(new URL(value).pathname);
  } catch {
    return false;
  }
}

export function testDatabaseUrl(base: string, poolId = 1): string {
  const url = new URL(base);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)
  ) {
    throw new Error(
      "La suite de integración necesita una base PostgreSQL local con nombre explícito",
    );
  }
  if (!Number.isInteger(poolId) || poolId < 1 || poolId > MAX_INTEGRATION_WORKERS) {
    throw new Error(`La ranura de integración debe estar entre 1 y ${MAX_INTEGRATION_WORKERS}`);
  }
  const stem = url.pathname.replace(WORKER_SUFFIX, "");
  url.pathname = poolId === 1 ? `${stem}_test` : `${stem}_test_w${poolId}`;
  return url.toString();
}

/** La URL de cada base que `global-setup.ts` debe dejar migrada antes de repartir archivos. */
export function testDatabaseUrls(base: string, workers: number): string[] {
  if (!Number.isInteger(workers) || workers < 1 || workers > MAX_INTEGRATION_WORKERS) {
    throw new Error(`INTEGRATION_WORKERS debe ser un entero entre 1 y ${MAX_INTEGRATION_WORKERS}`);
  }
  return Array.from({ length: workers }, (_, index) => testDatabaseUrl(base, index + 1));
}
