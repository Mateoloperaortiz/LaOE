# ADR-126: Reglas de las etiquetas por valor del decimocuarto ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-11
- Relacionadas: ADR-081, ADR-086, ADR-109, ADR-110, ADR-125
- Enmienda: ADR-081, «Lo que queda fuera»: las etiquetas por posición de un enum dejan de quedar fuera, porque el helper que pedía ya existe (reglas 3 y 4)

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

## Decisión

1. **Antes de migrar un par, una tabla fija qué posición literal de su lista lee cada valor, y la migración no la cambia.** `tests/unit/enum-label-pairs.test.ts` recorre la tabla de `tests/unit/enum-label-pairs.table.ts`. Un par es una lista del catálogo de textos y el orden de valores con el que el código la lee por posición: un enum, o la tupla que hace sus veces (pestañas, filtros). De cada par uno a uno la prueba comprueba, sin comparar ninguna redacción:

   - que la lista trae una pieza por cada valor y que las posiciones van de 0 al final;
   - que la tupla exportada, donde los sitios comparten una (53 pares), le da a cada valor esa posición;
   - que cada archivo que escribe su propia copia del orden la escribe igual: 78 copias en 39 archivos, leídas del código porque no hay cómo importarlas. Entran los arreglos literales del subíndice y los siete órdenes propios de `crm/jobs.ts`;
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
   | T-597 | 5 | `STATUS_ORDER` | 4 | `src/modules/participation/components/ConsolaEnVivo.tsx` | La copia de la consola no trae `EXCUSED`: una asistencia excusada cae al respaldo y muestra el código (DT-364) |
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

## Consecuencias

- La migración de los tickets [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) a [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) tiene red, con un alcance que conviene decir. Donde hay función que llamar, un sitio que pase a leer otro orden u otra lista, o un `tLabels` que arme mal su `Record`, pone en rojo la fila de su par. Donde no la hay (76 de los 98 pares uno a uno) la tabla fija el par y no el sitio, salvo en los 15 sitios con el orden escrito en el subíndice, donde también fija qué lista lee el archivo con ese orden. En los demás, que una página use el par que le toca lo cuidan el tipo de `tLabels`, las E2E de esa pantalla y la revisión.
- La tabla muerde, medido el 2026-10-11: con `STATES` de `src/modules/permanence/admin.ts` reordenado cae la fila de esa copia (1 de 293); con `CHECK_IN_STATUSES` reordenado caen la tupla y la función de T-597 (2 de 293); y con T-444 sin su última pieza, en memoria, caen el largo y la función (2 de 293). Con las constantes de posiciones y los sitios del subíndice la prueba pasa de 293 a 332 casos, y cada una de estas mutaciones tumba 1 de 332: `TRIVIA` y `EVIDENCE` cruzados en `KIND_INDEX` de `ChallengeCard.tsx`; `PALABRA_A_PALABRA: 9` en `FAMILY_INDEX`; `tList("T-2834")` cambiado por `tList("T-2851")` en `src/app/admin/the-games/[id]/_ui/Play.tsx:49`; una segunda lectura de `STATE_INDEX` en la página de campañas; y una lectura nueva con la forma `lista[X[valor]]` fuera de la tabla. Las tres primeras dejaban la prueba en 293 de 293.
- La tabla no ve que alguien reordene las piezas de una lista en `docs/14-copy-y-textos.md`, porque la prueba y el código leen la misma lista: con T-2229 invertida en memoria ninguna de sus filas cae. Es el límite de comparar posiciones y no redacciones, y la spec lo deja fuera de su alcance. Queda como DT-365.
- Cada ticket de migración saca de `copies` los archivos que dejan de escribir el orden. El ticket 3 reemplaza la lectura del texto de `crm/jobs.ts` por una prueba que pase por `labels()`, y el ticket 6 dice si su regla cuenta los 18 pares que las expresiones no ven o los nombra como ajenos. Dice lo mismo de las diez constantes de posiciones: ningún ticket de [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) a [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) las migra, y sin eso DT-011 cerraría en «0» con once lecturas por posición vivas y sin fila (DT-366).
- Qué ve la persona y qué queda guardado cuando no hay etiqueta para un valor es la decisión abierta 75. Mientras no se decida, cada sitio conserva el respaldo que tiene hoy.
- La tabla son unas 1.300 líneas de datos, en un archivo aparte de las 330 de la prueba.
