# ADR-126: Reglas de las etiquetas por valor del decimocuarto ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-11
- Relacionadas: ADR-081, ADR-086, ADR-109, ADR-110, ADR-125
- Enmienda: ninguna regla previa todavía. La spec pide enmendar ADR-081 en «Lo que queda fuera» cuando entre `tLabels`: esa enmienda la trae el ticket que lo agrega

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
| Pares del `zip` de `crm/jobs.ts` y órdenes propios | 10 y 7 | 10 y 7 |
| Archivos que escriben los seis estados de cumplimiento | 5 | 5 |
| Componentes de cliente con sitios o recorridos | 4 | 4 |
| Sitios por ticket: `participation`, los demás módulos, admin I y el resto de `src/app` | 12, 44, 35 y 33 | 15, 43, 35 y 33 |
| Recorridos por ticket, en el mismo orden | 7, 9, 7 y 7 | 7, 9, 7 y 7 |
| Aserciones de largo y sitios en `tests` | 12 y 5 | 15 y 7 (17 y 7 con la prueba de la regla 1) |
| Filas del inventario con «en el orden del modelo» y `[n] ?? ""` en `src` | 38 y 374 | 40 y 372 |

Dos de los sitios nuevos nacieron con DT-315 (`916d2313`): el nombre del estado de una participación y el de un premio (T-3266 y T-3267). De los 126 sitios de hoy, 100 caen al valor crudo, 20 a una cadena vacía, 1 prueba antes la primera etiqueta de su lista (`src/modules/crm/domain/timeline/participation.ts:89`) y 5 no tienen respaldo.

## Decisión

1. **Antes de migrar un par, una tabla fija qué posición literal de su lista lee cada valor, y la migración no la cambia.** `tests/unit/enum-label-pairs.test.ts` recorre la tabla de `tests/unit/enum-label-pairs.table.ts`. Un par es una lista del catálogo de textos y el orden de valores con el que el código la lee por posición: un enum, o la tupla que hace sus veces (pestañas, filtros). De cada par uno a uno la prueba comprueba, sin comparar ninguna redacción:

   - que la lista trae una pieza por cada valor y que las posiciones van de 0 al final;
   - que la tupla exportada, donde los sitios comparten una (53 pares), le da a cada valor esa posición;
   - que cada archivo que escribe su propia copia del orden la escribe igual: 78 copias en 39 archivos, leídas del código porque no hay cómo importarlas. Entran los arreglos literales del subíndice y los siete órdenes propios de `crm/jobs.ts`;
   - que la función de producción que devuelve la etiqueta, donde se puede llamar (22 pares), devuelve la pieza de esa posición;
   - y que esa función devuelve tal cual un valor que el orden no trae, incluidos `constructor`, `toString`, `hasOwnProperty` y `__proto__`. Es el respaldo de hoy, que espera la decisión abierta 75, y es lo que rompería un `Record` que herede de `Object.prototype`.

   La tabla trae los 85 pares que salen de las cuatro expresiones de la spec (el `indexOf` en el subíndice, el recorrido por índice de una constante en mayúsculas, el índice guardado en una constante o función y el `zip`) y 18 que esas expresiones no ven, porque el orden está escrito en el sitio, llega por parámetro o el recorrido no llama `index` a su índice. De los diez pares del `zip` fija además qué orden y qué lista junta cada clave. La migración de un par no toca sus posiciones: lo único que cambia en su fila es que pierde de `copies` el archivo que deja de escribir el orden, y la prueba cae mientras nombre una copia que ya no está.

   Lo que no es la etiqueta de un valor queda fuera de la tabla y de la migración: `CONSENT_TEXTS` (`src/app/app/ajustes/page.tsx` y `src/app/admin/personas/[id]/_ui/Tabs.tsx`) es una lista de códigos de texto; T-2534 y T-2836 se recorren con cantidades (`[25, 50, 100]` y `[60, 300, -60]`); y T-2316 se recorre con los requisitos que calcula el dominio, sin un orden escrito en el código.

2. **Un par cuya lista y cuyo orden tienen distinto largo queda fuera de `tLabels`: ni la lista ni el orden se recortan o se alargan para que compile.** Hoy son cinco. La prueba fija el largo de cada lista, el orden como está escrito y cómo empieza su lectura en el archivo:

   | Lista | Piezas | Orden | Valores | Archivo | Por qué no es uno a uno |
   | --- | --- | --- | --- | --- | --- |
   | T-801 | 6 | `DECISIONS` | 4 | `src/app/admin/personas/[id]/_ui/TabPermanencia.tsx` | Son los seis motivos automáticos del cierre: tres decisiones leen su posición, `EXIT_OE` lee la 3 o la 4 según la asamblea obligatoria y la 5 solo la da el motivo que calcula el dominio |
   | T-791 | 6 | `FINAL_STATES` | 3 | `src/app/admin/permanencia/cierre/page.tsx` | Los tres estados finales leen las tres últimas piezas con `3 + indexOf`. Es el único de los cinco que la migración deshace: leído por valor con el par de los seis estados da la misma pieza, y la prueba lo comprueba |
   | T-427 | 11 | `FIELD_KEYS` | 8 | `src/modules/crm/jobs.ts` | La lista también da las columnas de Personas; el `zip` usa las ocho primeras piezas |
   | T-597 | 5 | `STATUS_ORDER` | 4 | `src/modules/participation/components/ConsolaEnVivo.tsx` | La copia de la consola no trae `EXCUSED`: una asistencia excusada cae al respaldo y muestra el código (DT-364) |
   | T-566 | 8 | `CATEGORIES` | 7 | `src/app/admin/permanencia/_ui/reglas.ts` | El formulario de reglas ofrece las siete categorías que admite `src/modules/permanence/domain/params.ts`; `INDUCTION` no está entre ellas |

   La spec nombraba los dos primeros; los otros tres los encontró la tabla. El de T-566 es de los 18 pares que las expresiones de la spec no ven.

## Consecuencias

- La migración de los tickets [#317](https://github.com/Mateoloperaortiz/LaOE/issues/317) a [#320](https://github.com/Mateoloperaortiz/LaOE/issues/320) tiene red, con un alcance que conviene decir. Donde hay función que llamar, un sitio que pase a leer otro orden u otra lista, o un `tLabels` que arme mal su `Record`, pone en rojo la fila de su par. Donde no la hay (76 de los 98 pares uno a uno) la tabla fija el par y no el sitio: que una página use el par que le toca lo cuidan el tipo de `tLabels`, las E2E de esa pantalla y la revisión.
- La tabla muerde, medido el 2026-10-11: con `STATES` de `src/modules/permanence/admin.ts` reordenado cae la fila de esa copia (1 de 293); con `CHECK_IN_STATUSES` reordenado caen la tupla y la función de T-597 (2 de 293); y con T-444 sin su última pieza, en memoria, caen el largo y la función (2 de 293).
- La tabla no ve que alguien reordene las piezas de una lista en `docs/14-copy-y-textos.md`, porque la prueba y el código leen la misma lista: con T-2229 invertida en memoria ninguna de sus filas cae. Es el límite de comparar posiciones y no redacciones, y la spec lo deja fuera de su alcance. Queda como DT-365.
- Cada ticket de migración saca de `copies` los archivos que dejan de escribir el orden. El ticket 3 reemplaza la lectura del texto de `crm/jobs.ts` por una prueba que pase por `labels()`, y el ticket 6 dice si su regla cuenta los 18 pares que las expresiones no ven o los nombra como ajenos.
- Qué ve la persona y qué queda guardado cuando no hay etiqueta para un valor es la decisión abierta 75. Mientras no se decida, cada sitio conserva el respaldo que tiene hoy.
- La tabla son unas 1.150 líneas de datos, en un archivo aparte de las 180 de la prueba.
