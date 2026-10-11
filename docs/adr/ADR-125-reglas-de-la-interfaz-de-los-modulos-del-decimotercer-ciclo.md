# ADR-125: Reglas de la interfaz pública de los módulos del decimotercer ciclo del refactor

- Estado: Aceptada
- Fecha: 2026-10-11
- Relacionadas: ADR-001, ADR-080, ADR-109, ADR-110, ADR-124

## Contexto

El decimotercer ciclo del refactor progresivo ([ADR-109](ADR-109-refactor-progresivo-con-ledger-de-deuda.md)) implementa la spec [#238](https://github.com/Mateoloperaortiz/LaOE/issues/238), que quedó escrita al cierre y diferida: el `index.ts` de cada módulo exporta solo lo que se usa afuera (DT-012). Es un ciclo de estructura, una poda sin cambio de conducta: no cambia ninguna ruta, evento de dominio, esquema ni la API v1. Esta ADR reúne las reglas que cambian en el ciclo; cada ticket que cambia una agrega la suya.

**Un `index.ts` exportaba más de lo que se usa afuera y nada lo avisaba (DT-012).** [ADR-080](ADR-080-la-arquitectura-documentada-es-la-del-codigo.md), regla 1, dice que el `index.ts` de un módulo es su «API pública para otros módulos y para `src/app`», y no dice qué entra. knip no lo mide: `knip.ts` toma cada `index.ts` como entrada y no analiza los exports de una entrada, así que el `index.ts` tapa lo que tiene detrás. Medido el 2026-10-11 sobre `refactor/ciclo-13` (`fff4b31`), los catorce exportan 1.550 nombres: 1.501 con nombre y 49 que `competition` trae con `export *`. De esos, 626 no los importa por nombre ningún archivo de producción de fuera del módulo ni un componente propio: 559 no los importa nadie de afuera, 42 de ellos de `competition`, y 67 solo los importan las pruebas. La spec había contado 1.541 el 2026-10-09 sobre `refactor/cierre` y, en estos mismos términos, 575 y 56; desde entonces pasaron cinco ciclos.

**Un `vi.mock` puede quedarse sin efecto al podar.** Hay 70 `vi.mock` de un `index.ts` en 39 archivos de prueba. El que sobrescriba un nombre que el `index.ts` deja de exportar no hace nada, y TypeScript no avisa: la fábrica de un mock devuelve un objeto cualquiera.

## Decisión

1. **Un `index.ts` no gana un export sin consumidor de producción: lo que hoy sobra está en una lista de excepciones, cada nombre con su clase.** `tests/unit/module-public-interface.test.ts` lee el código y, por cada módulo de `src/modules`, compara los nombres que su `index.ts` exporta y nadie usa con la lista. Falla si aparece uno que no está, si una excepción sobra y si una quedó en otra clase. Es la red de la poda ([#307](https://github.com/Mateoloperaortiz/LaOE/issues/307)): los tickets que siguen sacan un nombre del `index.ts` y de la lista en el mismo commit.
   - **Criterio de uso.** Se queda, sin pasar por la lista, lo que importa por nombre un archivo de `src`, `scripts` o `.railway` de fuera del módulo, o un componente del propio módulo, que no puede importar `domain/` (regla `componentes-sin-servidor`). Hoy lo hacen cuatro componentes, y 11 nombres dependen solo de ellos. Los tipos siguen el mismo criterio. Un `export … from` cuenta como import. Lo que importa un archivo de dominio del propio módulo no cuenta, y lo que importa una prueba tampoco: decide la clase.
   - **Las clases.** `nadie`: no lo importa nadie de afuera, ni las pruebas; es lo que poda el ciclo. `solo-pruebas`: lo importa algún archivo de `tests/` y nadie más de afuera; se queda en el `index.ts` hasta la decisión abierta 73. `competition`: es de ese módulo y no lo importa nadie de afuera; el módulo está quieto hasta la decisión abierta 8 (DT-044). La clase no se elige, sale del código: si una prueba empieza a importar un nombre de `nadie`, la prueba pide pasarlo a `solo-pruebas`.
   - **La cuenta.** `moduleInterfaces` (`scripts/lib/module-interface-metrics.ts`) lee texto y la comparten la prueba y `npm run audit:metrics`. Reconoce el `index.ts` por el alias (`@/modules/<m>`), con `/index` y por ruta relativa; sigue un `export *` hasta sus nombres y falla si no encuentra el archivo; y cuenta `import("…").Nombre` y `const { a } = await import(…)`.
   - **Falla cerrado.** Un `import *`, un import por defecto, un `export *`, un `import()` sin desestructurar, un `require` o un `typeof import()` de un `index.ts` usan nombres que la cuenta no ve. La prueba exige que no haya ninguno, en producción ni en pruebas, fuera de la fábrica de un `vi.mock`. Hoy no hay.
   - **Qué no ve.** No dice si un nombre se usa dentro de su módulo: eso lo muestra knip cuando el `index.ts` sale de `entry`. No ve un uso que no sea un import, como un nombre armado en una cadena. Y la prueba lee los `.ts`, `.tsx`, `.mts` y `.mjs`; `npm run audit:metrics`, que solo informa, no lee los `.mjs`.
2. **Un `vi.mock` de un `index.ts` solo sobrescribe nombres que ese `index.ts` exporta.** La misma prueba lee las claves del objeto que devuelve la fábrica de cada mock, también cuando llega por una constante o por `vi.hoisted`, y falla si una no es un export del módulo o si no puede leer la fábrica. Lo que entra con `...` es el módulo de verdad y no cuenta. Así el ticket que pode un nombre con mock lo ve en rojo en vez de quedarse con un mock sin efecto. Hoy los 70 se leen y ninguno sobrescribe un nombre de la lista.

## Consecuencias

- Las cifras del 2026-10-11, por módulo. «Sin consumidor» es la suma de las dos columnas que siguen; la clase de `competition` es `competition`, no `nadie`.

  | Módulo | Exports | Sin consumidor | `nadie` | `solo-pruebas` | Por un componente propio |
  | --- | --- | --- | --- | --- | --- |
  | `comms` | 92 | 57 | 47 | 10 | 0 |
  | `competition` | 178 | 47 | 42 | 5 | 0 |
  | `content` | 78 | 20 | 17 | 3 | 4 |
  | `crm` | 153 | 64 | 59 | 5 | 0 |
  | `events` | 34 | 9 | 9 | 0 | 0 |
  | `finance` | 36 | 8 | 8 | 0 | 0 |
  | `forms` | 63 | 34 | 31 | 3 | 0 |
  | `identity` | 62 | 26 | 17 | 9 | 0 |
  | `participation` | 387 | 207 | 195 | 12 | 0 |
  | `people` | 242 | 70 | 67 | 3 | 1 |
  | `permanence` | 144 | 62 | 50 | 12 | 6 |
  | `system` | 45 | 9 | 5 | 4 | 0 |
  | `terms` | 17 | 2 | 1 | 1 | 0 |
  | `wallet` | 19 | 11 | 11 | 0 | 0 |
  | Total | 1.550 | 626 | 559 | 67 | 11 |

- La poda tiene 517 nombres: los 559 menos los 42 de `competition`. Por ticket de la spec: 29 (`terms`, `wallet`, `finance` y `events`), 117 (`system`, `identity`, `forms`, `content` y `comms`), 50 (`permanence`), 126 (`crm` y `people`) y 195 (`participation`). La spec los había contado en 30, 119, 50, 129 y 205.
- La cuenta coincide nombre por nombre con los comandos de la spec (`ex` e `im`), salvo `updateTeamAs`: llega por el `export *` de `competition`, que esos comandos no siguen, y la spec lo había apartado a mano.
- `npx knip --include-entry-exports`, corrido una vez y sin tocar `knip.ts`, es la medición que pedía DT-012. Marca 558 nombres en los catorce `index.ts` y los 558 están en la lista: los 517 `nadie` y 41 de `competition`. No marca ninguno que la lista no tenga. La lista tiene 68 que knip no marca en un `index.ts`: los 67 `solo-pruebas`, porque knip cuenta las pruebas como consumidor, y `updateTeamAs`, que knip marca en el archivo que lo define. Detrás de los `index.ts` marca 21 nombres en 16 archivos que no se usan ni en el archivo que los define, `updateTeamAs` entre ellos: la spec esperaba «del orden de los 20», y son lo que la poda deja a la vista para borrar en commit aparte, con su rastro. En las demás entradas de `knip.ts` no marca nada.
- `npm run audit:metrics` gana la fila «Exports de los `index.ts` de los módulos: todos · sin consumidor de producción fuera del módulo · de esos, los que importa alguna prueba», hoy 1.550 · 626 · 67. La fila «Exports de `participation` · `people` · `crm`» sale de la misma cuenta y marca lo mismo que antes, 387 · 242 · 153.
- Un export nuevo para que lo use solo una prueba pone la prueba en rojo y entra a la lista como `solo-pruebas`, a la vista de quien revisa. Mientras la decisión abierta 73 no diga otra cosa, eso se permite.
- La prueba lee unos 1.300 archivos y tarda cerca de medio segundo; sembrar un export en un `index.ts` de verdad, en memoria, repite la lectura.
- Quedan abiertas tres decisiones que el ciclo no elige: la 8 (`competition`), la 73 (por dónde entran las pruebas a lo que solo ellas importan) y la 74 (si los comandos para componer tienen su propia entrada). `src` no cambia con estas dos reglas.
