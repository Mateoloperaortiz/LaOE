# ADR-110: El grafo de módulos de dominio no tiene ciclos

- Estado: Aceptada
- Fecha: 2026-10-07
- Relacionadas: ADR-001, ADR-036, ADR-037, ADR-080, ADR-082, ADR-084, ADR-109
- Enmienda: ADR-080 (reglas 2, 5 y 6)

## Contexto

[ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md) hizo de `MODULE_DEPS` la única fuente del grafo entre módulos y dejó anotados, sin tocarlos, dos ciclos que la regla `sin-ciclos` no ve porque solo mira archivos: `people ↔ events` e `identity → people → system → identity`. Dos módulos pueden importarse por sus `index.ts` sin que ningún archivo cierre el círculo.

La revisión del 2026-10-06 ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md), fila DT-005 del [ledger](../20-deuda-tecnica.md)) midió el tamaño real: `comms`, `events`, `forms`, `identity`, `participation`, `people` y `system` formaban una sola componente circular. Siete de catorce módulos no se podían entender, probar ni mover por separado, y una dependencia nueva que cerrara otro ciclo pasaba `npm run deps:check` sin que nadie la decidiera.

La componente la cerraban dos aristas, y cada una salía de un solo import:

- **`system → identity`.** `src/modules/system/actions.ts` tenía una sola action de 20 líneas, `retryOutboxAction`, que resolvía el actor con `getActor` y `assertAdmin`. ADR-080 regla 2 le dejó `actions.ts` propio a `system` porque sus actions «se usan desde varias rutas»; la usaba una sola, `/admin/sistema/jobs`.
- **`events → people`.** `src/modules/events/admin.ts` leía `listCommitteesForSelection` para las opciones del selector de comités organizadores de una edición. El registro del admin ya componía esa misma lectura para la cartelera, porque `content` tampoco importa `people`.

En los dos casos la dependencia de fondo va en el otro sentido y se queda: `people` lee ediciones de `events` para los cargos de mesa de un macroevento y para los honorarios, e `identity` llega a `system` por `people` y `comms`.

## Decisión

1. **`MODULE_DEPS` es un grafo sin ciclos.** `.dependency-cruiser.cjs` recorre la tabla al cargar y falla, con el ciclo escrito (`events → people → events`), si alguna cadena de dependencias vuelve al módulo del que salió. Se suma a la comprobación de módulos sin declarar. `sin-ciclos` sigue cuidando los ciclos entre archivos, y las claves foráneas entre `schema.ts` siguen aparte.
2. **`system` no importa `identity`.** El reintento del outbox vive en `src/app/admin/sistema/jobs/actions.ts`, junto a su única ruta, con el kit de [ADR-082](ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md): `requireAdminContext` resuelve el guard de ADMIN y el actor con su IP. `system` exporta el comando `retryDeadLetterAs(actor, id)`, que reencola y audita; quién puede reintentar lo decide la action. `system` queda sin `actions.ts`: solo `identity` conserva el suyo.
3. **`events` no importa `people`.** El recurso de ediciones declara el campo de comités organizadores sin opciones, y `src/app/admin/_kit/registry.ts` se las pone con `listCommitteesForSelection`, igual que compone el comité de la cartelera ([ADR-036](ADR-036-permanencia-fase-4.md)) y el grupo de las convocatorias ([ADR-037](ADR-037-admision-aliados-y-contactos-fase-5.md)).
4. **Una dependencia que cerraría un ciclo no se declara.** Tiene dos salidas: la composición sube a `src/app` (una action, una página o el registro del admin), o el aviso va por un evento de dominio ([ADR-084](ADR-084-catalogo-tipado-de-eventos-de-dominio.md)). Para las demás dependencias sigue valiendo ADR-080 regla 7.

## Consecuencias

- `content`, `terms` y `system` quedan sin dependencias hacia otros módulos, y los catorce admiten un orden: cada uno importa solo de los que tiene debajo. La tabla sigue siendo la fuente; este documento no la copia.
- La regla se comprobó en rojo sembrando aristas en la tabla: `system: ["identity"]` produce `comms → participation → forms → people → system → identity → comms` y `events: ["content", "people"]` produce `events → people → events`.
- El reintento no cambia para un ADMIN. Al pasar al kit cambian dos cosas que nadie real ve: quien no es ADMIN en condición de operar sale a `/app`, como en el resto del admin, en vez de recibir el error `Solo ADMIN`; y la auditoría `outbox.retried` lleva la IP de quien reintentó, que antes quedaba vacía (ADR-082 regla 2).
- Usar `editionsResource` de `events` sin pasar por el registro ofrecería el selector de comités vacío. La pantalla de ediciones, la action de guardar y la exportación lo toman del registro.
- La comprobación mira la tabla declarada, no los imports: una arista que el código ya no usa sigue permitida hasta que alguien la quite.
- Sin migración, sin textos nuevos y sin cambios en rutas, eventos de dominio ni API pública.
- Pruebas: `tests/unit/outbox-retry-action.test.ts` (guard, validación y revalidación de la action), `tests/integration/outbox-retry.test.ts` (el comando contra Postgres: vuelve a la cola, se procesa y queda auditado) y `tests/integration/admin-editions-form.test.ts` (el formulario de ediciones ofrece los comités vivos).
