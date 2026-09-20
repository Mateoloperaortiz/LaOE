# ADR-084: Catálogo tipado de eventos de dominio

- Estado: Aceptada
- Fecha: 2026-09-19
- Relacionadas: ADR-012, ADR-034, ADR-035, ADR-080, ADR-083
- Enmienda: ADR-012 (contrato de los eventos), ADR-080 (regla 4: ya existe un lugar para los eventos)

## Contexto

Los módulos se hablan por eventos de dominio que viajan por el outbox (ADR-012). Un evento era una cadena y un objeto sin tipo: `ctx.emit({ type: "checkin.approved", payload: {…} })` de un lado y `registerHandler("checkin.approved", (payload) => esquema.parse(payload))` del otro (`src/db/tx.ts`, `src/jobs/registry.ts`). La [auditoría del 2026-09-19](../auditoria-codigo-2026-09-19.md) contó 64 tipos emitidos desde 102 sitios, y lo que eso costaba:

- **No había contrato.** El payload de `checkin.approved` lo armaba `participation` y lo volvían a describir, cada uno a su manera y por partes, `comms`, `crm`, `permanence` y el propio `participation`. Los esquemas `personEvent` y `membershipChanged` estaban declarados doce veces en siete `jobs.ts`.
- **Un nombre mal escrito no fallaba.** El poller da por procesado un evento sin handlers con un `warn` (ADR-034): un tipo con una letra cambiada, del lado que sea, se pierde en silencio.
- **Un renombre en el productor tampoco.** La línea de tiempo de `crm` lee cada campo con un ayudante que devuelve `""` si la clave falta.

[ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md) dejó escrito que no había `events.ts` y que el catálogo llegaría con su propia decisión. La propuesta de la auditoría era un `events.ts` por módulo productor, exportado por su `index.ts`. **No sirve**, y el motivo es el mismo por el que existen los eventos. Medido sobre `0be35e4`, quién escucha a quién:

```
comms ← content, crm, identity, participation, people, permanence
crm ← forms, identity, participation, people, permanence, system
permanence ← crm, people          forms ← people
identity ← people                  participation ← people
wallet ← people
```

`crm` escucha a `permanence` y `permanence` escucha a `crm`. `comms` escucha a `crm`. Ninguna de esas direcciones está en `MODULE_DEPS`, y no deben estarlo: importar el `index.ts` del productor para leer su contrato cargaría el módulo entero y cerraría ciclos. Quien escucha un evento casi nunca puede importar a quien lo emite.

## Decisión

1. **Los contratos viven en una capa neutral, `src/domain-events/`**, con un archivo por módulo productor (`participation.ts`, `people.ts`…) y sin barrel, para que un evento nuevo toque solo el archivo de su productor. Un contrato es `defineEvent("tipo", esquemaZod)`: un nombre y el esquema de su payload. La capa no importa módulos, base, entorno ni lo compartido; lo verifica la regla `contratos-de-eventos-neutrales` de dependency-cruiser. La carpeta se llama `domain-events` y no `events` porque `events` ya es el módulo de macroeventos.
2. **El productor emite con `ctx.emit(eventOf(contrato, payload, { dedupeKey }))`.** El compilador comprueba el payload contra el contrato. Al emitir **no** se valida en tiempo de ejecución: tipar un evento no cambia lo que hace el productor ni puede abortar su transacción.
3. **El consumidor escucha con `onEvent(contrato, handler)`**, que valida el payload contra el contrato y se lo entrega tipado. Desaparecen los esquemas parciales que cada `jobs.ts` se escribía. `onEvents([a, b, c], handler)` registra el mismo handler para varios eventos: recibe la unión de sus payloads y el tipo que lo disparó. Un payload que no cumple hace fallar el intento, como ya lo hacía el `parse` de cada handler.
4. **El contrato nace del payload que el productor ya emite**, no de lo que a un consumidor le gustaría recibir. Un evento en vuelo, o un dead letter que alguien reintenta, fue emitido por una versión anterior y debe seguir cumpliendo: por eso un cambio de contrato es aditivo y opcional primero, y obligatorio en un despliegue posterior.
5. **Los campos de tipo enumerado viajan como texto** (`category`, `kind`, `source`). Un valor nuevo en un enum de la base no debe mandar eventos a dead letter por un contrato desactualizado; el consumidor compara contra el valor que le importa.
6. **La migración va por familias, y una prueba impide retroceder**: `tests/unit/domain-events.test.ts` falla si un tipo que ya está en el catálogo aparece como cadena suelta en `src` o en `scripts`, o si el catálogo repite un tipo. Se comprobó en rojo. Ignora las líneas `action: "…"`: una acción de auditoría puede llamarse igual que un evento y es otro espacio de nombres.
7. **`registerHandler` y `ctx.emit({ type, payload })` siguen existiendo** para las familias sin migrar y para los programados, que no llevan payload. `npm run audit:metrics` cuenta cuántos tipos están en el catálogo y cuántos siguen como cadena.

## Primera familia: el check-in

`checkin.approved`, `checkin.pending`, `checkin.cancelled`, `checkin.excused` y `score.recompute`, con productor en `participation` (y en la importación histórica de `scripts/lib/ghpoints-db.ts`) y consumidores en cuatro módulos: `comms` (push de puntos), `crm` (evidencia del onboarding), `permanence` (recálculo) y `participation` (insignias, representación de comités en asambleas y score).

El tipado ya enseñó dos cosas que no estaban escritas en ningún lado:

- En `checkin.cancelled` y `checkin.excused` **el motivo puede ser `null`**. Ningún consumidor lo decía; el contrato ahora sí.
- Una prueba de integración llamaba al push de puntos con un payload a medias que en producción no existe. Ahora pasa el payload completo.

## Segunda familia: `people`

Quince tipos (`person.updated`, `person.email-changed`, `person.anonymized`, `person.deletion-requested`, `person.imported`, `person.admitted`, `stage.changed`, `membership.changed`, `membership-term.changed`, `committee-membership.changed`, `committee-removal.requested`, `appointment.changed`, `consent.changed`, `sanction.recorded` y `sanction.revoked`), 27 emisiones en doce archivos y consumidores en siete módulos: `identity`, `wallet`, `permanence`, `forms`, `participation`, `comms` y `crm`. Con ella salen los esquemas `personEvent` y `membershipChanged` que cada `jobs.ts` se había escrito.

Cómo se fijó cada contrato: primero se escribió con lo que parecía, y después se probó **en estricto** —sin ningún `nullable` ni `optional`— para que el compilador señalara, emisión por emisión, qué campos el productor de verdad deja en `null` o no manda. Salieron dos que se habían supuesto de más (`expiresOn` de una sanción siempre es texto; `roleCode` de un cargo es opcional pero nunca `null`) y el resto se confirmó: `from` y `reason` de `membership.changed`, `leaveUntil` solo al entrar en licencia, `endReason` solo en la baja, `source` de `consent.changed` solo al otorgar, `editionId` en `null` al quitar un cargo que no es de macroevento.

Dos cosas que conviene saber:

- **Cinco pruebas de integración armaban estos eventos a mano con payloads a medias** (`{ personId }`, sin `actorId`), que el productor nunca emite, y dejaron de pasar cuando el consumidor empezó a validar el contrato completo. No se aflojó el contrato: las pruebas emiten ahora con `eventOf`, y el compilador las comprueba igual que al productor.
- **`identity` conserva la sesión solo si reconoce el estado.** Su handler de `membership.changed` validaba `to` contra los cuatro estados conocidos; un estado desconocido fallaba el intento y la sesión quedaba viva. Con `to` como texto (regla 5), un estado que ese código no conozca **cierra** las sesiones. Hoy no existe tal estado; si apareciera uno, la opción segura es la que queda.

## Consecuencias

- 20 de 64 tipos en el catálogo tras las dos primeras familias. Quedan 44: el resto de `participation` (retos, insignias, juegos, cierre), `permanence`, `forms`, `crm`, `identity`, `content` y `system`.
- **La línea de tiempo de `crm` sigue por nombre.** `TIMELINE_EVENTS` y el `switch` de 44 casos de `summarizeEvent` son su propio tramo: pasar a un registro por tipo, con el payload tipado, es lo que de verdad elimina el `str(payload, clave)` que devuelve `""`. Es la única excepción que la prueba del catálogo admite.
- El catálogo **no** resuelve el evento sin handler: un contrato sin nadie que lo escuche sigue siendo válido (ADR-034). Lo que sí elimina es el nombre mal escrito, porque ya no se escribe.
- El modelo de ejecución del poller (reservar la fila en lugar de sostener la transacción, una fila por par evento-handler, recuperar programados perdidos, salud del outbox) es el tramo R4-B, con migración y ensayo en staging.
- No cambia comportamiento, esquema, textos ni pantallas.
