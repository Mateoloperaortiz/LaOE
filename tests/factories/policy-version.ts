/**
 * La versión de la política de privacidad con que corren las pruebas: la de la foto de los catálogos
 * de integración, la de la preparación de la E2E y la de `seedConsent`. La migración 0001 deja
 * `"pendiente"`, que es justo el valor con el que la casa todavía no pide consentimiento.
 *
 * Vive en su archivo, sin imports: la preparación de la suite de integración la lee desde un proceso
 * que no puede cargar la fábrica, que arrastra módulos de solo servidor.
 */
export const TEST_POLICY_VERSION = "prueba-v1";
