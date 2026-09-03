// Base de datos exclusiva para las pruebas de integración: nunca la de desarrollo, donde corre el poller.

export function testDatabaseUrl(base: string): string {
  const url = new URL(base);
  if (!url.pathname.endsWith("_test")) {
    url.pathname = `${url.pathname}_test`;
  }
  return url.toString();
}
