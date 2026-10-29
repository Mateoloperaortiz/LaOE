const REVIEW_DATABASE = /^\/inventory_review_[a-z0-9_]+$/;
const STAGING_ORIGIN = "https://web-staging-53f6.up.railway.app";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** La revisión nunca depende de NODE_ENV: exige una base y un origen de revisión explícitos. */
export function inventoryReviewTarget(
  databaseUrl: string,
  appUrl: string,
): { databaseName: string; appOrigin: string } {
  let database: URL;
  let app: URL;
  try {
    database = new URL(databaseUrl);
    app = new URL(appUrl);
  } catch {
    throw new Error("El seed de revisión necesita DATABASE_URL y APP_URL válidos.");
  }
  if (
    !["postgresql:", "postgres:"].includes(database.protocol) ||
    !REVIEW_DATABASE.test(database.pathname) ||
    /prod|oeeafit\.com/i.test(database.hostname)
  ) {
    throw new Error(
      "El seed solo admite bases inventory_review_<identificador> fuera de producción.",
    );
  }
  const local = LOCAL_HOSTS.has(app.hostname) && ["http:", "https:"].includes(app.protocol);
  if (
    (!local && app.origin !== STAGING_ORIGIN) ||
    app.username ||
    app.password ||
    app.pathname !== "/" ||
    app.search ||
    app.hash
  ) {
    throw new Error("APP_URL debe ser el origen fijo de staging o localhost.");
  }
  return { databaseName: database.pathname.slice(1), appOrigin: app.origin };
}
