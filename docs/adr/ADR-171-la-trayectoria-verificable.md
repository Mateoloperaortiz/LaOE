# ADR-171: La trayectoria verificable

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-014, ADR-047, ADR-058, ADR-160, ADR-164

## Contexto

El plan maestro del rediseño (§7, ola 2) pide una **trayectoria verificable con «Agregar a LinkedIn»**, al estilo de Anthology Engage y Credly: que un miembro pueda mostrar afuera lo que hizo en la OE (los comités y los cargos de cada semestre, los reconocimientos) y que quien lo lea pueda comprobarlo en la casa. Hoy esa historia vive en la Persona 360 y en «Yo», y no sale de la casa.

Mostrarla afuera publica un dato personal: el nombre de la persona junto a lo que hizo. Por eso no puede salir sin que ella lo pida, una cosa a la vez.

## Decisión

1. **La trayectoria.** «Yo» lleva a `/app/yo/trayectoria`, que lista lo que la persona hizo, del semestre más reciente al más viejo:
   - cada comité de cada semestre, con su cargo cuando lo tuvo («Dirección de GEMIS · 2026-2»; si no, «Miembro de GEMIS · 2026-2»);
   - cada reconocimiento que recibió.
2. **Publicar es por elemento y lo decide la persona.** Al publicar uno, la casa crea una credencial con un identificador público al azar y guarda la foto de lo que dice: el título, el semestre y cuándo se publicó. La persona la deja de publicar cuando quiera; la credencial queda revocada y su página lo dice. Nada se publica por defecto.
3. **La página pública.** `/verificar/<identificador>` muestra solo la credencial: el nombre de la persona, el título, el semestre, quién la emite (la Organización Estudiantil EAFIT) y cuándo se publicó. No enlaza a nada de la casa ni dice nada más de la persona, y no se indexa.
4. **«Agregar a LinkedIn».** Cada credencial publicada tiene el enlace de LinkedIn para agregar una licencia o certificación, con el título, la organización, el mes y el año, el enlace de la página pública y su identificador. La casa no se conecta con LinkedIn: arma el enlace y la persona lo abre.
5. **Al anonimizar** a la persona se borran sus credenciales, y sus páginas públicas dejan de existir (ADR-014).

## Consecuencias

- **Migración aditiva.** Una tabla nueva, `trajectory_credential`, en `crm` (que ya lee los comités de `people` y tiene los reconocimientos), con su identificador público único.
- **Política de datos.** Publicar una credencial expone el nombre y lo que dice, a pedido de la persona. La próxima versión de la política (ADR-047) lo nombra; queda en [11-contenido-pendiente](../11-contenido-pendiente.md).
- **Pruebas.** Integración de publicar, solo lo propio, revocar y borrar al anonimizar. E2E de publicar desde «Yo», abrir la página pública, revocarla y el enlace de LinkedIn.
