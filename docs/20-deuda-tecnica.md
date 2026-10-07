# Ledger de deuda técnica

Registro persistente de la deuda técnica de la casa digital ([ADR-109](adr/ADR-109-refactor-progresivo-con-ledger-de-deuda.md)). Cada hallazgo tiene una fila y termina en uno de cuatro estados:

- `RESOLVED`: corregido y verificado; la nota dice en qué ciclo y con qué prueba.
- `ACCEPTED`: se conoce y se decide convivir con él; la nota dice por qué.
- `DEFERRED`: se hará; la nota dice qué lo destraba.
- `NOT_APPLICABLE`: se investigó y no era deuda.

Mientras se trabaja, una fila puede estar `OPEN`, `IN_PROGRESS` o `BLOCKED` (espera una decisión de [decisiones-abiertas.md](decisiones-abiertas.md)).

Orígenes: **A19** es la [auditoría del 2026-09-19](auditoria-codigo-2026-09-19.md), con su código de hallazgo o de tramo; **R06** es la revisión de arquitectura del 2026-10-06 (37 oportunidades; «verificado» quiere decir que un segundo lector intentó tumbarla y sobrevivió, «medido» que sale de un conteo reproducible). Prioridad, de mayor a menor: corrección, seguridad, integridad, simplicidad, mantenibilidad, testabilidad, observabilidad, rendimiento.

## Hallazgos

| ID | Hallazgo | Origen | Prioridad | Estado | Nota |
| --- | --- | --- | --- | --- | --- |
| DT-001 | Excusar una asistencia pendiente con premio reservado deja la reserva viva, y una reserva viva bloquea el cierre del semestre | R06, verificado por lectura | corrección | OPEN | Ciclo 1. Primero la prueba en rojo; el defecto no se ha ejecutado |
| DT-002 | La sanción que registra la dirección de un comité no comprueba su alcance en el comando: la regla de ADR-060 vive como lista permitida en la página y como lista prohibida en la action | R06, verificado | seguridad | OPEN | Ciclo 1. Es ADR-072 regla 1 sin aplicar a este comando |
| DT-003 | «Hoy» se calcula en UTC en la viabilidad del comité y en la página de permanencia de Mi OE: queda errado de 19:00 a 24:00 de Colombia | R06, verificado | corrección | OPEN | Ciclo 1 |
| DT-004 | Las pruebas drenan el outbox de ocho maneras con tres semánticas, y 73 de 91 llamadas no miran si un handler falló | R06, verificado; A19 E6 | testabilidad | RESOLVED | Ciclo 1. `drainOutbox` de `tests/helpers/outbox.ts` es el único drenado de integración y E2E, con la semántica de ADR-052 regla 5 más dos pedidos explícitos (`expectFailures` y `now`); lo sostiene `tests/integration/outbox-drain.test.ts`. Pasan por él 115 llamadas de 38 archivos de integración y las 36 de E2E; al afirmar los fallos no apareció ningún handler roto. Quedan sobre el poller, a propósito: sus propias pruebas (`outbox.test.ts`), un lote único en `permanence-snapshot.test.ts` (cuenta el recompute pendiente antes de correrlo) y dos pasos con `processOne` en `wallet-jobs.test.ts`. Era la condición para tocar el poller (DT-016) |
| DT-005 | `comms`, `events`, `forms`, `identity`, `participation`, `people` y `system` forman una sola componente circular a nivel de módulo de dominio; la regla `sin-ciclos` solo mira archivos | R06, medido | mantenibilidad | OPEN | Ciclo 1. La cierran `system → identity` (una action de 20 líneas) y `events → people` (un selector) |
| DT-006 | «Fin del término» tiene cuatro escrituras y dos valores a cinco horas de diferencia (con `Z` y con `−05:00`) | R06, verificado | corrección | BLOCKED | Decisión abierta 6: mueve quién queda como honorario |
| DT-007 | Abrir una tarea de GH tiene ocho sitios: cinco insertan la fila a mano, tres de ellos sin auditoría; «una sola abierta por motivo» está reescrita cuatro veces, dos con el título del copy como clave, y la base no la respalda | R06, verificado | integridad | OPEN | El índice único pide mirar antes si producción ya tiene duplicados |
| DT-008 | Cinco caminos de una asistencia (propio, anfitrión, decidir, cancelar la ocasión, excusa) cosen a mano crédito, auditoría, eventos, premio y reto presencial | R06, verificado | mantenibilidad | OPEN | Después de DT-001, que le deja la prueba de la excusa |
| DT-009 | La guardia de la partida diaria (día, término, locks, elegibilidad, vencimiento) está implementada cuatro veces y ya diverge: Panal responde «semestre cerrado» antes de mirar la partida existente | R06, verificado; A19 B5, R5 | mantenibilidad | OPEN | Red: 70 casos de integración |
| DT-010 | Dos cálculos del día civil en los juegos (resta fija de cinco horas y por zona) y aritmética de fechas clave copiada tres veces | R06, verificado; A19 C9 | simplicidad | OPEN | La parte que no depende de DT-006 |
| DT-011 | Etiquetas por posición de un enum: 208 accesos `tList(…)[índice]` y un respaldo `?? valor` que muestra el código crudo sin fallar | R06, medido; A19 B2, R2-B | mantenibilidad | OPEN | |
| DT-012 | La interfaz pública de los módulos de dominio es más ancha que su uso (`participation` 203 de 384 exports sin uso afuera, `people` 71 de 235, `crm` 60 de 150) y knip no lo ve porque toma cada `index.ts` como entrada | R06, medido; A19 B6 | mantenibilidad | OPEN | Podar es higiene; la entrada aparte para componer pide enmendar ADR-001 y ADR-080 |
| DT-013 | La siembra de pruebas escribe filas a mano: `factories.ts` toca 27 tablas sin un solo comando, hay 146 insert sueltos en integración y 105 en E2E, y E2E no comparte la fábrica | R06, verificado; A19 E6, R7 | testabilidad | OPEN | «Siempre por comandos» quedó descartado: encarece la suite y ensucia auditoría y outbox |
| DT-014 | El resultado de una acción tiene cinco convenciones y un kit privado por pantalla; el error viaja como texto libre en la URL | R06, verificado; A19 C2, R6 | seguridad | OPEN | Costo escondido: `DomainError` solo lleva el mensaje ya armado |
| DT-015 | No hay piezas base de interfaz: el campo con etiqueta y error, la alerta y la tarjeta se arman a mano fuera del admin kit | R06; A19 B7, R6 | mantenibilidad | OPEN | Requisito del paquete de componentes de ADR-085 |
| DT-016 | El poller corre los handlers de un evento en serie y reintenta el evento entero; no recupera programados perdidos y `/api/health` no informa la cola | A19 A2, A9, R4-B | observabilidad | OPEN | Pide ADR, migración y ensayo en staging. No promete quitar la idempotencia de cada handler |
| DT-017 | Dos correos (T-200 y T-205) pueden reenviarse si falla un handler vecino del mismo evento | R06, verificado | corrección | OPEN | Va con DT-016 |
| DT-018 | Un programado son dos cadenas sueltas en dos archivos; ADR-084 regla 7 dice que no llevan payload y sí lo llevan | R06, verificado | mantenibilidad | OPEN | Un catálogo y una prueba; enmienda a ADR-084 |
| DT-019 | 28 transacciones abren por fuera de `runCommand` en 18 archivos; estar «dentro de la transacción» depende de pasar el executor a mano | R06, medido; A19 C15 | integridad | OPEN | Hay casos deliberados (billeteras con red, lote de campañas): inventariarlos antes |
| DT-020 | Quien reserva un premio busca antes el booster apuntado y la campaña vigente; falta que el premio entienda el origen reto | R06, verificado | mantenibilidad | OPEN | Para la asistencia ya existe |
| DT-021 | La elegibilidad del check-in propio se decide en el comando y otra vez en la página de `/a` | R06, verificado | simplicidad | OPEN | El anfitrión es otra política: no se junta |
| DT-022 | El recolector de permanencia decide quién es nuevo y de cuál fila salen estado y prueba, bajo una cabecera que dice «sin lógica de negocio», con una sola prueba | R06, verificado | testabilidad | OPEN | Mover esas reglas al puro |
| DT-023 | El roster crea membresías con sus propios insert, sin historial de estados ni evento de cambio | R06 | integridad | OPEN | Sin verificar. Decidir qué efectos se suprimen en una carga masiva |
| DT-024 | Las capacidades sobre un comité se derivan dos veces con filtros distintos: la lectura admite licencia y el comando no | R06 | corrección | BLOCKED | Decisión abierta 7 |
| DT-025 | El cierre de permanencia aplica cada consecuencia en su propia transacción y marca la decisión en otra | R06 | integridad | OPEN | Sin verificar. Una transacción por persona alarga los candados: medir en staging |
| DT-026 | Los cuatro juegos insertan en `point_entry` a mano | R06, verificado; A19 B5 | simplicidad | OPEN | Mueve un insert de ocho líneas por juego; va con DT-009 |
| DT-027 | `Paneles.tsx` es una función de 845 líneas con 15 condiciones; cada precondición está escrita en la cabecera, en el panel y en el comando; la Persona 360 dispara unas 30 lecturas | R06; A19 C5, R6 | mantenibilidad | OPEN | Sin verificar |
| DT-028 | Cuatro subidores repiten el mismo protocolo con el bucket | R06; A19 C11 | simplicidad | OPEN | Sin verificar |
| DT-029 | Cuatro tableros repiten el protocolo de envío con reintento | R06 | simplicidad | OPEN | Sin verificar |
| DT-030 | Vaciar y preparar la base de pruebas depende de listas a mano de más de cien tablas | R06; A19 A4 | testabilidad | OPEN | Sin verificar |
| DT-031 | Las lecturas del miembro de gamificación piden un preámbulo repetido en 13 archivos | R06 | simplicidad | OPEN | Sin verificar |
| DT-032 | La biblioteca de juegos no responde como una: cada consumidor conoce los cuatro juegos por nombre | R06 | mantenibilidad | OPEN | Sin verificar. Después de DT-009 |
| DT-033 | La IP del cliente sale del primer valor de `X-Forwarded-For`; de ella dependen los límites de uso | A19 A3, R0 | seguridad | OPEN | Falta comprobar en staging qué cabecera llega |
| DT-034 | La cookie de sesión no lleva el prefijo `__Host-` y sus atributos están en dos sitios | A19 A5 | seguridad | DEFERRED | Cierra las sesiones vivas: va con la autenticación entre aplicaciones de ADR-085 |
| DT-035 | Falta la revisión de seguridad (serie V2): que cada guard sea el correcto, tokens de carnet, ICS y baja, validación de la entrada pública, `npm audit` | A19 V2 | seguridad | OPEN | Descubrimiento pendiente |
| DT-036 | Los módulos chicos no se han revisado con lupa (`comms`, `content`, `identity`, `wallet`, `forms`, `finance`) | A19 V4 | mantenibilidad | OPEN | Descubrimiento pendiente |
| DT-037 | CI y `npm run check`: pasos en serie, compilaciones repetidas y duraciones de partición desfasadas | A19 E3 a E5, R7 | rendimiento | OPEN | Por medir de nuevo |
| DT-038 | La base de producción no se ha medido: lecturas que crecen sin `limit`, índices | A19 V3 | rendimiento | DEFERRED | Pide la autorización explícita del túnel de solo lectura |
| DT-039 | `roleCode` sigue como cargo principal derivado «hasta retirarlo»: 210 usos en 38 archivos | R06, medido; ADR-058 | simplicidad | OPEN | |
| DT-040 | La rama de SES está apagada y su SDK sigue instalado | A19 D; ADR-039 | simplicidad | BLOCKED | Decide Mateo si SES vuelve |
| DT-041 | Documentación atrasada: `01-arquitectura.md` no nombra `competition`, Panal no está en el glosario y `04-decisiones.md` cita 97 de 108 ADR | R06, medido | mantenibilidad | OPEN | |
| DT-042 | Documentos vivos que crecen sin límite: roadmap 370 KB, copy 304 KB, runbook 164 KB | A19 E2, R1-B | mantenibilidad | DEFERRED | Mover informes y bitácora cambia `documentation-paths.json` y los watch patterns de Railway (ADR-055): pide autorización |
| DT-043 | 25 ramas remotas ya mezcladas sin borrar y 15 MB en `drizzle/meta` | R06, medido; A19 E8 | simplicidad | DEFERRED | Borrar ramas pide autorización; una línea base de migraciones pide ADR |
| DT-044 | `competition`: 49 comandos pasamanos, cinco importadores con el mismo esqueleto, un libro de puntos sin módulo y un despachador de 39 casos | R06, verificado | mantenibilidad | DEFERRED | Quieto desde el 2026-10-02: profundizarlo hoy no paga. Decisión abierta 8 |
| DT-045 | El contrato de la API pública v1 está repartido y una ruta decide 401 o 400 comparando el texto del error | R06 | corrección | OPEN | Sin verificar. Es el único seam que ve DÍAS |
| DT-046 | ADR-011 dice que cada comando sensible llama a su guard, pero el permiso vive en la action y en `src/app/_authz` (ADR-082 regla 5) | R06, verificado | mantenibilidad | OPEN | Es deriva documental: pide una enmienda, no mover los guards |
| DT-047 | 100 de las 179 funciones de 100 líneas o más están en páginas, con red solo E2E; no hay `loading.tsx` ni `error.tsx` por área | R06, medido; A19 C14 | mantenibilidad | OPEN | |
| DT-048 | Los importadores (roster, asistencias, GH Points, normativa) no se compararon lado a lado | R06 | mantenibilidad | OPEN | Descubrimiento pendiente |
| DT-049 | Origen general del crédito en `point_entry` en vez de una columna por juego | R06; A19 B5 | simplicidad | DEFERRED | Migración con datos reales; solo después de DT-026 |
| DT-050 | Un módulo de candados para los `pg_advisory` | R06, verificado | — | NOT_APPLICABLE | Sería superficial por construcción: su interfaz es casi su implementación |
| DT-051 | Partir `permanence-pure.ts` por su tamaño | A19 C7 | — | NOT_APPLICABLE | Es profundo: 1.098 líneas detrás de dos entradas, con 1.497 de prueba (ADR-109 regla 10) |
| DT-052 | Separar el reglamento 2026 del motor de `competition` | R06 | — | NOT_APPLICABLE | Un solo adaptador: seam hipotético. Se reabre si hay una segunda edición con otras reglas |

## Métricas

Las mide `npm run audit:metrics`. Al cerrar cada ciclo se agrega su tabla debajo de la anterior.

### Línea base · 2026-10-06 · `01d022d`

| Métrica | Valor |
| --- | --- |
| Archivos y líneas en `src` (sin el catálogo de textos) | 739 · 116434 |
| Líneas en `src/app` · `src/modules` | 39049 · 71543 |
| Funciones de más de 100 · 200 · 300 líneas (`src` y `scripts`) | 179 · 60 · 23 |
| Funciones con complejidad mayor a 30 | 64 |
| Archivos de más de 500 · 1000 líneas | 46 · 6 |
| Exports de `participation` · `people` · `crm` (`index.ts`) | 384 · 235 · 150 |
| Nombres de función de nivel superior declarados en 2 o más archivos de `src` | 99 |
| `as unknown as` en `src` | 4 |
| `tList(` · accesos posicionales `[n] ?? ""` en `src` | 828 · 374 |
| `throw new Error(` en `src` | 154 |
| `getDb()` en `src/modules` | 458 |
| Eventos de dominio: en el catálogo · todavía emitidos como cadena suelta | 66 · 0 |
| Elementos crudos en `src` (input · select · table · button) | 558 · 123 · 51 · 134 |

Medidas que el script no trae y que salen de la revisión del 2026-10-06: módulos de dominio en una componente circular, 7; archivos de prueba que insertan filas a mano, 82; transacciones fuera de `runCommand`, 28 en 18 archivos.
