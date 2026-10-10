# Informe del refactor progresivo

Cierre del objetivo que Mateo fijó el 2026-10-06 ([ADR-109](adr/ADR-109-refactor-progresivo-con-ledger-de-deuda.md)): llevar la casa a un estado sólido, mantenible, testeable y seguro con una refactorización por ciclos, sin reescritura total y con un registro persistente de la deuda. Este documento dice de dónde se partió, qué cambió, cómo quedó, qué riesgos hay y qué deuda queda. El detalle de cada hallazgo vive en el [ledger](20-deuda-tecnica.md) y el de cada ciclo en el [roadmap](09-roadmap.md).

## En corto

- **Siete ciclos y un remate**, del 2026-10-06 al 2026-10-09: seis ciclos de corrección, seguridad e integridad, uno de estructura, y al final los arreglos rápidos que salieron de clasificar lo que quedaba. Más un arreglo de dependencias vulnerables y una guarda de migraciones, los dos contra `main`.
- **Nada está mezclado.** Todo vive en diez PR abiertos, ocho de ellos apilados. Mezclar y promover piden la decisión de Mateo, y cada ciclo trae su lista de comprobaciones previas (sección «Cómo seguir»).
- **El repositorio se leyó entero.** Una revisión de arquitectura, un descubrimiento de seguridad y dos olas de una auditoría de huecos, cada hallazgo de severidad media o alta con un segundo lector que intentó tumbarlo.
- **Ledger:** 295 hallazgos, todos en un estado final. 110 resueltos, 172 diferidos con lo que los destraba y el riesgo de dejarlos, 8 aceptados y 5 que no eran deuda. De los diferidos, 93 esperan una de las 60 decisiones abiertas.
- **Pruebas:** de 855 unitarias y 603 de integración a 1.170 y 1.271. La E2E pasa entera cuando corre sola; pegada a `npm run check`, dos pruebas largas todavía tardan de más por lo que la suite de integración le deja a Postgres, y tienen el límite ampliado mientras se corrige la causa (DT-188).
- **Lo más urgente no es código:** mezclar y promover el #116, porque producción sigue con un aviso crítico, y mezclar el #192 antes que la pila, porque sin él una migración se puede saltar en silencio.

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

- **Orden de prioridad:** corrección, seguridad, integridad, simplicidad, mantenibilidad, testabilidad, observabilidad y rendimiento. Por eso seis de los siete ciclos fueron de corrección, seguridad e integridad y solo el último de estructura.
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

## Cómo quedó

Lo que cambió de forma, más allá de cada defecto:

- **El grafo de módulos no tiene ciclos** y `npm run deps:check` rechaza uno nuevo. Eran siete módulos en una componente circular.
- **Una sola puerta donde había varias copias.** Abrir una tarea de GH (`openTaskForReason`), cerrar una pertenencia a un comité (`closeCommitteeMembership`), abrir una imagen (`decodeImage`), decidir a dónde se vuelve (`internalPath`), tomar la fila de una asistencia (`lockCheckIns`), drenar el outbox en una prueba (`drainOutbox`), atrapar el rechazo de una acción en un formulario (`useGuardedActionState`), cambiar el estado de una asistencia (`transitionCheckIn`), guardar la partida diaria de un juego (`daily-game-guard.ts`) y acreditarla (`creditGame`).
- **El permiso vive en el comando y falla cerrado.** Sanciones, confirmación de medios, corte de cuota y margen de correo exigen un alcance declarado, obligatorio, que rechaza lo que no reconoce.
- **Un orden de candados escrito.** La asistencia, el cierre de permanencia y el calendario de términos toman sus candados en un orden que está en las ADR y tiene pruebas con las dos llegadas.
- **La entrega de eventos aguanta una caída.** El poller toma en dos pasos, cuenta el intento antes de correr y guarda la clave del evento tomado; un evento que tumba el proceso gasta cinco intentos con su espera y va a dead letter.
- **Privacidad después de anonimizar.** Se borran las fotos con sus objetos, el token del calendario y los motivos de excusa de las asistencias; un aviso atrasado no sale. Los registros y el último error de un evento no llevan correos, endpoints ni los valores de una consulta que falla.
- **Una red de pruebas que entra por la interfaz de los módulos**, contra Postgres real, con el reloj inyectado y ayudantes para forzar el orden de dos comandos sin esperas.

| Qué | Línea base | Al cierre |
| --- | --- | --- |
| Líneas en `src`, sin el catálogo de textos | 116.434 en 739 archivos | 122.581 en 766 archivos |
| Funciones de más de 100, 200 y 300 líneas | 179, 60 y 23 | 183, 59 y 23 |
| Funciones con complejidad mayor a 30 | 64 | 65 |
| Archivos de más de 500 y de 1.000 líneas | 46 y 6 | 47 y 5 |
| Símbolos que exportan `participation`, `people` y `crm` | 384, 235 y 150 | 384, 240 y 150 |
| Nombres de función declarados en dos o más archivos | 99 | 96 |
| Eventos de dominio en el catálogo | 66 | 68 |
| Módulos de dominio en una componente circular | 7 | 0, con una regla que rechaza uno nuevo |
| Sitios que insertaban una tarea de GH fuera de su módulo | 5 | 0 |
| Archivos de `src` que insertan puntos | 5 (el ledger y los cuatro juegos) | 1 |
| Pruebas unitarias y de integración | 855 y 603 | 1.170 y 1.271 |
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
| Remate | 1.170 | 1.271 | 223 de 224 a la primera, 224 de 224 al repetirla entera |

Las E2E que fallaron a la primera tenían tres causas. Dos quedaron arregladas y una tiene un parche:

- **Ciclos 3 y 4:** la restauración de la base entre pruebas truncaba todas las tablas y se trababa en un checkpoint de Postgres. El ciclo 5 lo diagnosticó y cambió la restauración para que borre en vez de truncar.
- **Ciclo 1:** una partida de 2048 al azar que no alcanzó premio. El ciclo 7 dejó de suponerlo, y la prueba pasó veinte corridas seguidas.
- **Ciclos 1 y 7 y el remate:** dos pruebas largas, la de la operación de The Games y la de SEO, pasaron su límite de 30 segundos. La causa se encontró en el cierre: la suite de integración sigue truncando más de cien tablas antes de cada prueba y le deja a Postgres cerca de un millón de archivos; mientras la base los limpia, las pruebas de la E2E que caen en esos minutos tardan varias veces más (la de SEO, 4 segundos sola y 29 a 31 pegada a un check). Las dos tienen ahora el límite de las pruebas largas, que es un parche. El arreglo se ensayó, la suite bajó de 300 a 187 segundos, y no entró: destapa pruebas que dependen del orden físico de las filas y pide su propia validación (DT-188).

El CI rechazó la primera subida del ciclo 7 con todos sus trabajos en verde: su compuerta no admite casos saltados y `npm run check` sí. Se corrigió, y la diferencia quedó anotada (DT-282).

Lo que **no** se verificó, y conviene saberlo:

- Nada corrió contra producción ni contra staging: ni las migraciones, ni Resend, ni el bucket, ni el servicio de push.
- La convivencia del poller nuevo con el de la versión anterior durante un despliegue está razonada y probada a nivel de fila, no contra el build anterior.
- La salida con push y el lector del carnet no se probaron en un teléfono.

## Riesgos

- **La pila es larga y nada está mezclado.** Ocho PR apilados sobre `main`, que no se movió desde el 2026-10-06. Si `main` recibe cambios, cada eslabón pide ponerse al día. Mezclar el #192 primero hace chocar la pila en los documentos que los dos editan (el índice de decisiones, el roadmap y el índice de ADR): son conflictos de texto, no de código.
- **Cuatro migraciones esperan en la pila** (0047 a 0050), todas aditivas. Si `main` recibe otra migración antes, hay que volver a generarlas: Drizzle saltaría las más viejas sin avisar (DT-128). La guarda del #192 lo detecta y tiene que mezclarse primero.
- **Producción sigue con el aviso crítico de `next/og`** hasta que se mezcle y promueva el #116. Dependabot abrió por su cuenta el #172 con la misma subida de `next`: sobra uno de los dos.
- **Un dato sensible sobrevive a la anonimización** hasta que se cierre la decisión 10: el motivo de una excusa, una licencia o una renuncia, que puede ser médico, queda en la solicitud y en la auditoría. Lo ven GH y ADMIN (DT-100).
- **Durante un despliegue conviven dos versiones del poller.** La anterior da por procesado un evento cuyo tipo no conoce (decisión 40), y la pila agrega dos tipos nuevos, uno de ellos programado al minuto 20 de cada hora: conviene promover lejos de ese minuto.
- **Hay cambios de conducta a la vista de las personas.** Cada PR los lista. Los que más se notan: una campaña grande dura días por el cupo diario; quien vuelve a un grupo de trabajo queda con la evaluación pendiente; los formularios con estado ya no se envían sin JavaScript; crear solo el término siguiente falla si se cruza con el vigente; y conceder un permiso mata el enlace de activación que esa persona tuviera sin usar.
- **60 decisiones de dominio siguen abiertas.** El código conserva en cada una la conducta anterior, pero varias tapan defectos reales que no se pueden corregir sin elegir.
- **Dos condiciones para promover piden tocar servicios reales:** probar qué hace Resend con una clave de idempotencia que recibió un error (DT-182) y confirmar su cupo diario (DT-125).

## Deuda que queda

Todo hallazgo del ledger terminó en uno de los cuatro estados de ADR-109. La clasificación final leyó cada fila que seguía abierta contra el código de ese día, con un segundo lector para lo que no quedó diferido, lo de riesgo alto y lo marcado como arreglo rápido; los arreglos rápidos se corrigieron en el remate en vez de diferirse.

| Prioridad | Resueltos | Diferidos | Aceptados | No eran deuda |
| --- | --- | --- | --- | --- |
| Corrección | 45 | 62 | 1 | 0 |
| Seguridad | 27 | 24 | 3 | 0 |
| Privacidad | 5 | 0 | 0 | 0 |
| Integridad | 8 | 24 | 2 | 2 |
| Simplicidad | 1 | 12 | 0 | 0 |
| Mantenibilidad | 10 | 28 | 2 | 0 |
| Testabilidad | 10 | 8 | 0 | 0 |
| Observabilidad | 4 | 7 | 0 | 0 |
| Rendimiento | 0 | 7 | 0 | 0 |
| Sin prioridad | 0 | 0 | 0 | 3 |
| **Total** | **110** | **172** | **8** | **5** |

Lo diferido, por lo que lo destraba:

- **93 esperan una decisión de dominio.** Están en [decisiones-abiertas.md](decisiones-abiertas.md), cada una con sus opciones, una recomendación y su ticket. Las que más filas destraban: la 18 (4), la 38 (4), la 42 (4), la 8 (3), la 14 (3), la 15 (3).
- **35 piden mirar staging o producción** antes de poder cerrarse: un conteo de solo lectura, una medición o una prueba contra un proveedor real. Varias caben en una sola sesión del túnel de solo lectura.
- **La estructura que el plan cierra sin hacer**, cada pieza con su fila y pendiente de su spec: la interfaz pública de los módulos, que exporta mucho más de lo que se usa (DT-012); las piezas base de interfaz y las páginas largas, que van juntas (DT-015, DT-047 y DT-027); la biblioteca de juegos, después de las decisiones 49 y 50 (DT-032); las etiquetas por valor en vez de por posición (DT-011); el cargo principal derivado (DT-039); la siembra de pruebas por comandos (DT-013, DT-030 y DT-188); y el poller en serie (DT-016).
- **Rendimiento**, siete filas. Ninguna está medida como problema a la escala de hoy, unas 470 personas; comparten un requisito, un ayudante que cuente consultas para poder fijar el arreglo con una prueba.
- **Dependencias:** tres saltos mayores pendientes, TypeScript, Vitest y los tipos de Node (DT-237). Se suben después de mezclar, uno por vez.
- **El resto son tickets chicos**: cada fila dice cuál en su nota de cierre.

Por riesgo, de las 121 filas diferidas que la clasificación leyó una por una: 3 de riesgo alto, 38 de riesgo medio y 80 de riesgo bajo. Las demás esperan una decisión ya numerada y no se volvieron a leer. Las de riesgo alto son DT-053 y DT-128, que se cierran mezclando el #116 y el #192, y DT-100, la del dato sensible que sobrevive a la anonimización.

## Cómo seguir

El orden para mezclar, cada paso con la frase explícita de Mateo:

1. **#116**, las dependencias. Es independiente y urgente.
2. **#192**, la guarda de migraciones. Antes, comparar las marcas de las migraciones aplicadas en staging y en producción con el diario.
3. **La pila, de abajo hacia arriba:** #133, #142, #154, #173, #215, #222, #226 y #237. Cada eslabón pide «Update branch» y su CI después de mezclar el anterior; no usar `--delete-branch`, que cierra el PR que depende de esa rama.

Antes de promover, por ciclo:

| Ciclo | Qué comprobar |
| --- | --- |
| 2 | Contar en producción los hosts de las suscripciones de push (DT-090) y medir en staging la memoria del decodificador (DT-089) |
| 3 | Después de promover, comprobar que el relleno de la variante completa de los medios avanzó |
| 4 | Confirmar con Resend el cupo diario real y su ventana (DT-125); contar si hay tareas repetidas antes del índice único (DT-123) |
| 5 | Probar en staging la clave de idempotencia contra Resend (DT-182); contar las fotos de personas ya anonimizadas, que la primera depuración diaria borra |
| 6 | Mirar las fechas de los términos de producción (DT-263); repetir la comprobación de DT-128 para las migraciones 0047 a 0050 |
| 7 | Nada antes. Después: mirar en el registro si aparece la línea de una conexión cerrada por la base (DT-238) y comprobar una imagen alta y angosta en un medio real |
| Remate | Avisarle a la junta que un enlace de activación emitido antes de conceder un permiso deja de servir y hay que emitir otro |

Las decisiones abiertas están en [decisiones-abiertas.md](decisiones-abiertas.md), cada una con su ticket bajo el mapa [#117](https://github.com/Mateoloperaortiz/LaOE/issues/117). Cerrar una decisión destraba sus filas del ledger, que dicen cuál esperan.
