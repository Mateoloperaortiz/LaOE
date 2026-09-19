# ADR-076: Biblioteca de iconos detrás de una fachada propia

- Estado: Aceptada; en producción desde el 2026-09-19 (`ea15713`)
- Fecha: 2026-09-18
- Relacionadas: ADR-043, ADR-044, ADR-069, ADR-075; extiende [07-marca.md](../07-marca.md) §9 y §10 sin cambiar ninguna regla anterior

## Contexto

El 2026-09-18 Mateo pidió cambiar todos los iconos de la app por «una buena biblioteca muy completa de iconos bonitos».

La casa digital nunca tuvo biblioteca. El inventario de ese día encontró dos familias de iconos hechos a mano:

- **Ocho SVG dibujados en el código**, repartidos en cinco archivos: los seis trazados de la barra de Mi OE, que se elegían **por posición** en un arreglo (`<Icon kind={index} />`), así que reordenar las pestañas cambiaba los dibujos sin que nada fallara; la hamburguesa, copiada en el portal y en el admin con grosores distintos (2 y 1,8); la flecha y la lupa del directorio de comités; el sol y la luna del tema.
- **Una veintena de glifos Unicode haciendo de icono**: `↗`, `+`, `−`, `⌄`, `✓`, `×`, `↔` y `↑ ↓ ← →`. Dependen de la fuente de cada dispositivo, no comparten peso ni altura con nada, y un lector de pantalla los anuncia mal o no los anuncia (`×` es «por», el signo de multiplicar). Varios cargaban significado sin ningún texto: la columna «Activa» de las insignias, los requisitos del honorario, la pertenencia que llegó por transferencia y la opción elegida de una trivia, que además usaba el mismo `✓` para «la que marcaste» y «la correcta». Cinco botones, los del editor de retos y el del cargador de evidencias, tenían un `+` o un `×` como único contenido, así que ese glifo era también su nombre accesible, aunque el catálogo ya traía «Agregar pregunta», «Quitar pregunta» y «Agregar opción» en T-2508 sin que nadie los usara.

Lo que no es un icono quedó fuera del inventario a propósito: los logos de la OE y de los comités, el isotipo (favicon, PWA y billeteras), los elementos gráficos de marca (`Elemento`), el arte de las insignias (`BadgeArt`) y los badges oficiales de las billeteras.

Las candidatas se midieron instalándolas ese día, no de memoria:

| Biblioteca | Iconos | Licencia | Última publicación | En un Server Component |
| --- | --- | --- | --- | --- |
| **Tabler Icons** `@tabler/icons-react` 3.46 | **6 185** (5 131 de trazo y 1 054 rellenos) | MIT | 2026-08-25 | Componentes puros: `forwardRef` y `createElement`, sin contexto ni `"use client"` |
| Lucide `lucide-react` 1.47 | 1 849 (más 263 alias) | ISC | 2026-09-17 | `Icon` lleva `"use client"` y lee un contexto: cada icono cruza al bundle del cliente |
| Phosphor `@phosphor-icons/react` 2.1.10 | 1 512 en seis pesos | MIT | 2025-05-22 | Puros solo por la entrada `/ssr`; la principal usa contexto |

Descartadas antes de medir: Heroicons (unos 300, no es «muy completa»), Material Symbols (la app pasaría a verse como un producto de Google), Remix Icon (desde la 4.x usa licencia propia, «Remix Icon License 1.0»), Hugeicons (el paquete libre es el subconjunto gratuito de un catálogo comercial, con una API distinta a las demás) e Iconify (por defecto trae los iconos de una API de terceros en tiempo de ejecución, contra la regla de servir todo desde el mismo origen de 07-marca §4).

Phosphor es la más expresiva, pero tiene la cuarta parte de conceptos y dieciséis meses sin publicar. Lucide es la más activa, pero es tres veces más chica y en su versión 1.x ningún icono se queda en el servidor. Tabler gana en lo que Mateo pidió primero, que sea completa, y además es la que mejor encaja con esta base de código: la app renderiza casi todo en el servidor, y el trazo redondeado de Tabler sobre una retícula de 24 es el mismo lenguaje que ya tenían los dibujos a mano, así que el cambio se lee como un pulido y no como una marca nueva. Su forma geométrica y redonda acompaña a Plus Jakarta Sans.

## Decisión

1. **Biblioteca.** `@tabler/icons-react` (MIT). La familia de trazo es la de todos los días. La familia rellena se usa para una sola cosa: marcar el destino activo de una barra de navegación, como señal adicional al color (ADR-044). Nunca como adorno.
2. **Una sola puerta.** La carpeta `src/shared/ui/icons/` es la única que importa el paquete. Cada icono vive en su archivo, con nombre propio por su forma y no por su uso, en inglés y con sufijo `Icon` (`HomeIcon.tsx`, `ArrowUpRightIcon.tsx`, `HomeFilledIcon.tsx`), y se importa por su ruta: `@/shared/ui/icons/HomeIcon`. `Glyph.tsx` guarda los valores de la casa que todos comparten. **No hay índice, a propósito**: se midió en el build (ver Verificación) que con un solo módulo, o con un índice que reexporta, un componente cliente arrastra al navegador las definiciones de todos los iconos, también las que solo se pintan en el servidor. La regla `noRestrictedImports` de Biome rompe `npm run lint` si otro archivo importa `@tabler/**`, también por una ruta interna del paquete, y avisa en el editor con el mensaje que manda a la fachada. No es una regla de dependency-cruiser porque su configuración excluye `node_modules` del grafo y un import del paquete le resulta invisible: se comprobó en rojo antes de elegir. knip rompe `npm run deadcode` si queda el archivo de un icono que ya nadie usa. Sumar un icono es un archivo de cuatro líneas; cambiar de biblioteca algún día es esa carpeta.
3. **Valores de la casa**, fijados en la fachada para que ninguna pantalla los repita:
   - Lado `1.25em`: el icono escala con el texto que acompaña, igual que los glifos que reemplaza, y respeta el texto ampliado. El tamaño se fija en píxeles solo donde el icono no acompaña a una línea de texto: barras de navegación (22 px) y botones de menú (20 px).
   - Trazo 1,75. Los dibujos anteriores iban de 1,6 a 2; el 2 de fábrica de Tabler pesa de más al lado de Plus Jakarta Sans. Se sube solo en iconos diminutos, donde un trazo fino desaparece (las marcas de 12 px del Wordle).
   - Color `currentColor`: el icono hereda la tinta de su contenedor, así que los temas, los carteles y las insignias siguen mandando sobre el color sin reglas nuevas.
4. **Accesibilidad.** Un icono es decorativo por defecto y sale con `aria-hidden`. Si recibe `label`, pasa a `role="img"` con ese nombre accesible, y el texto del `label` sale del catálogo como cualquier otro. Un icono nunca es el único nombre de un control (07-marca §10): un botón o un enlace conserva su texto visible junto al icono, y si de verdad no cabe —quitar una fila de una lista— lleva `aria-label` y `title` con texto del catálogo y el icono sigue decorativo. Un icono puede ir sin texto visible solo cuando representa un valor dentro de una celda o de una insignia, y entonces el `label` es obligatorio.
5. **Render.** SVG en línea desde el bundle propio: sin CDN, sin fuente de iconos y sin sprite. En un Server Component el SVG sale en el HTML y no agrega JavaScript al cliente. A un shell cliente, el layout de servidor le pasa los iconos de sus destinos ya renderizados como `ReactNode`, igual que ya hace con `theme` y `account`: la correspondencia entre un destino y su icono vive junto al destino y deja de depender de un índice. Un componente cliente sí importa los iconos de su propio armazón (la hamburguesa, la flecha de un enlace), y solo esos viajan en su bundle.
6. **Qué sigue siendo texto.** Una flecha dentro de un rango o de una oración (`apertura → cierre`, `Publicidad → Mercadeo`) es puntuación, no un icono, y se queda como está. `⌘K` es un atajo de teclado y va en `<kbd>`. Los comentarios del código no cuentan.
7. **Qué no toca esta decisión.** Logos, isotipo, `Elemento`, `BadgeArt` y badges de billeteras conservan sus reglas (07-marca §2 y §5, ADR-040, ADR-067). Esta ADR tampoco agrega iconos donde no los había: reemplaza los existentes y deja lista la puerta para sumarlos cuando una pantalla los pida.

## Consecuencias

- Dependencia nueva de producción, la primera de interfaz desde `react-markdown`. Pesa 66 MB en `node_modules` porque trae los 6 185 iconos, pero a la app solo llega cada icono importado, de unos cientos de bytes. Next 16 ya trae `@tabler/icons-react` en su lista de paquetes con importaciones optimizadas y Turbopack lo resuelve sin configuración, así que `next.config.ts` no cambia.
- Sin migraciones, sin cambios de permisos, de dominio ni de rutas.
- Cinco textos nuevos, T-2670 a T-2674, todos nombres accesibles. Para quien usa lector de pantalla esto corrige un defecto: «Sí» y «No» donde antes se oía «marca de verificación» y «por».
- Los botones del editor de retos muestran por fin los textos de T-2508 junto a su icono («Agregar pregunta», «Quitar pregunta», «Agregar opción»), y el del cargador de evidencias dice «Quitar archivo» (T-1489). Quitar una opción es el único botón que queda solo con el icono, con T-2674 como nombre y un área táctil de 44 px (ADR-043). `gamificacion.spec.ts` deja de buscar un botón llamado «+».
- La barra de Mi OE define cada pestaña con su icono en `src/app/app/layout.tsx`. Reordenar o sumar una pestaña ya no puede desalinear los dibujos.
- La trivia resuelta distingue «tu respuesta» de «respuesta correcta» con dos iconos y dos nombres, donde antes había un mismo `✓` a cada lado de la opción.
- Los juegos conservan su regla de accesibilidad: en el Wordle y el 2048 el icono sigue siendo decorativo, porque el estado de cada celda y el nombre de cada dirección ya viajan en texto (`sr-only`).
- Actualizar Tabler puede retocar un dibujo entre versiones menores. El rango `^3.46.0` con `package-lock.json` fija lo que se despliega; subirlo es un cambio revisable como cualquier otro.
- Queda fuera, por decisión: iconos en la navegación lateral del admin, en los botones de acción y en los estados vacíos. Son decisiones de diseño de cada pantalla y se toman cuando se trabaje esa pantalla, ya con la biblioteca a mano.

## Verificación

Unitaria de los iconos (decorativo por defecto, `role="img"` con `label`, valores de la casa, familia rellena). La regla de Biome vista en rojo con un import directo y con uno por ruta interna, y `npm run deadcode` sobre la carpeta. E2E afectados de navegación, directorio de comités, juegos y gamificación, con axe. Revisión visual de las pantallas tocadas en 390 y 1440 px, claro y oscuro. El bundle del cliente se midió después de `next build`, buscando en `.next/static` las definiciones de Tabler. Con la fachada en un solo archivo llegaban las 28 al navegador: Turbopack recorta los exports sin uso, pero conserva las llamadas `createReactComponent(…)` de Tabler porque el paquete no las marca como puras. Con un archivo por icono detrás de un índice seguían llegando las 28, porque el componente cliente referencia el índice entero. Sin índice llegan exactamente las 15 que usa algún componente cliente y ninguna de las 13 que solo se pintan en el servidor (las diez de la barra de Mi OE, la transferencia y las dos de la trivia).
