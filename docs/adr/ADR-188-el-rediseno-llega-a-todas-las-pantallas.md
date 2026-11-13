# ADR-188: El rediseño llega a todas las pantallas

- Estado: Aceptada (2026-11-13); enmendada por ADR-189
- Fecha: 2026-11-13
- Enmienda: [ADR-158](ADR-158-la-marca-en-dos-capas.md) (la transición por pantallas) y [ADR-163](ADR-163-aspecto-sobrio-de-la-capa-funcional.md) regla 1 (el alcance suma las pantallas de acceso)
- Relacionadas: ADR-044, ADR-159, ADR-160, ADR-161, ADR-164, [22-inventario-de-pantallas](../22-inventario-de-pantallas.md)

## Contexto

El 2026-11-13 se midieron en el navegador las 150 rutas de la app contra las reglas de ADR-158 y ADR-163. El marco nuevo estaba en las 126 rutas de la Operación y de Mi OE, pero el contenido no:

- 62 conservaban piezas del diseño anterior: cajas con el borde azul, botones redondos, el botón naranja, cifras en la condensada, grano detrás del texto y títulos con barra de color;
- las 7 pantallas de acceso (ingreso, código, paso de seguridad, activación, autorización, baja y check-in por QR) vivían fuera de los dos marcos y no tenían nada del rediseño;
- el portal seguía igual, que es lo que ADR-158 decide para la capa de marca.

La causa es una sola. ADR-158 dejó la transición «pantalla por pantalla, por olas», y las olas 2 a 5 construyeron lo nuevo sin rehacer el contenido de lo que ya existía. Rehacer 69 pantallas una por una repite el mismo cambio 69 veces.

## Decisión

1. **Los marcos revisten las piezas de siempre.** Dentro del marco de la Operación, del de Mi OE y del de acceso, los tokens del diseño anterior valen lo que vale la capa funcional:

   | Token de antes | Vale |
   | --- | --- |
   | `--borde` | La línea tenue en Mi OE y acceso; la línea neutra en la Operación |
   | `--fondo` | La superficie |
   | `--fondo-suave` | El fondo de panel |
   | `--tinta-suave` | El texto secundario |
   | `--radius-cartel` | Las esquinas de una tarjeta |

   Una pantalla que todavía usa `border-borde`, `bg-fondo` o `text-tinta-suave` se pinta como las nuevas, en cualquiera de sus pestañas y estados, sin tocar su código.
2. **Reglas comunes de la capa funcional.** Valen en los tres marcos:
   - **Botones.** `boton-primario`, `boton-secundario` y `boton-calido` toman el aspecto del botón nuevo: esquinas del control, el principal en navy y el secundario con relleno y sin borde. El naranja queda solo en el botón de Asistencia de la barra.
   - **Cajas.** Una caja con borde que flota sobre el fondo es una superficie: sin borde y con sombra suave. La que va dentro de otra se separa con la línea.
   - **Grano.** No va detrás de texto de trabajo.
   - **Títulos y cifras.** La barra de color y la condensada salen de los títulos de trabajo, y las cifras van en Plus Jakarta Sans.
   - **Peso.** El máximo es 600.
   - **Avisos e insignias.** La insignia de contorno y los avisos usan las líneas neutras. Un aviso de error lleva el estado de error completo de ADR-158 regla 4: su color, sobre su fondo.
   - **Campos.** Superficie blanca con sombra suave en Mi OE y acceso; una línea en la Operación.
   - **Pestañas de área.** Son pastillas, y la elegida va con el color de la acción.
3. **Las pantallas de acceso entran a la capa funcional.** Son formularios, así que les toca por ADR-158 regla 1. Llevan un marco propio (`AccessFrame`) con el aspecto de Mi OE: el fondo con degradado, los títulos en tipo oración, la acción en navy y los campos con sombra suave. El check-in por QR pasa de un cartel navy a una tarjeta de trabajo; su momento de marca sigue siendo el sello del registro. Las pantallas de «no encontrado» y de error general, que también viven fuera de las áreas, llevan el mismo marco.
4. **Cada pantalla dice de qué capa es.** El marco declara `data-capa="funcional"`. Lo que no es capa funcional se declara donde vive:
   - `data-capa="marca"`: el portal entero, las pantallas de presentación, «Tu semestre en la OE» y los momentos de marca dentro de Mi OE (un cartel, el podio, el afiche del juego destacado, la portada de fotos y la vista previa de un correo);
   - `data-capa="juego"`: el tablero de cada juego, que se queda como es, como ya decía el inventario.

   Las reglas del punto 2 no entran a esas zonas.
5. **El portal no cambia.** Es capa de marca (ADR-158 regla 1 y ADR-163 regla 1). Su rediseño propio sigue atado a los temas y bloques de la plataforma (P2 de ADR-085).
6. **Cómo se comprueba.**
   - `tests/unit/route-layers.test.ts` revisa que ninguna ruta quede fuera de un marco que declare su capa. Una carpeta nueva sin marco la pone en rojo.
   - El 2026-11-13 se midieron en el navegador las 150 rutas, en tema claro y en oscuro: 304 medidas por tema. En cada una se leyeron los estilos ya calculados de todo lo que se ve, marco incluido.
     - 176 son la vista de entrada de cada ruta y cada pestaña de la Persona 360, del comité, de The Games y de un macroevento.
     - 85 son estados que la entrada no muestra: el panel de creación de 27 recursos del kit, formularios con error, la paleta ⌘K, el mapa de atajos, los menús, las herramientas de tabla, la barra de lote, cada sección de ajustes, los resultados del check-in, las pantallas de «no encontrado» y las de acceso con error.
     - 43 se hicieron con el motor de Safari, con el tamaño, el toque y el agente de un iPhone.

     El resultado fue cero piezas del diseño anterior dentro de la capa funcional: ni condensada, ni mayúsculas, ni peso sobre 600, ni grano, ni el borde azul, ni botones redondos, ni naranja en controles o bordes.

## Consecuencias

- **Sin migración ni cambios de dominio.** Es CSS, cinco layouts nuevos y atributos.
- **El inventario cambia de sentido.** La columna «Ola» decía cuándo se rehacía el contenido de cada pantalla. Con esta ADR ninguna pantalla espera su ola para verse con el rediseño; rehacer su estructura sigue siendo opcional y se hace cuando la pantalla lo pida.
- **Riesgo.** Una regla común puede vestir mal una pieza rara. Por eso la medición recorre todas las rutas, y la suite E2E completa, con su revisión de accesibilidad, corre antes del commit.
- **Pendiente.** Las piezas base de R6 (`Button`, `Surface`, `Field`) siguen siendo el camino para el código nuevo. Las clases de antes quedan revestidas, no reemplazadas.

## Enmienda (2026-11-13, ADR-189)

Regla 5: «El portal no cambia» deja de valer. El portal cambia de composición, sin salir de la capa de marca: abre cada página con un afiche y la portada elige su titular sola ([ADR-189](ADR-189-el-portal-como-afiche-vivo.md)).
