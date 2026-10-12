# ADR-126: Reglas de las etiquetas por valor del decimocuarto ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-11
- Relacionadas: ADR-081, ADR-086, ADR-109, ADR-110, ADR-125
- Enmienda: ADR-081, «Lo que queda fuera»: las etiquetas por posición de un enum dejan de quedar fuera, porque el helper que pedía ya existe (reglas 3 a 5)

## Contexto

El decimocuarto ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) implementa la spec [#242](https://github.com/Mateoloperaortiz/LaOE/issues/242), que quedó escrita al cierre y diferida: la etiqueta de un valor de un enum se lee por valor y no por su posición en una lista del catálogo de textos (DT-011). Es un ciclo de estructura, una migración sin cambio de conducta: ningún texto que se ve, que queda guardado o que sale de la casa cambia una letra, y no cambia ninguna ruta, evento de dominio, esquema ni la API v1. Esta ADR reúne las reglas que cambian en el ciclo; cada ticket que cambia una agrega la suya.

**El código empareja un enum con su lista por posición y nada fijaba ese emparejamiento (DT-011).** Una lista de `docs/14-copy-y-textos.md` trae las etiquetas de un enum separadas por « · » y el código las lee con el `indexOf` del valor como subíndice, con un respaldo que casi siempre es el valor crudo. La tupla de `tList` ([ADR-081](ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md), regla 6) solo cuida el índice literal. Si un enum gana un valor y su lista no, o si alguien reordena una de las copias locales del orden, nada falla. Medido el 2026-10-11 sobre `refactor/ciclo-14` (`8fc7c9d`) con los comandos de la spec, al lado de lo que la spec midió el 2026-10-09 sobre `refactor/cierre` (`aceecf2`):

| Medida | Spec | Hoy |
| --- | --- | --- |
| Sitios con el `indexOf` en el subíndice, y archivos | 124 en 68 | 126 en 70 |
| De esos, en `src/modules` y en `src/app` | 56 y 68 | 58 y 68 |
| Con respaldo, a una cadena vacía y sin respaldo | 119, 20 y 5 | 121, 20 y 5 |
| La expresión vieja del ledger (`indexOf … ] ??` en una línea) | 101 | 103 |
| `.indexOf(` en `src`, y archivos | 140 en 76 | 142 en 78 |
| Arreglos literales dentro del subíndice, y sitios con cast | 15 y 15 | 15 y 15 |
| Recorridos por índice de una constante en mayúsculas, y archivos | 30 en 16 | 30 en 16 |
| Los mismos recorridos sin exigir mayúsculas, y archivos | 43 en 27 | 43 en 27 |
| Índice guardado en una constante o función (los que son de etiquetas) | 6 (5) | 6 (5) |
| Constantes que guardan a mano la posición de cada valor (`lista[X_INDEX[valor]]`), sus lecturas y archivos | no la mide | 10, 11 y 6 |
| Pares del `zip` de `crm/jobs.ts` y órdenes propios | 10 y 7 | 10 y 7 |
| Archivos que escriben los seis estados de cumplimiento | 5 | 5 |
| Componentes de cliente con sitios o recorridos | 4 | 4 |
| Sitios por ticket: `participation`, los demás módulos, admin I y el resto de `src/app` | 12, 44, 35 y 33 | 15, 43, 35 y 33 |
| Recorridos por ticket, en el mismo orden | 7, 9, 7 y 7 | 7, 9, 7 y 7 |
| Aserciones de largo y sitios en `tests` | 12 y 5 | 15 y 7 (18 y 7 con la prueba de la regla 1) |
| Filas del inventario con «en el orden del modelo» y `[n] ?? ""` en `src` | 38 y 374 | 40 y 372 |

Dos de los sitios nuevos nacieron con DT-315 (`916d2313`): el nombre del estado de una participación y el de un premio (T-3266 y T-3267). De los 126 sitios de hoy, 100 caen al valor crudo, 20 a una cadena vacía, 1 prueba antes la primera etiqueta de su lista (`src/modules/crm/domain/timeline/participation.ts:89`) y 5 no tienen respaldo.

**Hay una forma que las expresiones de la spec no miden.** Diez constantes guardan, escrita a mano, la posición de cada valor en su lista, y once lecturas en seis archivos las llevan de subíndice (`kinds[KIND_INDEX[card.kind]] ?? card.kind`). No tienen `indexOf`, así que no cuentan entre los 126 sitios ni entre los 6 índices en constante de la spec, que son los que guardan el resultado de un `indexOf`. De las once lecturas, nueve caen al valor crudo y dos no tienen respaldo.

**El helper que ADR-081 dejó pedido no existía, y la spec daba por sentadas tres cosas de él.** El ticket [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) lo trae y las comprobó antes de que los demás tickets dependieran de ellas. Dos son como la spec decía: `copy:sync` recoge el literal `"T-…"` que va de primer argumento de `tLabels` en un archivo de cliente (regla 3), y el tipo que compara los largos no alarga `tsc` de forma que se note (consecuencias). La tercera no: la spec pedía que `ConsolaEnVivo.tsx` recibiera el `Record` por props, y React no deja pasar del servidor al navegador un objeto sin prototipo, que es justo lo que el `Record` tiene que ser para que un valor ajeno caiga al respaldo (regla 5).

**La migración de los demás módulos encontró tres cosas que la spec no traía.** El ticket [#318](https://github.com/Mateoloperaortiz/LaOE/issues/318) migró todo `src/modules` menos `participation`, y el `zip` de `crm/jobs.ts`:

- El `zip` devolvía un objeto literal, que hereda de `Object.prototype`. La spec pedía que un valor ajeno diera «lo mismo que hoy» y daba por hecho que hoy caía al respaldo; en la línea de tiempo no era así para un valor llamado `constructor` o `toString` (regla 6).
- La spec decía que faltaban dos pruebas, la del `zip` leído por `labels()` y la del CSV de presupuestos. Faltaban tres más de textos que quedan guardados o salen de la casa: el título de un Premio OE y las columnas de condición, estado y tipo de los CSV de cumplimiento y de grupos de trabajo. Ninguna prueba los leía.
- Los seis estados de cumplimiento no tenían tupla que importar, como la spec decía (regla 7).

## Decisión

1. **Antes de migrar un par, una tabla fija qué posición literal de su lista lee cada valor, y la migración no la cambia.** `tests/unit/enum-label-pairs.test.ts` recorre la tabla de `tests/unit/enum-label-pairs.table.ts`. Un par es una lista del catálogo de textos y el orden de valores con el que el código la lee por posición: un enum, o la tupla que hace sus veces (pestañas, filtros). De cada par uno a uno la prueba comprueba, sin comparar ninguna redacción:

   - que la lista trae una pieza por cada valor y que las posiciones van de 0 al final;
   - que la tupla exportada, donde los sitios comparten una (53 pares), le da a cada valor esa posición;
   - que cada archivo que escribe su propia copia del orden la escribe igual: 76 copias en 39 archivos (eran 78 antes del ticket [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317)), leídas del código porque no hay cómo importarlas. Entran los arreglos literales del subíndice y los siete órdenes propios de `crm/jobs.ts`;
   - que el archivo que escribe el orden dentro del subíndice (15 sitios) lee con él la lista de su par, sea un `tList` en el sitio o una variable del archivo que sale de uno, y ninguna lista que no sea de un par suyo: ahí la tabla fija también el sitio;
   - que la función de producción que devuelve la etiqueta, donde se puede llamar (22 pares), devuelve la pieza de esa posición;
   - y que esa función devuelve tal cual un valor que el orden no trae, incluidos `constructor`, `toString`, `hasOwnProperty` y `__proto__`. Es el respaldo de hoy, que espera la decisión abierta 75, y es lo que rompería un `Record` que herede de `Object.prototype`.

   La tabla trae los 85 pares que salen de las cuatro expresiones de la spec (el `indexOf` en el subíndice, el recorrido por índice de una constante en mayúsculas, el índice guardado en una constante o función y el `zip`) y 18 que esas expresiones no ven, porque el orden está escrito en el sitio, llega por parámetro o el recorrido no llama `index` a su índice. De los diez pares del `zip` fija además qué orden y qué lista junta cada clave. La migración de un par no toca sus posiciones: lo único que cambia en su fila es que pierde de `copies` el archivo que deja de escribir el orden, y la prueba cae mientras nombre una copia que ya no está.

   La tabla trae aparte (`INDEX_PAIRS`) las diez constantes que guardan a mano la posición de cada valor. De cada una la prueba lee del código el objeto de la constante y lo compara con las posiciones de la tabla; comprueba que la lista trae cada posición, que el archivo la lee donde dice la tabla y en ningún otro sitio y, donde la misma lista tiene un par uno a uno con esos valores (siete de las diez), que la constante le da a cada valor la posición de ese par. Las otras tres no tienen con quién compararse: T-493 y T-3207 no tienen otro par, y los estados de una campaña leen la lista de los estados de un reto (regla 2). La prueba recorre además `src` y cae si aparece una lectura con esa forma que la tabla no trae; la única que no es una etiqueta, `GAME_RUN_COLUMN` de `src/modules/participation/domain/ledger.ts`, elige una columna y está nombrada con su razón.

   | Constante | Lista | Archivo | Tipo del índice |
   | --- | --- | --- | --- |
   | `KIND_INDEX`, `AUDIENCE_INDEX`, `STATE_INDEX`, `STATUS_INDEX` y `BOOSTER_INDEX` | T-2409, T-2411, T-2511, T-2410 y T-2451 | `src/modules/participation/components/ChallengeCard.tsx` | `number` |
   | `FAMILY_INDEX` | T-2473 | `src/app/app/gh-points/coleccion/page.tsx` | `number` |
   | `STATUS_INDEX` | T-493 | `src/app/admin/sistema/importaciones/page.tsx` | `number` |
   | `STATE_INDEX` | T-2511 | `src/app/admin/gamificacion/campanas/page.tsx` | literal |
   | `KIND_INDEX` | T-2409 | `src/app/app/gh-points/retos/[id]/page.tsx` | literal |
   | `MOTIVES` | T-3207 | `src/shared/lib/image-decoder.ts` | literal |

   En las siete que son `Record<…, number>` la tupla de `tList` no cuida el largo y el respaldo muestra el código crudo: es el defecto de DT-011 con otra forma. En las tres `as const` el índice es literal y la tupla sí rechaza una posición que la lista no trae. Ningún ticket de la migración las toca, porque la spec no las cuenta: quedan fijadas y esperan a la regla del ticket 6 (DT-366).

   Lo que no es la etiqueta de un valor queda fuera de la tabla y de la migración: `CONSENT_TEXTS` (`src/app/app/ajustes/page.tsx` y `src/app/admin/personas/[id]/_ui/Tabs.tsx`) es una lista de códigos de texto; T-2534 y T-2836 se recorren con cantidades (`[25, 50, 100]` y `[60, 300, -60]`); y T-2316 se recorre con los requisitos que calcula el dominio, sin un orden escrito en el código.

2. **Un par cuya lista y cuyo orden tienen distinto largo queda fuera de `tLabels`: ni la lista ni el orden se recortan o se alargan para que compile.** Hoy son siete. La prueba fija el largo de cada lista, el orden como está escrito y cómo empieza su lectura en el archivo:

   | Lista | Piezas | Orden | Valores | Archivo | Por qué no es uno a uno |
   | --- | --- | --- | --- | --- | --- |
   | T-801 | 6 | `DECISIONS` | 4 | `src/app/admin/personas/[id]/_ui/TabPermanencia.tsx` | Son los seis motivos automáticos del cierre: tres decisiones leen su posición, `EXIT_OE` lee la 3 o la 4 según la asamblea obligatoria y la 5 solo la da el motivo que calcula el dominio |
   | T-791 | 6 | `FINAL_STATES` | 3 | `src/app/admin/permanencia/cierre/page.tsx` | Los tres estados finales leen las tres últimas piezas con `3 + indexOf`. De los siete, es el único que la migración de la spec deshace: leído por valor con el par de los seis estados da la misma pieza, y la prueba lo comprueba |
   | T-427 | 11 | `FIELD_KEYS` | 8 | `src/modules/crm/jobs.ts` | La lista también da las columnas de Personas; el `zip` usa las ocho primeras piezas |
   | T-597 | 5 | `CONSOLE_STATUSES` | 4 | `src/modules/participation/admin.ts` | La consola en vivo nombra cuatro de los cinco estados: no trae `EXCUSED`, y una asistencia excusada cae al respaldo y muestra el código (DT-364). Hasta el ticket [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) era `STATUS_ORDER`, una copia `string[]` de `ConsolaEnVivo.tsx` que leía la lista por posición; ahora sus cuatro estados leen por valor el `Record` del par uno a uno (regla 5) |
   | T-566 | 8 | `CATEGORIES` | 7 | `src/app/admin/permanencia/_ui/reglas.ts` | El formulario de reglas ofrece las siete categorías que admite `src/modules/permanence/domain/params.ts`; `INDUCTION` no está entre ellas |
   | T-2473 | 5 | `FAMILY_INDEX` | 4 | `src/app/app/gh-points/coleccion/page.tsx` | La constante trae las cuatro familias con niveles; la quinta pieza, las ediciones especiales, la lee `familyNames[4]`. Leída por valor con el par de `BADGE_FAMILIES` daría la misma pieza, y la prueba lo comprueba |
   | T-2511 | 5 | `STATE_INDEX` | 4 | `src/app/admin/gamificacion/campanas/page.tsx` | Los cuatro estados de una campaña (`CampaignAdminState`) leen las piezas 1 a 4 de la lista de los estados de un reto: `ACTIVE` lee la de `OPEN` y `ENDED` la de `CLOSED`. No es el enum de esa lista, así que no hay par con el que leerla por valor |

   La spec nombraba los dos primeros; los otros cinco los encontró la tabla. El de T-566 es de los 18 pares que las expresiones de la spec no ven, y los dos últimos se leen con una constante de posiciones y van en `INDEX_PAIRS`.

3. **La etiqueta de un valor de un enum se lee con `tLabels(código, ENUM)[valor]`, y el par no compila si la lista y el enum no tienen el mismo largo.** `tLabels` vive en las dos entradas del catálogo, `@/shared/copy` y `@/shared/copy/client`, y el emparejamiento en un solo sitio: `pairCopyLabels` de `src/shared/copy/format.ts` ([ADR-081](ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md) regla 5). `tests/unit/copy-labels.test.ts` lo fija:

   - **Tipos.** El segundo parámetro es `Values & PairedWithList<lista, Values>`. Si el enum es una tupla con tantos valores como piezas trae la lista, `PairedWithList` no agrega nada. Si no, es un texto, el argumento no es asignable y el error de `tsc` lo trae: que el código de la lista no es un literal (sin él `tList` devuelve `string[]` y no hay largo que comparar), que el enum no es una tupla (una constante `string[]` o `X[]` no dice cuántos valores trae) o que los largos no coinciden, sea la lista más corta o más larga. Los cuatro casos tienen su `@ts-expect-error` en las dos entradas.
   - **El `Record` no hereda de `Object.prototype`.** Se arma con `Object.create(null)`. Un valor que el enum no trae da `undefined`, también si se llama `constructor`, `toString`, `hasOwnProperty`, `valueOf` o `__proto__`, que en un objeto literal devolverían una función o el prototipo y no dejarían entrar el respaldo. Es lo que hacía `lista[ENUM.indexOf(valor)]` con un `-1`.
   - **El respaldo no se toca.** Cada sitio conserva el que tiene: su `?? valor`, su `?? ""` o ninguno. El tipo ya no lo pide donde el valor es del enum, y se queda igual: quitarlo o unificarlo espera la decisión abierta 75.
   - **Verifica el largo, no el orden.** La pieza de cada valor es la de su posición: reordenar la lista o el enum sigue cambiando etiquetas sin que nada compile distinto. Lo cuidan la tabla de la regla 1 y la nota «en el orden del modelo» del inventario (DT-365).

   `copy:sync` no cambia. Comprobado: su escaneo ([ADR-081](ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md) regla 3) recoge todo literal `"T-…"` de un archivo que importa la entrada de cliente, esté donde esté. `Sudoku.tsx` ya no llama a `tList("T-2681")`, solo a `tLabels("T-2681", SUDOKU_DIFFICULTIES)`, y el código sigue en el subconjunto; si faltara, `tsc` lo rechazaría porque no sería una clave del mapa.

4. **El enum que recibe `tLabels` es una tupla, y la constante de un enum se declara como tal.** Una constante anotada `readonly X[]` pierde su largo en el tipo. Las de `participation` que entran a un `tLabels` pasan a `[…] as const satisfies readonly X[]`: los mismos valores en el mismo orden, con el tipo `X` declarado aparte como estaba, y `satisfies` sigue rechazando un valor que no sea de `X`. Los `enumValues` de un `pgEnum` ya son una tupla. Donde el orden estaba copiado como arreglo literal se importa la tupla canónica si existe y `MODULE_DEPS` lo admite; si no, la copia se declara `as const` en su sitio y la sigue cuidando la tabla de la regla 1.

5. **Un `Record` de `tLabels` no cruza tal cual del servidor al navegador.** React solo serializa objetos llanos en las props de un componente de cliente. Con un objeto sin prototipo lanza al dibujar la página: «Only plain objects, and a few built-ins, can be passed to Client Components from Server Components. Classes or null prototypes are not supported» (leído en el `react-server-dom-turbopack` que trae el Next instalado). La spec no lo contaba, y ni `tsc` ni una prueba unitaria lo ven: el tipo del `Record` es el de un objeto cualquiera. Por eso:

   - Quien pasa etiquetas por props pasa una copia llana (`{ ...etiquetas }` u `Object.fromEntries`), nunca el `Record` de `tLabels`.
   - El componente que las recibe las lee con `labelsFromProps`, de `@/shared/copy/client`, que les vuelve a quitar el prototipo: el objeto que llega al navegador hereda de `Object.prototype`, y sin eso `etiquetas["constructor"]` devolvería una función en vez de dejar entrar el respaldo.
   - Un componente de cliente que conoce su enum no necesita nada de esto: llama a `tLabels` de `@/shared/copy/client`.

   El único componente que recibía listas por props con su propio orden era `ConsolaEnVivo.tsx`. Deja sus dos órdenes `string[]` (`SOURCE_ORDER` y `STATUS_ORDER`) y recibe de `liveConsoleLabels` (`src/modules/participation/admin.ts`) la etiqueta de cada fuente y de cada estado. La consola nombraba cuatro de los cinco estados y lo sigue haciendo: `liveConsoleLabels` no trae `EXCUSED`, así que una asistencia excusada muestra ahí su código, como hasta hoy. Mostrar «Excusado» cambia un texto en pantalla y espera la decisión abierta 75 (DT-364). Lo fija `tests/unit/live-console-labels.test.ts`: cada etiqueta, que los dos objetos son llanos, que `EXCUSED` no está y que un valor ajeno cae al respaldo. Los contadores de la consola (T-585 con `COUNTER_ORDER`) no son la etiqueta de un enum sino un orden de pantalla: son de los 18 pares que las expresiones de la spec no ven, y siguen como estaban. La página `src/app/admin/ocasiones/[id]/page.tsx` cambia solo lo que le pasa a la consola; sus dos sitios propios son del ticket [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320).

6. **Las etiquetas de la línea de tiempo tampoco heredan de `Object.prototype`: un valor que se llama como una de sus propiedades cae al respaldo.** `labels()` de `src/modules/crm/jobs.ts` armaba sus diez pares con un `zip` local que devolvía un objeto literal. Con él, `label(mapa, "constructor")` no caía al respaldo: leía la función `Object`, y el resumen de la interacción guardaba «Permiso function Object() { [native code] } otorgado»; donde la regla pasa la etiqueta a minúsculas (el estado de una solicitud y el de una inscripción a convocatoria) el handler fallaba con `toLowerCase is not a function` y el evento se quedaba reintentando. Los contratos de esos eventos declaran el campo como `z.string()`, así que el payload era válido. Ningún productor de la casa emite un valor así, y por eso no hay fila guardada que corregir. Es la única conducta que cambia en el ciclo, y cambia hacia lo que la regla 3 ya fija para los demás sitios:

   - Nueve pares pasan a `tLabels`, cuyo `Record` no tiene prototipo. El `zip` se queda con un solo par, el de largo distinto (`fields` con T-427, regla 2), y arma el suyo igual, sobre `Object.create(null)`.
   - Un valor sin etiqueta, se llame como se llame, queda en el resumen tal cual: es el respaldo de `label` en `src/modules/crm/domain/timeline/kit.ts`, que no cambia (decisión abierta 75).
   - El nombre de un booster conserva su respaldo propio, que no es el de los demás: un tipo sin nombre lleva el del primer tipo y, solo si la lista no llegó, su código. `TimelineLabels.boosterNames` pasa de la lista al `Record` por valor.
   - De los siete órdenes que el archivo declaraba quedan cinco: el estado de una solicitud y el de una inscripción leen `REQUEST_STATUSES` y `CALL_ENTRY_STATUSES`, que son del propio `crm`. Los otros cinco no tienen tupla que `crm` pueda importar (las decisiones del cierre son de `permanence`, que `MODULE_DEPS` no le admite) y siguen `as const` en su sitio, cuidados por la tabla de la regla 1.

   Lo fija `tests/integration/crm-timeline-labels.test.ts`, que emite cada evento, deja que lo cuente el handler de producción y lee `interaction.summary`: la pieza de cada valor de las once claves, lo que queda con un valor sin etiqueta y lo que queda con `constructor`, `toString`, `hasOwnProperty`, `valueOf` y `__proto__`. Esta última estaba en rojo antes del cambio en diez de las once claves; la de los boosters ya caía bien, porque leía un arreglo.

7. **Los seis estados de cumplimiento tienen una tupla canónica, `COMPLIANCE_STATES`, que exporta `permanence`.** Estaban escritos en cinco archivos y ninguno se podía importar: cuatro copias y un `z.enum` sin exportar en `src/modules/permanence/domain/snapshot-pure.ts`. La tupla nace ahí, con el esquema del snapshot, y la leen los dos archivos del módulo que la copiaban: `src/modules/permanence/admin.ts`, para el exporte de cumplimiento, y `Desglose.tsx`, que la toma del `index.ts` como componente del módulo ([ADR-125](ADR-125-reglas-de-la-interfaz-publica-de-los-modulos-del-decimotercer-ciclo.md)). La fila de T-791 de la tabla gana la tupla y pierde esas dos copias. Quedan dos, las de `src/app/admin/permanencia/cumplimiento/page.tsx` y `src/app/admin/comites/[slug]/permanencia/page.tsx`: son pantallas del ticket [#319](https://github.com/Mateoloperaortiz/LaOE/issues/319), que al migrar sus sitios importa la tupla en vez de escribirla. Por la misma regla 4, `index.ts` gana `APPLIES_TO` y `COMPUTATIONS`, que ya existían en `domain/params.ts`: `TablaReglas.tsx` los lee en vez de escribir los dos órdenes, y sus filas (T-717 y T-718) ganan la tupla. Lo que no cambia: las cuatro decisiones del cierre que copia `crm/jobs.ts` son de `permanence`, que `MODULE_DEPS` no le deja importar a `crm`, así que esa copia se queda (regla 6).

## Consecuencias

- La migración de los tickets [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) a [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) tiene red, con un alcance que conviene decir. Donde hay función que llamar, un sitio que pase a leer otro orden u otra lista, o un `tLabels` que arme mal su `Record`, pone en rojo la fila de su par. Donde no la hay (76 de los 98 pares uno a uno) la tabla fija el par y no el sitio, salvo en los 15 sitios con el orden escrito en el subíndice, donde también fija qué lista lee el archivo con ese orden. En los demás, que una página use el par que le toca lo cuidan el tipo de `tLabels`, las E2E de esa pantalla y la revisión.
- La tabla muerde, medido el 2026-10-11: con `STATES` de `src/modules/permanence/admin.ts` reordenado cae la fila de esa copia (1 de 293); con `CHECK_IN_STATUSES` reordenado caen la tupla y la función de T-597 (2 de 293); y con T-444 sin su última pieza, en memoria, caen el largo y la función (2 de 293). Con las constantes de posiciones y los sitios del subíndice la prueba pasa de 293 a 332 casos, y cada una de estas mutaciones tumba 1 de 332: `TRIVIA` y `EVIDENCE` cruzados en `KIND_INDEX` de `ChallengeCard.tsx`; `PALABRA_A_PALABRA: 9` en `FAMILY_INDEX`; `tList("T-2834")` cambiado por `tList("T-2851")` en `src/app/admin/the-games/[id]/_ui/Play.tsx:49`; una segunda lectura de `STATE_INDEX` en la página de campañas; y una lectura nueva con la forma `lista[X[valor]]` fuera de la tabla. Las tres primeras dejaban la prueba en 293 de 293.
- La tabla no ve que alguien reordene las piezas de una lista en `docs/14-copy-y-textos.md`, porque la prueba y el código leen la misma lista: con T-2229 invertida en memoria ninguna de sus filas cae. Es el límite de comparar posiciones y no redacciones, y la spec lo deja fuera de su alcance. Queda como DT-365.
- Cada ticket de migración saca de `copies` los archivos que dejan de escribir el orden. El ticket 3 reemplaza la lectura del texto de `crm/jobs.ts` por una prueba que pase por `labels()`, y el ticket 6 dice si su regla cuenta los 18 pares que las expresiones no ven o los nombra como ajenos. Dice lo mismo de las diez constantes de posiciones: ningún ticket de [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) a [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) las migra, y sin eso DT-011 cerraría en «0» con once lecturas por posición vivas y sin fila (DT-366).
- Qué ve la persona y qué queda guardado cuando no hay etiqueta para un valor es la decisión abierta 75. Mientras no se decida, cada sitio conserva el respaldo que tiene hoy.
- La tabla son unas 1.300 líneas de datos, en un archivo aparte de las 330 de la prueba.
- **`tsc` no se alarga de forma que se note.** Medido con `npx tsc --noEmit --incremental false`, tres corridas en la misma máquina: 9,03, 8,93 y 8,84 s antes de `tLabels` (2026-10-11) y 9,38, 9,17 y 9,05 s con `tLabels` y sus 21 llamadas en 12 archivos (2026-10-12). La mediana pasa de 8,93 a 9,17 s: un cuarto de segundo, menos del 3 %, del orden de lo que varía una corrida de la siguiente. `npx tsc --noEmit` a secas usa el caché incremental del `tsconfig.json` y sin cambios tarda 1,5 s antes y después, así que no mide nada: por eso la cifra es la de la pasada completa. `SplitCopyList` ya se instanciaba por cada `tList` con literal; `tLabels` solo le suma comparar dos largos.
- **Lo que queda después de `participation`**, medido el 2026-10-12 con los mismos comandos, al lado de lo que había al empezar el ticket [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317):

  | Medida | Antes | Después |
  | --- | --- | --- |
  | Sitios con el `indexOf` en el subíndice, y archivos | 126 en 70 | 111 en 59 |
  | De esos, en `src/modules` y en `src/app` | 58 y 68 | 43 y 68 |
  | Con respaldo, a una cadena vacía y sin respaldo | 121, 20 y 5 | 106, 17 y 5 |
  | La expresión vieja del ledger | 103 | 88 |
  | `.indexOf(` en `src`, y archivos | 142 en 78 | 127 en 68 |
  | Recorridos por índice de una constante en mayúsculas, y archivos | 30 en 16 | 23 en 14 |
  | Los mismos recorridos sin exigir mayúsculas, y archivos | 43 en 27 | 36 en 26 |
  | Componentes de cliente con sitios o recorridos | 4 | 0 |
  | Sitios por ticket: `participation`, los demás módulos, admin I y el resto de `src/app` | 15, 43, 35 y 33 | 0, 43, 35 y 33 |
  | Recorridos por ticket, en el mismo orden | 7, 9, 7 y 7 | 0, 9, 7 y 7 |
  | Llamadas a `tLabels` fuera de `src/shared/copy`, y archivos | 0 | 21 en 12 |
  | Exports de `participation` · `people` · `crm` (`index.ts`, fila de `audit:metrics`) | 192 · 175 · 94 | 192 · 175 · 94 |

  Los arreglos literales dentro del subíndice (15), los sitios con cast (15), los índices guardados en una constante (6), los pares del `zip` (10) y los sitios y las aserciones de largo de `tests` (7 y 18) no cambian: ninguno es de `participation`. Ningún `index.ts` ganó un export: `liveConsoleLabels` entra por `src/modules/participation/admin.ts`, con su llamador en el mismo commit.
- **En `participation` no queda ningún sitio ni recorrido de los que miden las expresiones.** Quedan, fuera de lo que este ticket migra: las cinco constantes de posiciones de `ChallengeCard.tsx` (DT-366); dos pares de los 18 que las expresiones no ven, los contadores de la consola (T-585 con `COUNTER_ORDER`, en `ConsolaEnVivo.tsx`) y los modos de aprobación (T-567 con `["AUTO", "MANUAL"]`, en `admin.ts`), que esperan lo que diga el ticket 6; y los accesos con índice literal, que la tupla de `tList` ya cuida.
- **Cada familia se migró con su prueba nombrada.** El motivo del crédito del Sudoku, el del premio que se libera con una asistencia excusada y los errores de un estado que ya no aplica tenían prueba de integración y pasan sin tocar una aserción. Tres textos no la tenían y se fijaron primero, en verde sobre el código de antes: el tipo de una ocasión y el movimiento del ledger que salen en un CSV (`tests/unit/participation-admin-labels.test.ts`) y el error de revocar un booster (`tests/integration/gamification-boosters.test.ts`). Comprobado con una mutación por familia: la pieza de la posición siguiente en `pairCopyLabels` tumba 5 casos de `copy-labels.test.ts` y 3 de las dos pruebas del Sudoku; un `Record` literal, 3 de `copy-labels.test.ts`; `EXCUSED` agregado a los estados de la consola, 3; el tipo de una actividad leído de la lista larga de categorías, 1; `CONSUMED` y `EXPIRED` cruzados, la prueba del booster; y el estado de un premio leído de la lista de las entregas, 5 de `gamification-not-applicable-status.test.ts`.
- **La red del Sudoku es más floja de lo que parece.** Con la pieza de la posición siguiente, `tests/integration/sudoku.test.ts` solo cae en la dificultad `HARD`, porque compara el motivo con un patrón que admite cualquier dificultad; la etiqueta exacta la fija `game-ledger-credit.test.ts` y solo para `HARD`. Que `EASY` y `MEDIUM` lleven la suya lo cuidan `copy-labels.test.ts` y la fila de T-2681 de la tabla.
- **Nada rechaza al compilar que un `Record` de `tLabels` se pase por props** (regla 5): el tipo no distingue un objeto sin prototipo y React lanza al dibujar la página. Falla a la vista y no en silencio, pero solo lo ve quien abre esa pantalla o corre su E2E. Queda como DT-367.
- **La lista de lo revisado en el exporte de ocasiones pierde `*.indexOf`.** `tests/integration/admin-export-personal-data.test.ts` lleva, ruta por ruta, lo que lee el exporte de cada recurso sin datos personales ([ADR-123](ADR-123-reglas-de-verificacion-y-correccion-del-undecimo-ciclo.md) regla 14), y una ruta revisada que ya no se lee también la pone en rojo. `occasionKindLabel` ya no llama a `indexOf`, así que esa entrada sale de `ocasiones`; el exporte no lee nada nuevo. Es lo único que la migración de `participation` movió fuera de sus propias pruebas, y solo lo mostró la corrida completa de integración: quien migre una función que un exporte llama tiene que correr ese archivo.
- **Lo que queda después de los demás módulos**, medido el 2026-10-12 con los mismos comandos, al lado de lo que había al terminar `participation`:

  | Medida | Antes | Después |
  | --- | --- | --- |
  | Sitios con el `indexOf` en el subíndice, y archivos | 111 en 59 | 68 en 38 |
  | De esos, en `src/modules` y en `src/app` | 43 y 68 | 0 y 68 |
  | Con respaldo, a una cadena vacía y sin respaldo | 106, 17 y 5 | 64, 15 y 4 |
  | La expresión vieja del ledger | 88 | 56 |
  | `.indexOf(` en `src`, y archivos | 127 en 68 | 82 en 48 |
  | Arreglos literales dentro del subíndice, y sitios con cast | 15 y 15 | 10 y 5 |
  | Recorridos por índice de una constante en mayúsculas, y archivos | 23 en 14 | 14 en 11 |
  | Los mismos recorridos sin exigir mayúsculas, y archivos | 36 en 26 | 27 en 23 |
  | Índice guardado en una constante o función | 6 | 4 |
  | Pares del `zip` de `crm/jobs.ts` y órdenes propios | 10 y 7 | 1 y 5 |
  | Archivos que escriben los seis estados de cumplimiento | 5 | 3 |
  | Sitios por ticket: `participation`, los demás módulos, admin I y el resto de `src/app` | 0, 43, 35 y 33 | 0, 0, 35 y 33 |
  | Recorridos por ticket, en el mismo orden | 0, 9, 7 y 7 | 0, 0, 7 y 7 |
  | Llamadas a `tLabels` fuera de `src/shared/copy`, y archivos | 21 en 12 | 78 en 35 |
  | Exports de `participation` · `people` · `crm` (`index.ts`, fila de `audit:metrics`) | 192 · 175 · 94 | 192 · 175 · 94 |
  | `tsc` completo (`--incremental false`), mediana de tres corridas | 9,17 s | 9,10 s |

  Los sitios y las aserciones de largo de `tests` (7 y 18) no cambian. `tsc` midió 9,10, 9,05 y 9,15 s: con 57 llamadas más a `tLabels` no se alarga. El único `index.ts` que gana exports es el de `permanence`, tres (`COMPLIANCE_STATES`, `APPLIES_TO` y `COMPUTATIONS`), cada uno con un componente del módulo que lo lee en el mismo commit; el de `competition` no cambia.
- **En `src/modules` no queda ningún sitio, ningún recorrido de una constante en mayúsculas ni ningún índice guardado en constante, y del `zip` queda un par.** Lo que sigue leyendo una etiqueta por posición ahí, y por qué:
  - `fields: zip(FIELD_KEYS, tList("T-427"))` en `src/modules/crm/jobs.ts`: es de largo distinto y queda fuera de `tLabels` (regla 2). Por eso la medida del `zip` no llega a cero.
  - `src/modules/content/components/DocumentUploader.tsx`: es de cliente y recibe por props los códigos y la lista de T-394, que empareja con `kindCodes.map((code, index) => …)`. Ninguna expresión de la spec lo ve (la constante no va en mayúsculas) y pasarle el `Record` cambia `src/app/admin/documentos/page.tsx`, que es del ticket [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) (regla 5). Queda como DT-368.
  - Lo que ya dejó `participation`: las cinco constantes de posiciones de `ChallengeCard.tsx` (DT-366), los contadores de la consola y los modos de aprobación.
  - Las otras cinco coincidencias de la expresión sin mayúsculas no son etiquetas: emparejan dos arreglos paralelos (`boosters.ts`, `editions.ts`, `powers-reads.ts`), los encabezados de una tabla de un documento (`documents-pure.ts`) y los puntajes de un jurado (`jury-pure.ts`).
- **La tabla de la regla 1 después del ticket [#318](https://github.com/Mateoloperaortiz/LaOE/issues/318):** 67 copias en 37 archivos (eran 76 en 39), 56 pares con tupla exportada (53) y 10 sitios con el orden escrito en el subíndice (15). La prueba pasa de 332 a 319 casos: pierde los de las nueve copias que ya no se escriben y los de los cinco sitios que dejan el subíndice, y gana los de las tres tuplas. Las filas del `zip` dejan de leer el texto de `crm/jobs.ts` par por par: qué etiqueta le toca a cada valor lo fija la prueba de integración de la regla 6, y de la lectura del texto queda que el `zip` arma un solo par y que los cinco órdenes propios siguen escritos como en la tabla.
- **Cada familia se migró con su prueba nombrada, y cinco textos la ganaron antes.** Pasan sin tocar una aserción las redes que la spec nombraba: `competition-powers.test.ts`, `permanence-closing.test.ts`, `calls.test.ts`, `requests.test.ts` y `crm.test.ts`. Se escribieron en verde sobre el código de antes, cada una con una mutación que la tumba: `tests/integration/crm-timeline-labels.test.ts` (dos etapas cruzadas en `STAGE_CODES`), `tests/integration/admin-export-budgets.test.ts` (el estado leído una posición más allá) y `tests/unit/permanence-admin-labels.test.ts` (dos condiciones y dos tipos de grupo cruzados). `tests/integration/crm-recognition-award-title.test.ts` se escribió después de migrar `awardLabel`, cuando se vio que la prueba que el commit de esa familia nombra no lee el título; se comprobó contra el archivo de antes de la migración, en verde, y en rojo con la pieza siguiente. Las dos llamadas de prueba a `inhabilityLabels` cambian lo que le pasan (el `Record` en vez de la lista), no lo que esperan.
- **Tres textos migrados no tienen más red que su fila de la tabla o su pantalla.** El aviso de un cruce del horario importado de The Games (T-2841) lo fija una sola de sus piezas en `tests/integration/competition.test.ts`; el rol de la hoja de staff (T-3155), una E2E; y el estado de una sanción (T-2243), la copia del orden. Ninguno queda guardado ni sale de la casa.
