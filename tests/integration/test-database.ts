// Base de datos exclusiva para las pruebas de integración: nunca la de desarrollo, donde corre el poller.

export function testDatabaseUrl(base: string): string {
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
  if (!url.pathname.endsWith("_test")) {
    url.pathname = `${url.pathname}_test`;
  }
  return url.toString();
}
