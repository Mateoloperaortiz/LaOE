# Informe del refactor progresivo

Cierre del objetivo que Mateo fijó el 2026-10-06 ([ADR-109](adr/ADR-109-refactor-progresivo-con-ledger-de-deuda.md)): llevar la casa a un estado sólido, mantenible, testeable y seguro con una refactorización por ciclos, sin reescritura total y con un registro persistente de la deuda. Este documento dice de dónde se partió, qué cambió, cómo quedó, qué riesgos hay y qué deuda queda. El detalle de cada hallazgo vive en el [ledger](20-deuda-tecnica.md) y el de cada ciclo en el [roadmap](09-roadmap.md).

## En corto

- **Diecisiete ciclos y un remate**, del 2026-10-06 al 2026-10-13: seis ciclos de corrección, seguridad e integridad, uno de estructura, los arreglos rápidos que salieron de clasificar lo que quedaba, cuatro ciclos más con las filas diferidas que no esperaban nada, los tres primeros refactors de estructura que tenían spec, un ciclo más con la cola que dejaron esos, otro con lo que dejó su revisión, y uno más con la primera mitad de lo que ya no esperaba nada. Más un arreglo de dependencias vulnerables y una guarda de migraciones, los dos contra `main`.
- **Todo está mezclado en `main` desde el 2026-10-13.** Mateo lo autorizó ese día y entraron los veinte PR: el #116, el #192 y la pila entera en una sola mezcla. Producción lo sirve desde esa misma noche, con el commit `e678038`; lo que quedó por comprobar después está en la sección «Cómo seguir».
- **El repositorio se leyó entero.** Una revisión de arquitectura, un descubrimiento de seguridad y dos olas de una auditoría de huecos, cada hallazgo de severidad media o alta con un segundo lector que intentó tumbarlo.
- **Ledger:** 408 hallazgos, todos en un estado final. 198 resueltos, 196 diferidos con lo que los destraba y el riesgo de dejarlos, 9 aceptados y 5 que no eran deuda. De los diferidos, 131 esperan una de las 82 decisiones abiertas. La mezcla y la promoción cerraron dos filas de riesgo alto: las dependencias con aviso crítico (DT-053) y el migrador que saltaba migraciones en silencio (DT-128).
- **Pruebas:** de 855 unitarias y 603 de integración a 2.434 y 1.907. La E2E pasa entera, también pegada a `npm run check`. Lo que la hacía tardar de más tenía dos causas: lo que la suite de integración le dejaba a Postgres, corregido en el cierre (DT-188), y un servidor de desarrollo que se atasca en una corrida completa sin nada compilado, corregido en el ciclo 11: la corrida completa local va contra el build (DT-338).
- **«Diferida» no era «bloqueada».** Al releer lo que quedó diferido salieron filas, y partes de una fila, que no esperaban una decisión, una mirada a producción ni mezclar la pila. Los ciclos 8 a 11 tomaron cuatro tandas de esas, la última con la cola, el 15 una quinta, con lo que dejaron los ciclos de estructura, el 16 una sexta, con lo que dejó la revisión del 15, y el 17 una séptima. Lo que queda diferido espera una de esas tres cosas o una de las seis specs que faltan; cada fila dice cuál.
- **Lo que sigue no es código:** las 82 decisiones abiertas, las comprobaciones de después de promover que piden una sesión, un teléfono o un conteo en producción, y tres avisos: a la junta, a GH y a Comunicaciones (sección «Cómo seguir»).

## Punto de partida

La casa es un monolito modular: Next.js 16, TypeScript, Drizzle y Postgres, con catorce módulos de dominio en `src/modules`, las pantallas en `src/app` y el trabajo de fondo (outbox y programados) en el mismo proceso. La [arquitectura documentada](01-arquitectura.md) era la del código en lo grueso. Lo que la revisión del 2026-10-06 midió por debajo:

| Qué | Línea base (`01d022d`) |
| --- | --- |
| Líneas en `src`, sin el catálogo de textos | 116.434 en 739 archivos |
| Funciones de más de 100, 200 y 300 líneas | 179, 60 y 23 |
| Funciones con complejidad mayor a 30 | 64 |
| Módulos de dominio en una componente circular | 7 de 14 |
| Símbolos que exporta `participation` | 384, de los que 203 no usa nadie de afuera |
| Archivos de prueba que insertan filas a mano | 82 |
| Transacciones abiertas por fuera de `runCommand` | 28 en 18 archivos |
| Pruebas unitarias y de integración | 855 y 603 |
| Avisos de `npm audit` | 13, uno crítico (`next/og`) |

Y lo que no se medía con un conteo:

- **Defectos de conducta en caminos que ya tenían pruebas.** Una excusa sobre una asistencia pendiente dejaba viva la reserva del premio; «hoy» salía en UTC en dos sitios; el alcance de una sanción del comité no vivía en el comando.
- **Zonas que escribían a muchas personas sin red.** El lote de una campaña de correo tenía dos casos de prueba; las tareas de GH se insertaban a mano desde cinco sitios.
- **Concurrencia sin candado en la asistencia.** Dos decisiones a la vez sobre la misma asistencia leían sin bloquear y la segunda pisaba a la primera.
- **Un poller que no contaba el intento** hasta terminar: un evento que tumbaba el proceso volvía de primero en cada arranque.
- **Privacidad con huecos después de anonimizar:** fotos, tokens del calendario, motivos de excusa y correos en los registros.

## Método

Cada ciclo siguió el mismo recorrido: descubrir, priorizar, escribir la spec y sus tickets como issues, probar, implementar, revisar, verificar y volver a escanear. Las reglas están en ADR-109; lo que conviene saber para leer el resto:

- **Orden de prioridad:** corrección, seguridad, integridad, simplicidad, mantenibilidad, testabilidad, observabilidad y rendimiento. Por eso seis de los siete primeros ciclos fueron de corrección, seguridad e integridad y solo el séptimo de estructura; del octavo al undécimo volvieron a la corrección, la seguridad y la red de pruebas, con lo diferido que nada frenaba; el duodécimo abrió los refactors de estructura que tenían spec, por el que no toca el código de la casa, el decimotercero siguió con la interfaz pública de los módulos, una poda que no cambia ninguna conducta, y el decimocuarto con las etiquetas de un enum, que pasan a leerse por valor; el decimoquinto volvió a la corrección y la seguridad, con la cola, el decimosexto siguió con lo que dejó su revisión, y el decimoséptimo tomó las reglas escritas dos veces, el registro y las pruebas.
- **Prueba en rojo primero.** Casi todo lo que la auditoría encontró estaba leído y no ejecutado. Cada ticket reprodujo su defecto con una prueba que fallaba antes de tocar el código; lo que no se reprodujo quedó como caracterización y no se «arregló».
- **Caracterización antes de tocar una zona sin red.** Campañas, el poller del outbox y la asistencia tuvieron primero pruebas en verde sobre el código como estaba.
- **Nadie revisa su propio trabajo.** Cada ticket lo implementó un agente y lo revisó otro con prueba de mutación: devolver el código a su versión anterior y ver la prueba fallar. Al final de cada ciclo, toda la rama pasó por tres ejes: estándares, spec, y uno que ejecuta escenarios de fallo y de concurrencia.
- **Las decisiones de dominio no las toma el código.** Lo que pedía elegir quedó en [decisiones abiertas](decisiones-abiertas.md), con sus opciones y una recomendación, y el código conservó la conducta que tenía, fijada con una prueba que nombra la decisión.
- **Código viejo no es código inútil.** Antes de consolidar o cambiar una conducta se rastrearon llamadores, pruebas, historial, la ADR que la decidió, la persistencia y los contratos públicos.

## Qué cambió, ciclo por ciclo

| Ciclo | PR | De qué fue | Migraciones |
| --- | --- | --- | --- |
| Dependencias | [#116](https://github.com/Mateoloperaortiz/LaOE/pull/116) | `next` 16.3.8 y `sharp` 0.35.5 por un aviso crítico de ejecución remota en `next/og` | Ninguna |
| Guarda | [#192](https://github.com/Mateoloperaortiz/LaOE/pull/192) | `db:release` falla si una migración del diario no se va a aplicar: Drizzle las salta en silencio cuando su marca de tiempo es anterior a la última aplicada (ADR-117) | Ninguna |
| 1 | [#133](https://github.com/Mateoloperaortiz/LaOE/pull/133) | Red de pruebas y defectos baratos: un solo drenado del outbox en las pruebas, la excusa libera el premio, «hoy» en Colombia, toda sanción declara su alcance, y el grafo de módulos sin ciclos, con una regla que rechaza uno nuevo (ADR-110 a ADR-112) | Ninguna |
| 2 | [#142](https://github.com/Mateoloperaortiz/LaOE/pull/142) | Seguridad e integridad: quién emite un enlace de acceso, tope y señuelo del código de ingreso, un solo decodificador de imágenes con límites, confirmación de medios por alcance, suscripciones de push acotadas, importaciones tomadas dentro de la transacción (ADR-113) | Ninguna |
| 3 | [#154](https://github.com/Mateoloperaortiz/LaOE/pull/154) | Seguridad y privacidad: una sola regla para los destinos internos, fallos del paso de seguridad contados por persona, registros sin correos, medios servidos siempre recodificados y sin metadatos (ADR-114) | Ninguna |
| 4 | [#173](https://github.com/Mateoloperaortiz/LaOE/pull/173) | Campañas de correo y tareas de GH: el lote reclama y registra con clave, cupo diario con margen para lo transaccional, y una sola entrada para toda tarea que abre el sistema (ADR-115) | 0047 a 0049, aditivas |
| 5 | [#215](https://github.com/Mateoloperaortiz/LaOE/pull/215) | Corrección, privacidad y permisos tras la primera ola de la auditoría: candado por asistencia, grupos y cierre de permanencia, fotos y avisos al anonimizar, exportes con paso de seguridad, ICS sin caracteres de control, corte por cuota con causa, y una E2E que ya no se traba (ADR-116) | Ninguna |
| 6 | [#222](https://github.com/Mateoloperaortiz/LaOE/pull/222) | Corrección tras la segunda ola: el poller cuenta el intento al tomar y no pierde cambios, handlers que toleran el reintento, membresía y representación, plazo de la excusa, exportes recortados, formularios que aguantan un fallo de red, y registro de lo que antes fallaba en silencio (ADR-118) | 0050, aditiva |
| 7 | [#226](https://github.com/Mateoloperaortiz/LaOE/pull/226) | Estructura: una asistencia cambia de estado por un solo camino, que valida cada cambio contra una tabla; los cuatro juegos comparten el cálculo del día, la guardia de la partida diaria y la acreditación por el ledger; y cinco restos de seguridad y robustez (ADR-119) | Ninguna |
| Remate | [#237](https://github.com/Mateoloperaortiz/LaOE/pull/237) | Catorce arreglos rápidos que salieron de la clasificación final: registros y outbox sin correos ni valores de consultas, conceder un permiso borra los enlaces de acceso vivos, la auditoría de un exporte lleva la IP, y varios de corrección. Más el estado final de cada fila del ledger y este informe | Ninguna |
| 8 | [#268](https://github.com/Mateoloperaortiz/LaOE/pull/268) | Lo diferido que nada frenaba: el roster cuenta cada fila por lo que escribió y no se interbloquea con una anonimización, la regla del emisor de un enlace lee bajo candado, la pantalla del check-in decide con la asistencia, el registro oculta las claves sensibles a cualquier profundidad y los datos de la conexión, `npm run check` pasa por la compuerta del CI, y un ayudante cuenta las consultas de una lectura (ADR-120) | Ninguna |
| 9 | [#272](https://github.com/Mateoloperaortiz/LaOE/pull/272) | La segunda tanda: pruebas de concurrencia para los candados que nadie ejercía, tres comandos de riesgo caracterizados y los recorridos E2E que faltaban; la IP del actor obligatoria en el tipo; el cierre de permanencia comprueba bajo candado y la lectura de una persona no crece con la OE; el cupo del correo por el día del proveedor; y una sola función para sumar días, para decir quién es nuevo y para subir un archivo al bucket (ADR-121) | Ninguna |
| 10 | [#285](https://github.com/Mateoloperaortiz/LaOE/pull/285) | La tercera tanda: quince comandos comprueban en su transacción el objeto de su página; los candados que faltaban en la etapa de un embudo, los cargos de un miembro, la emisión de un enlace y la revocación de un permiso; los retos se resuelven con su término; un aviso vencido no se entrega; The Games suelta lo vencido de su memoria; arreglos del navegador; y las pruebas que decían «a la vez» lo fuerzan (ADR-122) | Ninguna |
| 11 | [#297](https://github.com/Mateoloperaortiz/LaOE/pull/297) | La cola y la E2E local: la corrida completa local va contra el build; el roster marca la fila que no se puede aplicar; cuatro comandos más toman el candado del ciclo de membresía; dos auditorías con su IP; errores de entregas y premios en español; tres lecturas con una consulta menos; el registro sin rutas con comodín ni el host de la base; y una sola función para quitar acentos, leer el id de un alcance y restar días (ADR-123) | Ninguna |
| 12 | [#306](https://github.com/Mateoloperaortiz/LaOE/pull/306) | La base de las pruebas, sin tocar `src`: el vaciado saca su lista de PostgreSQL y devuelve los catálogos a una foto de la migración; la siembra pasa por una fábrica que comparten integración y E2E; y tres pruebas que leen el código impiden que vuelvan las listas a mano, las pruebas de simultaneidad sin forzar y los insert sueltos sin razón (ADR-124) | Ninguna |
| 13 | [#322](https://github.com/Mateoloperaortiz/LaOE/pull/322) | La interfaz pública de los módulos, sin cambio de conducta: trece `index.ts` dejan de exportar 517 nombres que nadie de afuera importaba, knip pasa a analizar sus exports, se borran 21 nombres sin ningún uso, y una prueba que lee el código no deja entrar un export sin consumidor (ADR-125) | Ninguna |
| 14 | [#324](https://github.com/Mateoloperaortiz/LaOE/pull/324) | Las etiquetas de un enum, por valor: `tLabels` no compila si la lista y el enum tienen distinto largo, 180 llamadas en 89 archivos conservan su respaldo, y una prueba que lee el código rechaza una lectura por posición nueva. Dos cambios de conducta que no se alcanzan en el uso normal (ADR-126) | Ninguna |
| 15 | [#337](https://github.com/Mateoloperaortiz/LaOE/pull/337) | La cola de los ciclos de estructura: la importación del roster valida otra vez con los candados tomados y propone el permiso de líder solo a quien deja en el comité, cuatro comandos más hacen cola en el ciclo de membresía, el lector cancela el arranque de la cámara, la cookie de sesión vive en un archivo y el registro no deja valores de una consulta en el mensaje (ADR-127) | Ninguna |
| 16 | [#348](https://github.com/Mateoloperaortiz/LaOE/pull/348) | Lo que dejó la revisión del ciclo 15: la pestaña de permanencia muestra el motivo de verdad de una decisión y ese motivo se guarda al confirmar, el registro no lanza por lo que le piden anotar, las asambleas firmadas se cuentan en una función, y tres trinquetes nuevos leen el código de las pruebas (ADR-128) | `0051_decision_motivo_de_la_propuesta.sql`, aditiva |
| 17 | [#360](https://github.com/Mateoloperaortiz/LaOE/pull/360) | Reglas escritas dos veces, el registro y las pruebas: la causal de la baja y el motivo de una salida salen de una sola regla, cuatro superficies cuentan las asambleas con las mismas funciones, el saneo de errores sale de `log.ts`, y los textos de error de las rutas de API quedan inventariados (ADR-129) | Ninguna |

## Cómo quedó

Lo que cambió de forma, más allá de cada defecto:

- **El grafo de módulos no tiene ciclos** y `npm run deps:check` rechaza uno nuevo. Eran siete módulos en una componente circular. Y el `index.ts` de un módulo exporta lo que alguien de afuera importa: eran 1.550 nombres y quedan 1.033, y una prueba que lee el código no deja entrar uno que producción no importe.
- **La etiqueta de un valor se lee por su valor.** `tLabels(código, ENUM)` no compila si la lista de etiquetas y el enum tienen distinto largo, y una prueba que lee el código rechaza la lectura por posición. Antes, un enum que ganaba un valor sin su etiqueta mostraba el código crudo o la etiqueta de otro valor, y nada fallaba.
- **Una sola puerta donde había varias copias.** Abrir una tarea de GH (`openTaskForReason`), cerrar una pertenencia a un comité (`closeCommitteeMembership`), abrir una imagen (`decodeImage`), decidir a dónde se vuelve (`internalPath`), tomar la fila de una asistencia (`lockCheckIns`), drenar el outbox en una prueba (`drainOutbox`), atrapar el rechazo de una acción en un formulario (`useGuardedActionState`), cambiar el estado de una asistencia (`transitionCheckIn`), guardar la partida diaria de un juego (`daily-game-guard.ts`), acreditarla (`creditGame`), decidir por qué un registro propio no procede (`selfCheckInEligibilityDenial`), decir quién es nuevo en un término (`isNewMemberInTerm`), sumar días a un día (`addDays`) y subir un archivo al bucket desde el navegador (`uploadToBucket`).
- **El permiso vive en el comando y falla cerrado.** Sanciones, confirmación de medios, corte de cuota y margen de correo exigen un alcance declarado, obligatorio, que rechaza lo que no reconoce. Y quince comandos que recibían un id suelto comprueban en su transacción que ese id es del objeto de la página desde donde se lo mandan.
- **Un orden de candados escrito.** La asistencia, el cierre de permanencia, el calendario de términos y el ciclo de membresía toman sus candados en un orden que está en las ADR y tiene pruebas con las dos llegadas. Cada candado de un comando tiene además una prueba de concurrencia que falla si se quita.
- **La entrega de eventos aguanta una caída.** El poller toma en dos pasos, cuenta el intento antes de correr y guarda la clave del evento tomado; un evento que tumba el proceso gasta cinco intentos con su espera y va a dead letter.
- **Privacidad después de anonimizar.** Se borran las fotos con sus objetos, el token del calendario y los motivos de excusa de las asistencias; un aviso atrasado no sale. Los registros y el último error de un evento no llevan correos, endpoints, los valores de una consulta que falla ni el usuario y la base de la conexión, y las claves sensibles salen ocultas a cualquier profundidad.
- **Una red de pruebas que entra por la interfaz de los módulos**, contra Postgres real, con el reloj inyectado y ayudantes para forzar el orden de dos comandos sin esperas y para contar las consultas de una lectura. La base de esas pruebas se vacía con una lista que sale de PostgreSQL y vuelve sus catálogos a una foto de la migración, y la siembra pasa por una fábrica que comparten integración y E2E: fuera de ella, cada escritura a mano tiene su razón escrita, y una prueba que lee el código no deja entrar otra.
- **La verificación local es la del CI.** `npm test` y `npm run test:integration` pasan su informe por la comprobación de la compuerta: un caso saltado falla en la máquina de quien lo escribe.

| Qué | Línea base | Tras el ciclo 17 |
| --- | --- | --- |
| Líneas en `src`, sin el catálogo de textos | 116.434 en 739 archivos | 125.700 en 787 archivos |
| Funciones de más de 100, 200 y 300 líneas | 179, 60 y 23 | 188, 59 y 23 |
| Funciones con complejidad mayor a 30 | 64 | 68 |
| Archivos de más de 500 y de 1.000 líneas | 46 y 6 | 49 y 6 |
| Símbolos que exportan `participation`, `people` y `crm` | 384, 235 y 150 | 194, 175 y 94 |
| Nombres de función declarados en dos o más archivos | 99 | 94 |
| Eventos de dominio en el catálogo | 66 | 68 |
| Módulos de dominio en una componente circular | 7 | 0, con una regla que rechaza uno nuevo |
| Sitios que insertaban una tarea de GH fuera de su módulo | 5 | 0 |
| Insert sueltos en las pruebas, fuera de la fábrica | 320 al empezar el ciclo 12 | 79, cada uno con su razón |
| Nombres que un `index.ts` exporta sin que producción los importe de afuera | 626 de 1.550 al empezar el ciclo 13 | 109 de 1.033: 67 que solo importan las pruebas y 42 de `competition` |
| Etiquetas de un enum leídas por su posición en una lista | 126 con `indexOf`, 50 recorridos, 11 con el índice guardado y 12 pares `zip` al empezar el ciclo 14 | 1, 3, 4 y 0: pares de largo distinto o lecturas que no son la etiqueta de un enum, cada una con su razón |
| Archivos de `src` que insertan puntos | 5 (el ledger y los cuatro juegos) | 1 |
| Pruebas unitarias y de integración | 855 y 603 | 2.434 y 1.907 |
| Avisos de `npm audit` | 13, uno crítico | 13 en la pila; 8 y ninguno crítico con el #116 mezclado |

Las métricas de tamaño crecieron, y es lo esperado: seis ciclos agregaron código de guarda y pruebas, no lo quitaron. El ciclo de estructura movió poco el tamaño y sí el lugar de las reglas: un solo sitio escribe una asistencia y un solo sitio inserta puntos. Lo que sigue igual de grande es lo que quedó diferido como estructura: la interfaz pública de `participation`, las páginas largas y las piezas base de interfaz.

## Verificación

Cada ciclo cerró con `npm run check` completo (lint, tipos, reglas de dependencias, código muerto, unitarias, extractor, integración y build) y la E2E entera en local, y su PR con el CI en verde.

| Ciclo | Unitarias | Integración | E2E |
| --- | --- | --- | --- |
| Línea base | 855 | 603 | Sin registro |
| 1 | 864 | 634 | 219 de 221; las dos que fallaron pasaron tres de tres al repetirlas |
| 2 | 934 | 698 | 221 de 221 |
| 3 | 973 | 763 | 220 de 221; la que falló pasó tres de tres al repetirla |
| 4 | 984 | 845 | 219 de 221 a la primera, 221 de 221 al repetirla entera |
| 5 | 1.064 | 1.014 | 222 de 222 a la primera |
| 6 | 1.145 | 1.124 | 223 de 223 a la primera |
| 7 | 1.158 | 1.250 | 222 de 223 a la primera, 223 de 223 al repetirla entera |
| Remate | 1.170 | 1.271 | 223 de 224 a la primera, por la prueba de SEO; 224 de 224 pegada al check, con la causa corregida (DT-188) |
| 8 | 1.255 | 1.382 | 229 de 229 a la primera, pegada al check |
| 9 | 1.301 | 1.472 | 241 de 241 a la primera, pegada al check |
| 10 | 1.352 | 1.574 | 247 de 249 a la primera, contra `next dev` sin nada compilado; 249 de 249 las dos siguientes, una contra el build (DT-338) |
| 11 | 1.452 | 1.660 | 250 de 250 a la primera, contra el build, que desde este ciclo es el camino de la corrida completa |
| 12 | 1.484 | 1.703 | 250 de 250 a la primera, contra el build |
| 13 | 1.510 | 1.704 | 250 de 250 a la primera, contra el build |
| 14 | 1.998 | 1.743 | 250 de 250 a la primera, contra el build |
| 15 | 2.120 | 1.870 | 256 de 256 |
| 16 | 2.297 | 1.890 | 256 de 256 |
| 17 | 2.434 | 1.907 | 256 de 256 |

Las E2E que fallaron a la primera tenían cuatro causas, y las cuatro quedaron arregladas:

- **Ciclos 3 y 4:** la restauración de la base entre pruebas truncaba todas las tablas y se trababa en un checkpoint de Postgres. El ciclo 5 lo diagnosticó y cambió la restauración para que borre en vez de truncar.
- **Ciclo 1:** una partida de 2048 al azar que no alcanzó premio. El ciclo 7 dejó de suponerlo, y la prueba pasó veinte corridas seguidas.
- **Ciclos 1 y 7 y el remate:** dos pruebas largas, la de la operación de The Games y la de SEO, pasaron su límite de 30 segundos. La causa se encontró en el cierre: la suite de integración truncaba más de cien tablas antes de cada prueba y le dejaba a Postgres cerca de un millón de archivos; mientras la base los limpiaba, las pruebas de la E2E que caían en esos minutos tardaban varias veces más (la de SEO, 4 segundos sola y 29 a 31 pegada a un check). Ahora la suite borra y pasa `VACUUM`, que conserva el orden de inserción de las filas: tarda cerca de un tercio menos y sus checkpoints bajan de 944.935 archivos a menos de 7.000 (DT-188, ADR-119 regla 23). El primer ensayo, que solo borraba, destapó una prueba que dependía del orden físico; por eso el arreglo tardó una vuelta más.
- **Ciclo 10:** dos pruebas del Sudoku se quedaron sin tiempo en la primera E2E completa de su worktree. No era Postgres ni el check. En local la E2E corre contra `next dev`, que compila cada ruta la primera vez que se visita; una corrida completa sin nada compilado se atasca hacia su minuto 8, con el servidor en unos 9 GB de memoria, y lo que cae ahí se queda sin tiempo. Se reprodujo a propósito, borrando lo compilado: la prueba de SEO tarda 27 segundos en frío, 3,4 con lo compilado guardado y 0,7 contra el build, y el Sudoku solo pasa en un segundo también en frío. En los ciclos 8 y 9 la misma ventana le había caído a la prueba de The Games, que pasó por su límite ampliado. Lo de DT-188 era cierto y está corregido, pero no era la única causa: los 3,5 segundos que este informe daba por la prueba de SEO se midieron en un worktree donde la E2E ya había corrido. Más memoria para el servidor y esperas más largas se probaron y no alcanzaron. El ciclo 11 lo arregló de fondo: sin filtro, `npm run test:e2e` compila y corre contra el build, como el CI, y una corrida completa en frío pasa entera; con filtro sigue contra dev, que es donde sirve para iterar (DT-338, ADR-123 regla 1).

El CI rechazó la primera subida del ciclo 7 con todos sus trabajos en verde: su compuerta no admite casos saltados y `npm run check` sí. Se corrigió, y el ciclo 8 cerró la diferencia: `npm test` y `npm run test:integration` pasan ahora por esa misma comprobación (DT-282).

Lo que **no** se verificó, y conviene saberlo:

- Nada corrió contra producción ni contra staging: ni las migraciones, ni Resend, ni el bucket, ni el servicio de push.
- La convivencia del poller nuevo con el de la versión anterior durante un despliegue está razonada y probada a nivel de fila, no contra el build anterior.
- La salida con push y el lector del carnet no se probaron en un teléfono.

## Riesgos

- **Producción recibió diecisiete ciclos de una vez.** La pila entró a `main` en una sola mezcla el 2026-10-13, después de siete días sin que `main` se moviera; staging la desplegó en un solo paso y producción hizo el mismo recorrido esa noche. El CI corrió sobre la combinación final, la casa arrancó en limpio y los dos smoke pasaron, pero nadie entró todavía con una sesión a mirar las pantallas que cambian. Lo que no se pudo ensayar antes está en la tabla de «Cómo seguir».
- **Las cinco migraciones de la pila ya están aplicadas** (0047 a 0051, todas aditivas), en staging y en producción. La guarda del #192 corrió en los dos pre-deploy y registró el diario entero, 52 migraciones. De acá en adelante, si una rama trae una migración generada antes que la última de `main`, `db:release` falla en vez de saltarla (DT-128).
- **El aviso crítico de `next/og` quedó cerrado** con el #116: producción arranca con Next 16.3.8. Queda lo que la fila DT-053 deja aceptado (`node-forge`, `uuid` y `esbuild`). Dependabot intenta subir `uuid` y `esbuild` en `main` y falla, y un chequeo suyo fallido hace que Railway salte el despliegue de ese commit: está en el runbook.
- **Un dato sensible sobrevive a la anonimización** hasta que se cierre la decisión 10: el motivo de una excusa, una licencia o una renuncia, que puede ser médico, queda en la solicitud y en la auditoría. Lo ven GH y ADMIN (DT-100). Y una persona anonimizada todavía se puede editar abriendo el panel por su dirección, porque el comando no mira la anonimización (DT-296, decisión 61); salió al redactar las specs y está leído, no ejecutado.
- **Durante un despliegue conviven dos versiones del poller.** La anterior da por procesado un evento cuyo tipo no conoce (decisión 40), y la pila agrega dos tipos nuevos, uno de ellos programado al minuto 20 de cada hora. Producción cambió de contenedor a las 02:31 UTC, lejos de ese minuto.
- **Hay cambios de conducta a la vista de las personas.** Cada PR los lista. Los que más se notan: una campaña grande dura días por el cupo diario; quien vuelve a un grupo de trabajo queda con la evaluación pendiente; los formularios con estado ya no se envían sin JavaScript; una campaña que agota el cupo del día retoma a las 7:00 p. m. y no a la medianoche; crear solo el término siguiente falla si se cruza con el vigente; y conceder un permiso mata el enlace de activación que esa persona tuviera sin usar.
- **82 decisiones de dominio siguen abiertas.** El código conserva en cada una la conducta anterior, pero varias tapan defectos reales que no se pueden corregir sin elegir.
- **Dos comprobaciones piden tocar servicios reales y no se hicieron antes de promover:** probar qué hace Resend con una clave de idempotencia que recibió un error (DT-182) y saber cuándo reinicia su cupo mensual (DT-184). El cupo diario ya no pide preguntarle: su documentación dice que cuenta por día UTC, y el ciclo 9 lo corrigió (DT-125).

## Deuda que queda

Todo hallazgo del ledger terminó en uno de los cuatro estados de ADR-109. La clasificación final leyó cada fila que seguía abierta contra el código de ese día, con un segundo lector para lo que no quedó diferido, lo de riesgo alto y lo marcado como arreglo rápido; los arreglos rápidos se corrigieron en el remate en vez de diferirse.

| Prioridad | Resueltos | Diferidos | Aceptados | No eran deuda |
| --- | --- | --- | --- | --- |
| Corrección | 65 | 73 | 1 | 0 |
| Seguridad | 35 | 25 | 3 | 0 |
| Privacidad | 5 | 1 | 0 | 0 |
| Integridad | 12 | 24 | 2 | 2 |
| Simplicidad | 8 | 8 | 0 | 0 |
| Mantenibilidad | 28 | 47 | 2 | 0 |
| Testabilidad | 26 | 5 | 1 | 0 |
| Observabilidad | 13 | 9 | 0 | 0 |
| Rendimiento | 6 | 4 | 0 | 0 |
| Sin prioridad | 0 | 0 | 0 | 3 |
| **Total** | **198** | **196** | **9** | **5** |

Lo diferido, por lo que lo destraba:

- **131 esperan una decisión de dominio.** Están en [decisiones-abiertas.md](decisiones-abiertas.md), cada una con sus opciones, una recomendación y su ticket. Las que más filas destraban: la 8 (8), la 42 (5), la 7 (4), la 18 (4), la 28 (4), la 38 (4).
- **32 piden mirar staging o producción** antes de poder cerrarse: un conteo de solo lectura, una medición o una prueba contra un proveedor real. Varias caben en una sola sesión del túnel de solo lectura.
- **La estructura que el plan cierra sin hacer**, cada pieza con sus filas y su spec, escrita contra el código del cierre y comprobada por un segundo lector, sin implementar: el resultado de una acción, que hoy tiene cinco convenciones (DT-014, [#239](https://github.com/Mateoloperaortiz/LaOE/issues/239)); las piezas base de interfaz y las páginas largas, que van juntas (DT-015, DT-047 y DT-027, [#240](https://github.com/Mateoloperaortiz/LaOE/issues/240)); la biblioteca de juegos (DT-032, [#241](https://github.com/Mateoloperaortiz/LaOE/issues/241)); el cargo principal derivado (DT-039, [#243](https://github.com/Mateoloperaortiz/LaOE/issues/243)); el poller por handler (DT-016, [#245](https://github.com/Mateoloperaortiz/LaOE/issues/245)); y, escrita al cierre del ciclo 16, la prueba que cuida los exportes con datos personales, que pasa a leerlos con el compilador (DT-346, [#349](https://github.com/Mateoloperaortiz/LaOE/issues/349)). La base de las pruebas de integración ([#244](https://github.com/Mateoloperaortiz/LaOE/issues/244)), la interfaz pública de los módulos ([#238](https://github.com/Mateoloperaortiz/LaOE/issues/238)) y las etiquetas por valor ([#242](https://github.com/Mateoloperaortiz/LaOE/issues/242)) ya se hicieron, en los ciclos 12, 13 y 14.
- **Rendimiento**, cuatro filas. Ninguna está medida como problema a la escala de hoy, unas 470 personas. El ayudante que cuenta consultas existe desde el ciclo 8, que fijó con él tres lecturas; las demás esperan una medición en staging o su ticket.
- **Dependencias:** tres saltos mayores pendientes, TypeScript, Vitest y los tipos de Node (DT-237). Esperaban la mezcla y ya se pueden subir, uno por vez.
- **El resto son tickets chicos**: cada fila dice cuál en su nota de cierre. Los que no esperaban nada los tomaron los ciclos 8 a 11 y, de la cola que dejaron los siguientes, el 15, el 16 y el 17. Las filas chicas que siguen quedan cada una con lo que la destraba.

Por riesgo, de las 144 filas diferidas que tienen su riesgo escrito: 1 de riesgo alto, 38 de riesgo medio y 105 de riesgo bajo. Las demás esperan una decisión ya numerada y no se volvieron a leer. La de riesgo alto es DT-100, la del dato sensible que sobrevive a la anonimización. Las otras dos que lo eran, DT-053 y DT-128, quedaron resueltas al mezclar y promover el #116 y el #192.

## Bloqueos

Cuatro cosas no dependen de más código. Van en el formato que pide el objetivo.

### Mezclado y promovido el 2026-10-13

- **Problema.** Hasta el 2026-10-13 todo el refactor vivía en ramas y producción seguía en el `main` del 2026-10-06, con el aviso crítico de `next/og`.
- **Evidencia.** Mateo lo autorizó ese día con su frase («empieza a mezclar y promueve a producción todo cuando esté listo»). Entraron a `main`, en este orden: el #116 (`ec4da9b`), el #192 (`df261f8`) y la pila entera con el #360 (`7d9eb50`). Los otros diecisiete PR de la pila quedaron mezclados con él, porque sus commits quedaron dentro de `main`. El CI pasó completo sobre la rama del #192 ya al día, sobre la pila con `main` adentro y sobre `main` después de cada mezcla.
- **Intentos.** La pila chocaba con el #192 en cuatro documentos, todos de «los dos agregaron en el mismo sitio», y se resolvieron conservando los dos lados. Un choque no era de texto: el trinquete de la siembra de las pruebas (ciclo 12) rechazaba un `insert` suelto de la prueba nueva del #192, y ganó su excepción. Railway no desplegó solo el commit de la pila en staging: espera todos los chequeos del commit, y Dependabot dejó dos fallidos encima, sus intentos de actualizar `uuid` y `esbuild`. Se le pidió a mano que desplegara ese commit, y staging aplicó las cinco migraciones nuevas, arrancó en limpio y respondió en `/api/health` con `7d9eb50`.
- **Qué se hizo.** Se promovió `e678038`, el commit que staging validó: la pila más un PR de solo documentos (#361), que dejó un commit sin los chequeos fallidos de Dependabot. Railway tampoco creó solo el despliegue de producción y se le pidió a mano, como en staging. El pre-deploy aplicó las cinco migraciones y registró las 52 del diario, la casa arrancó en limpio, `/api/health` responde con ese commit y el smoke de producción pasó.
- **Lo que no se hizo.** Los conteos en producción que varios ciclos pedían antes de promover, porque no se abrió el túnel de solo lectura, y las comprobaciones que piden una sesión o un teléfono. No frenaban la promoción: las cinco migraciones son aditivas, staging y producción traen `MAILER` escrito, y si el diario no coincidía `db:release` fallaba y Railway dejaba el contenedor anterior. Quedan en la tabla de «Cómo seguir».

### 131 filas esperan una decisión de dominio

- **Problema.** El código no puede elegir qué es el fin del término, qué conserva quien vuelve antes de que se procese su baja o si un formulario público liga a una persona por su correo. Cada una de esas preguntas tapa defectos que no se pueden corregir sin elegir.
- **Evidencia.** [decisiones-abiertas.md](decisiones-abiertas.md) tiene 82 abiertas, cada una con sus opciones, una recomendación y su ticket bajo el mapa [#117](https://github.com/Mateoloperaortiz/LaOE/issues/117). 131 filas diferidas del ledger nombran la suya.
- **Intentos.** En cada caso el código conservó la conducta de hoy, fijada con una prueba que nombra la decisión, y se corrigió todo lo vecino que no la pedía.
- **Opciones.** (a) Responderlas por tandas, empezando por las que más filas destraban y por las dos de privacidad (10 y 61). (b) Aceptar por escrito la recomendación de las que no tengan discusión, y dejar solo las demás para conversar con GH.
- **Recomendación.** (b): la mayoría trae una recomendación que casi no admite otra respuesta, y con eso se puede abrir un ciclo que las aplique.

### 32 filas piden mirar staging o producción

- **Problema.** Hay arreglos que no se pueden cerrar sin un dato de afuera: cuántas filas hay de cierto tipo en producción, qué hace Resend con una clave de idempotencia que recibió un error, cuánta memoria usa el decodificador en el contenedor real.
- **Evidencia.** Las filas lo dicen en su nota de cierre. Las que condicionan una promoción están en la tabla de «Cómo seguir».
- **Intentos.** Todo se probó con proveedores de mentira, el bucket local y el Postgres local. No se abrió el túnel ni se tocó staging.
- **Opciones.** (a) Una sola sesión del túnel de solo lectura, autorizada por Mateo, que saque todos los conteos de una vez. (b) Ir sacándolos a medida que se promueve cada ciclo.
- **Recomendación.** (a). Ya no condiciona ninguna promoción, porque todo está en producción, pero son consultas de totales, sin datos de personas, y varias deciden si una migración de datos hace falta.

### Quedan 29 filas que no esperan una decisión ni producción

- **Problema.** Quedan 29 filas diferidas que no esperan una decisión de dominio, un PR ni una mirada a producción. Tomarlas en ciclos nuevos rinde cada vez menos.
- **Evidencia.** El ciclo 15 resolvió 6 filas y abrió 14; el 16 resolvió 7 y abrió 10; el 17 resolvió 7 y abrió 7. De las 29: cuatro esperan al dueño o a un proveedor (DT-042, DT-043, DT-184 y DT-185); una tiene su spec escrita y sin hacer (DT-346, [#349](https://github.com/Mateoloperaortiz/LaOE/issues/349)); dos esperan que aparezca algo que hoy no existe (DT-307 y DT-380); y 22 se pueden tomar, contando los saltos mayores de dependencias (DT-237), que esperaban la mezcla. Aparte de las 29, la mezcla destrabó otras dos: regenerar las tablas de duración del CI (DT-037) y el renombre de las pruebas E2E (DT-278). De esas 24 ninguna es de corrección ni de seguridad: son de mantenibilidad, de pruebas o del registro, todas de riesgo bajo, y cada una dice qué la destraba.
- **Intentos.** Los ciclos 8 a 11 y del 15 al 17 fueron siete tandas de esas filas, siempre con corrección y seguridad primero. El 16 encontró así un defecto real en la pestaña de permanencia; el 17 encontró tres preguntas de dominio al caracterizar reglas escritas dos veces, y su revisión, una regresión de su propia corrección, que quedó cerrada en el mismo ciclo.
- **Opciones.** (a) Un ciclo 18 con las que se pueden tomar: las etiquetas, la paridad de la fábrica de pruebas, las herramientas de pruebas, el cupo de correo y los olores de las revisiones viejas. (b) Parar acá y tomar lo que quede como tickets sueltos sobre `main`, donde cada uno se revisa y se publica solo. (c) Aceptar por escrito las filas de forma que no valga la pena tocar.
- **Recomendación.** (b). Lo que queda no tapa un defecto conocido, y con la pila ya mezclada cada ticket puede ir solo contra `main`, con su revisión y su publicación. Mateo pidió el 2026-10-13 que el ciclo 18 no se abra hasta que él lo diga.

## Cómo seguir

Cómo se mezcló, el 2026-10-13:

1. **#116**, las dependencias, primero y solo.
2. **#192**, la guarda de migraciones, con su rama puesta al día y su CI. Staging la desplegó y la guarda corrió contra su base: registró las 47 migraciones del diario como aplicadas.
3. **La pila, en una sola mezcla.** `main` entró a la rama del ciclo 17, los dieciocho PR se reapuntaron a `main` y se mezcló el #360 con su CI en verde. Los demás quedaron mezclados con él. Ninguna rama se borró.

Cómo se promovió, esa misma noche: el SHA exacto que staging validó (`e678038`), con `git fetch origin main` antes y el empuje a `production` del runbook; el CI de `production` pasó en modo promoción, y como Railway no creó el despliegue se le pidió con `railway redeploy --from-source`. Después se comprobó el SHA de `/api/health` de producción y su smoke.

Lo que cada ciclo pedía comprobar. Lo de «antes» que pedía un conteo en producción o una sesión en staging no se hizo, y lo de «después» sigue pendiente:

| Ciclo | Qué comprobar |
| --- | --- |
| 2 | Contar en producción los hosts de las suscripciones de push (DT-090) y medir en staging la memoria del decodificador (DT-089) |
| 3 | Después de promover, comprobar que el relleno de la variante completa de los medios avanzó |
| 4 | Contar si hay tareas repetidas antes del índice único (DT-123). El cupo diario de Resend cuenta por día UTC y el ciclo 9 lo corrige: mientras el 9 no esté promovido, una campaña que mande su cupo después de las 7:00 p. m. y vuelva a mandar a la medianoche pasa el tope del proveedor (DT-125) |
| 5 | Probar en staging la clave de idempotencia contra Resend (DT-182); contar las fotos de personas ya anonimizadas, que la primera depuración diaria borra |
| 6 | Mirar las fechas de los términos de producción (DT-263); repetir la comprobación de DT-128 para las migraciones 0047 a 0050 |
| 7 | Nada antes. Después: mirar en el registro si aparece la línea de una conexión cerrada por la base (DT-238) y comprobar una imagen alta y angosta en un medio real |
| Remate | Avisarle a la junta que un enlace de activación emitido antes de conceder un permiso deja de servir y hay que emitir otro |
| 8 | Avisarle a GH que el resumen de una importación del roster puede contar más filas actualizadas que las que anunció la vista previa. Después: mirar en el registro la línea de un error de consulta sin capturar (DT-306) y tener presente que un fallo al emitir el carnet sale en nivel `error` |
| 9 | Confirmar que staging y producción traen `MAILER` escrito: sin él la casa ya no arranca. Avisarle a Comunicaciones que una campaña que agota el cupo retoma a las 7:00 p. m. y no a la medianoche. Después: mirar `/api/health` |
| 10 | Comprobar en staging que entregar una evidencia con imágenes responde en un tiempo normal: su transacción dura ahora lo que tarda el bucket en responder por cada imagen. Después: mirar en el registro la línea de un aviso vencido que no se entregó |
| 11 | Nada antes. Después: mirar en el registro que la línea de un fallo al conectar no lleve el host de la base |
| 12 | Nada: solo toca pruebas y herramientas |
| 13 | Nada: es una poda sin cambio de conducta ni migraciones |
| 14 | Nada antes. Después: abrir la consola en vivo de una ocasión y mirar que las etiquetas de fuente, estado y contadores salgan como antes |
| 15 | Nada antes. Después: subir un roster de prueba en staging y mirar la vista previa, abrir el lector del carnet en un teléfono y detenerlo antes de contestar el permiso, y entrar y salir una vez |
| 16 | Antes: la migración `0051_decision_motivo_de_la_propuesta.sql` agrega una columna anulable y no toca filas. Después: abrir la pestaña de permanencia de una persona con una decisión confirmada y mirar su motivo |
| 17 | Nada antes. Después: aplicar un cierre de permanencia de prueba en staging y mirar la causal de una baja, y abrir la mesa de cumplimiento y su CSV |

Las decisiones abiertas están en [decisiones-abiertas.md](decisiones-abiertas.md), cada una con su ticket bajo el mapa [#117](https://github.com/Mateoloperaortiz/LaOE/issues/117). Cerrar una decisión destraba sus filas del ledger, que dicen cuál esperan.
