# ADR-081: El catálogo de textos no viaja entero al navegador

- Estado: Aceptada
- Fecha: 2026-09-19
- Relacionadas: ADR-076, ADR-079, ADR-080
- Enmienda: ninguna regla previa; fija cómo se consume `docs/14-copy-y-textos.md` desde el código

## Contexto

Todo texto visible sale de [14-copy-y-textos.md](../14-copy-y-textos.md) por su código `T-…`. `npm run copy:sync` lo convierte en `src/shared/copy/textos.generated.ts`, un único objeto `as const` con las 1.985 entradas y, por cada una, el texto y tres metadatos editoriales: dónde aparece, quién es su dueño y su estado. Son 357 KB de fuente.

La [auditoría del 2026-09-19](../auditoria-codigo-2026-09-19.md) encontró que ese objeto llegaba completo al navegador. Bastaba que un archivo del bundle de cliente importara `t` de `@/shared/copy`, y lo hacían 28: los tres shells (`PublicHeader`, `MemberShell`, `AdminShell`), `error.tsx`, los tableros de los juegos, seis piezas del admin kit y tres componentes sin directiva que usan ambos lados (`LogoOE`, `SelloOE`, `AreaSwitch`). La auditoría lo midió en un build del 2026-09-18: un chunk de 286 KB (64 KB con gzip) al que referían 113 de las 114 páginas, el portal público incluido. Un visitante sin sesión descargaba los textos del admin, los de los correos y los metadatos (`owner:"MATEO"` aparecía 1.448 veces). De esas 1.985 entradas el navegador usa 259.

La segunda mitad del hallazgo es de tipos. `tList(code)` parte por «·» un texto que el inventario marca como lista y devolvía `string[]`. Con `noUncheckedIndexedAccess`, cada acceso era `string | undefined`, y el código lo resolvía de dos formas: 382 veces con `[n] ?? ""` y 155 veces con un cast `as [string, string, …]` escrito a mano. Ninguna de las dos protege de nada: si alguien quita un ítem de una lista en `docs/14`, la etiqueta pasa a ser una cadena vacía, sin error de compilación ni prueba que falle.

## Decisión

1. **El catálogo completo es solo de servidor.** `textos.generated.ts` se genera con `import "server-only"`. Si algo del bundle de cliente lo alcanza, `next build` falla y nombra la cadena de imports. Es el mismo mecanismo que ya protege el diccionario del Wordle (`wordle-dictionary.ts`), y es exacto: lo decide el bundler, no una aproximación estática.
2. **Lo que corre en el navegador importa `@/shared/copy/client`.** Misma API (`t`, `tList`) sobre `textos.client.generated.ts`, un mapa código → texto, sin metadatos.
3. **El subconjunto de cliente lo genera `copy:sync`, no se mantiene a mano.** Entra todo `T-…` escrito como literal en un archivo que importa `@/shared/copy/client`. La regla es deliberadamente simple: puede sobrar un código de vez en cuando; no puede faltar ninguno. Un código que el cliente use y que todavía no esté generado **no compila**, porque no es una clave del mapa; el arreglo es correr `copy:sync`.
4. **Una prueba unitaria vigila los dos generados**: compara `docs/14` con el catálogo completo (ADR-079 regla 8) y el escaneo de clientes con el subconjunto. Compara contenido, no formato.
5. **Las dos reglas de formato viven una sola vez**, en `src/shared/copy/format.ts` (`fillCopy`, `splitCopyList`), y las usan los dos módulos. Una prueba recorre los 259 códigos y comprueba que cliente y servidor devuelven lo mismo.
6. **`tList` devuelve una tupla con el largo exacto de la lista**, calculado por el sistema de tipos desde el literal `as const` (`SplitCopyList`). Un índice literal fuera de rango deja de compilar, con o sin `?? ""`. Cuando el código no es un literal, el tipo vuelve a ser `string[]`.
7. **Los casts a mano sobran y se quitan**: los 155 `tList("T-…") as [string, …]`. Tres de ellos afirmaban menos ítems de los que la lista tiene, para quedarse con los primeros; con tuplas eso es una desestructuración normal.
8. **Los scripts que llegan al catálogo corren con `--conditions=react-server`**, como ya hacían `db:seed`, `db:reset`, `ghpoints:import` y `test:e2e`. Se suman `bootstrap:admin`, `bootstrap:access`, `normativa:import` y `push:check`, y sus mensajes de uso pasan a indicar `npm run …`. `db:release`, el pre-deploy de producción, no alcanza el catálogo y no cambia. Vitest ya neutraliza `server-only` (`tests/server-only.ts`).

## Consecuencias

- Medido en el build: ningún chunk de `.next/static` contiene metadatos editoriales ni textos de solo servidor (se probó con el correo de bienvenida T-200). El catálogo que llega al navegador pasa de 286 KB (64 KB gzip) a 29 KB (11,6 KB gzip).
- La barrera se comprobó en rojo: con `PointsNav.tsx` importando `@/shared/copy`, el build termina con error y muestra `PointsNav.tsx → copy/index.ts → textos.generated.ts`.
- Escribir un componente cliente nuevo con textos es: importar de `@/shared/copy/client`, usar los códigos y correr `copy:sync`. Olvidar el último paso es un error de tipos; importar del módulo equivocado es un error de build.
- Un componente sin directiva que se use desde ambos lados (como `LogoOE`) importa del módulo de cliente. Funciona igual en el servidor: es el mismo texto en un mapa más chico.
- Invocar a mano `node --import tsx scripts/bootstrap-admin.ts` falla con el mensaje de `server-only`. Se invoca con `npm run bootstrap:admin --`, o agregando `--conditions=react-server`. El runbook queda anotado. Lo detectó la prueba de integración del importador de normativa, que lanza el CLI como proceso hijo: ahora lo invoca igual que el script de npm.
- `tsc` tarda unos segundos más por el tipo recursivo (6,6 s la pasada completa en esta máquina). No hubo límite de profundidad: la lista más larga (T-563) tiene 17 ítems.
- No cambia ningún texto ni ninguna pantalla.

## Lo que queda fuera

- **Las etiquetas por posición de un enum.** Unos 98 sitios hacen `etiquetas[ENUM.indexOf(valor)] ?? valor`. El índice es un `number`, así que la tupla no protege: si el enum gana un valor y la lista no, se ve el código crudo del enum en la pantalla. Se degrada a la vista en lugar de callar, pero sigue siendo frágil. Pide un helper `tLabels(código, ENUM)` que exija en tipos el mismo largo y devuelva un `Record`, y migrar esos sitios: es el tramo R2-B.
- **Partir el subconjunto por área** (portal, Mi OE, admin). Con 11,6 KB comprimidos y un chunk que se cachea una vez no lo justifica todavía.
- Los 382 `?? ""` sobre índices literales ya no protegen de nada, pero quitarlos es solo limpieza y se hace al tocar cada archivo.
