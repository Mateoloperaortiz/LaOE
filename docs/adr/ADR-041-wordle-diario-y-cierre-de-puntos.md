# ADR-041: Wordle diario y cierre transaccional de puntos

- Estado: Aceptada (enmendada por ADR-074, ADR-075 y ADR-119)
- Fecha: 2026-09-07
- Relacionadas: ADR-007, ADR-008, ADR-011, ADR-012, ADR-020, ADR-030, ADR-032, ADR-035
- Enmienda: ADR-035 (palabra del día, ledger y coordinación de escrituras con el cierre); ADR-007 (tipo WORDLE).

## Contexto

Mateo pidió un Wordle en GH Points, con puntos por resolverlo, una palabra distinta por integrante y un diccionario amplio. Aprobó una partida diaria en Colombia, cinco letras, seis intentos, tildes opcionales y Ñ distinta de N, con premios de 6 a 1 puntos según el intento. La fase 3 había dejado la palabra del día en backlog y preservado sus movimientos antiguos como LEGACY.

El cierre calculaba el standing antes de su transacción y los comandos de puntos consultaban un indicador de cierre antes de escribir. Una victoria concurrente podía quedar fuera del snapshot. La nueva acreditación requiere coordinar también los otros caminos que alteran ese cierre.

## Decisión

1. **Ubicación y participación.** Tablero bajo el saldo en `/app/gh-points`, antes de movimientos. Activos y honorarios, solo durante un término vigente con puntos abiertos. Los semestres anteriores enlazan al reto actual. No hay nueva ruta de juego, práctica ilimitada ni bonificaciones por racha. El score de comités y la permanencia siguen derivados de ocasiones/asistencias.
2. **Día y reglas.** Día civil de Colombia (UTC−05:00), calculado en servidor. Normalización NFC, mayúsculas y vocales sin tilde/diéresis; Ñ se conserva. Se aceptan exactamente cinco letras. Dos pasadas asignan coincidencias exactas antes de repartir letras presentes. Acertar en el intento `n` acredita `7-n`; perder o vencer acredita cero y no crea entrada de cero. La partida termina al cambiar de día, cerrar puntos o dejar de pertenecer al término vigente.
3. **Diccionarios.** RLA-ES v2.9 internacional expandido offline con nspell 2.1.5 (solo desarrollo), remapeo documentado de flags Unicode y ampliaciones locales documentadas. Primera versión: 9.130 intentos y 1.429 respuestas revisadas, seleccionadas con FrequencyWords 2018 como orientación. Fuentes, licencias, hashes, revisión editorial y generador quedan en `participation/data/wordle`; `wordle:check` verifica reproducibilidad. Las versiones publicadas son inmutables y se conservan en un registro para partidas existentes. Ninguna llamada externa en una jugada. Una palabra ausente no consume intento.
4. **Persistencia.** `wordle_game` conserva persona, término, fecha, respuesta privada, versiones y estado. Uniques `(personId, day)` y `(answer, day)`. `wordle_attempt` conserva ordinal, palabra, pistas y requestId; uniques `(gameId, ordinal)` y `(gameId, requestId)`. Iniciar es una acción POST: un lock transaccional por día serializa solo la asignación y el servidor sortea entre las respuestas libres. Un catálogo agotado produce un error operable sin reutilizar respuestas. GET nunca asigna palabras.
5. **Envíos y reintentos.** La acción resuelve actor e IP; el navegador envía únicamente partida, palabra, requestId y ordinal esperado. El dominio relee propiedad, membresía y estado usando la misma transacción, bloquea término compartido y luego partida exclusiva. Repetir el requestId con el mismo contenido devuelve el estado guardado, incluso tras medianoche/cierre; cambiar su contenido se rechaza. Un ordinal desactualizado devuelve los intentos actuales. Una falla de red conserva la solicitud exacta para reintentar.
6. **Ledger y efectos.** Tipo WORDLE con `wordleGameId` único, FK y restricciones de consistencia/premio de 1 a 6. La jugada ganadora, actualización de partida, crédito, auditoría y `wordle.completed` se escriben juntos. El evento contiene persona, término, partida, día, intentos y puntos; produce una interacción PARTICIPATION idempotente en CRM. No emite asistencia, recompute de comité ni push. Correcciones mediante ajuste administrativo con motivo; los WORDLE antiguos continúan LEGACY.
7. **Cierre.** `terms.lockOpenTermPoints(tx, termId)` usa `FOR SHARE` y relee el cierre; varios créditos concurren sin exclusividad entre sí. Se aplica a escrituras de ledger y a comandos de participación que alteran las cifras congeladas, incluidas aperturas/series y asistencias de cero puntos. `closeTermPoints` toma `FOR UPDATE` antes de estampar. `closeTermPointsAs` precarga referencias de personas y comités; dentro de la misma transacción cuenta ocasiones abiertas, calcula agregados/top y escribe standing. Si no se puede cerrar, todo revierte. Los helpers cruzados reciben `ctx.tx` explícito; no abren otra conexión del pool. El score asíncrono de comités conserva su funcionamiento previo.
8. **Privacidad y presentación.** Las proyecciones exponen solo estado, intentos/pistas y premio; la respuesta se revela únicamente al finalizar o vencer. No se incluye en eventos ni auditoría. `Mis datos` usa la misma proyección segura; los requestId y versiones internas tampoco se exponen. El diccionario y las respuestas se importan exclusivamente en servidor. Partidas ligadas al mismo identificador de persona conservan la historia anónima bajo las reglas de ADR-030.
9. **Interfaz.** Teclado físico y táctil con Ñ, guardado de cada intento aceptado, recuperación al actualizar/cambiar dispositivo, aviso de medianoche y próximo reto. Azul para lugar correcto, amarillo para otro lugar y navy para ausencia, con símbolos y textos accesibles además del color. Tipografías/tokens existentes y textos T-1230 a T-1268; los catálogos T-085 y T-667 se amplían al final para preservar sus índices.

## Consecuencias y verificación

La migración `0010_wordle_diario` es aditiva. Los checks del tipo nuevo comparan `kind::text` para que PostgreSQL permita aplicar la incorporación del enum y sus tablas en la transacción del migrador. `db:release` exige los nuevos índices únicos. La generación del diccionario no se ejecuta en build ni en producción.

Pruebas unitarias de normalización, pistas, seis premios y corpus; integración de unicidad, concurrencia, rollback, cierre, vencimiento, autorizaciones y replay; E2E de UI, exportación segura, crédito, reanudación y móvil/axe. Verificación completa con `npm run check`, `npm run wordle:check` y E2E de GH Points, Wordle y cierre. El despliegue sigue la promoción habitual de la fase 7.

## Enmienda (2026-09-17, ADR-074)

La regla 6 sigue igual para la jugada: `wordle.completed` no emite push. Lo que avisa es un programado nuevo a las 9:00 de Bogotá, que le recuerda la partida del día a los activos y honorarios que todavía no la abrieron, solo mientras haya término vigente con los puntos abiertos. Ver [ADR-074](ADR-074-aviso-diario-del-wordle.md).

## Enmienda (2026-09-17, ADR-075)

La regla 1 cambia en un punto y solo en uno: **sí hay ruta de juego**. El tablero se muda de `/app/gh-points` a `/app/juegos/wordle`, dentro de una biblioteca que reúne los juegos de la casa, y el resumen conserva el enlace; el ancla `#wordle` deja de existir. Todo lo demás de ADR-041 sigue vigente sin tocar: el día civil, las seis oportunidades, los premios de 6 a 1, los diccionarios, la palabra distinta por persona y la privacidad de la respuesta. La regla 6 suma un tipo hermano al ledger, `GAME2048`, que no altera el del Wordle. Ver [ADR-075](ADR-075-biblioteca-de-juegos-y-2048.md).

## Enmienda (2026-10-09, ADR-119)

Regla 2: el día de la partida sigue siendo el día civil de Colombia, pero ya no sale de restarle cinco horas fijas al instante («UTC−05:00»). Lo da la zona de la app ([ADR-020](ADR-020-zona-horaria.md)) con el mismo cálculo de los otros juegos y de los topes diarios (`dayKeyFor`), y «cuándo empieza el siguiente» sale de ese día más uno a la medianoche de la zona. Hoy las dos fórmulas dan lo mismo en todo instante: las comparó una propiedad sobre un año. Si la zona dejara de ser UTC−5 todo el año, el día cambiaría en la medianoche civil y no a las 05:00Z. Cuándo termina la partida («al cambiar de día, cerrar puntos o dejar de pertenecer al término vigente») no cambia: lo que el Wordle responde en cada caso queda declarado en la guardia única de la partida diaria, y lo que no coincide con los otros juegos espera las decisiones abiertas 49 y 50. Ver [ADR-119](ADR-119-reglas-de-estructura-y-robustez-del-septimo-ciclo.md) reglas 6 y 7.
