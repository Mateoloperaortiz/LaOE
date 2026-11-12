# ADR-163: Aspecto sobrio de la capa funcional

- Estado: Aceptada el 2026-11-12
- Fecha: 2026-11-12
- Enmienda: [ADR-158](ADR-158-la-marca-en-dos-capas.md) reglas 1, 2, 3 y 5; [ADR-161](ADR-161-densidad-de-escritorio-en-la-operacion.md) reglas 1 y 4
- Relacionadas: ADR-043, ADR-044, ADR-158, ADR-159, ADR-160, ADR-161

## Contexto

El primer tramo de código de la capa funcional (R6-A) siguió ADR-158 y ADR-161 al pie de la letra. El resultado es correcto, pero pesado para una app que se usa todos los días:
- los títulos y los datos van en peso 800;
- las etiquetas van en mayúsculas espaciadas;
- cada control lleva su borde;
- el naranja aparece en botones y contadores.

El 2026-11-12 Mateo trajo una referencia: un panel de gestión con el fondo en un degradado suave, el contenido en una tarjeta blanca, letra liviana y colores apagados. Pidió ese aire para la app: un diseño más sobrio y moderno, con degradados.

Las maquetas se rehicieron con ese aspecto y con datos ficticios. Primero fueron las cuatro pantallas de escritorio de la Operación (la Mesa, Personas, la Persona 360 y el Calendario) y después, el mismo día y a pedido de Mateo, «Hoy» de Mi OE y el modo de campo.

## Decisión

1. **Alcance.** Rige en toda la capa funcional: la Operación de escritorio, Mi OE y el modo de campo. La capa de marca y el portal no cambian.
2. **Fondo.** La pantalla va sobre un degradado suave, del azul claro de la OE al papel, con un cierre crema:
   - **En la Operación:** a 155°, con `#DCE6F4`, `#E9EEF5` al 34 %, `#F4F4F3` al 68 % y `#F5F2EA`.
   - **En Mi OE y el modo de campo:** a 170°, con `#DCE6F4`, `#EDF1F6` al 30 %, `#F6F6F6` al 62 % y `#F5F2EA`.
3. **Tipografía.** Todo sigue en Plus Jakarta Sans y en tipo oración.
   - **Pesos:** el máximo es 600. Los títulos van en 600, con espaciado de −0,01 em en los grandes.
   - **Etiqueta corta:** 12/16 · 500, en tipo oración, sin mayúsculas ni espaciado.
   - **Cifras:** las que van dentro de una pantalla de trabajo usan Plus Jakarta Sans. El numeral condensado queda para los momentos de marca.
   - **Tamaños de Mi OE:** los de ADR-158.
   - **Tamaños de la Operación:**

     | Uso | Tamaño | Peso |
     | --- | --- | --- |
     | Título de pantalla | 26/32 | 600 |
     | Nombre en una ficha | 28/34 | 600 |
     | Sección | 18/24 | 600 |
     | Título de tarjeta | 16/22 | 600 |
     | Cifra de un resumen | 30/36 | 600 |
     | Cuerpo | 14/20 | 400 |
     | Secundario y celdas de tabla | 13/18 | 400, y 500 o 600 en el dato que manda |

4. **Color.** El navy es el único acento fuerte: la acción principal de las dos áreas, lo elegido, el día de hoy y los contadores.
   - **El naranja y el amarillo** no van en los controles. Siguen en los estados, en el contenido y en los momentos de marca.
   - **Una excepción:** el botón central de Asistencia de la barra de Mi OE sigue naranja.
   - **Los estados** de ADR-158 no cambian.
5. **Neutros nuevos:**

   | Token | Valor | Contraste del texto secundario |
   | --- | --- | --- |
   | Relleno de control | `#F2F4F7` | `#5A6473` da 5,4:1 |
   | Línea tenue | `#EEF0F3` | — |
   | Fondo de panel | `#FAFBFC` | `#5A6473` da 5,8:1 |
   | Texto secundario sobre el degradado | `#4F5968` | 5,6:1 sobre `#DCE6F4`, el extremo más oscuro |

6. **Controles.**
   - **Botón secundario:** relleno de control, sin borde y con texto navy.
   - **Pestañas y filtros:** pastillas. La elegida va en navy con texto `--oe-paper`; las demás, con relleno de control.
   - **Campos:** una línea `#E1E5EA` en la Operación; en Mi OE, superficie blanca con sombra suave. Las teclas (`kbd`) no llevan borde.
   - **Esquinas:** en la Operación, 10 px en los controles y 16 px en las tarjetas. En Mi OE, 14 px en los botones, que dejan de ser redondos, y 20 px en las tarjetas.
   - **Medidas:** no cambian. En la Operación, botones y filas de 40 y 32 px; en Mi OE, zonas táctiles de 44 px como mínimo.
7. **Sombras.** Las superficies no llevan borde. La sombra es suave y va en lo que flota sobre el fondo: el marco del contenido y las tarjetas de detalle en la Operación; las tarjetas, los controles sueltos y la barra inferior en Mi OE; y las barras de acción y los avisos en las dos. Las tablas y sus filas no llevan sombra.
8. **Degradados.**
   - **Dónde sí:** el fondo; las superficies navy que flotan, de `#0B3158` a `#001F3E`; y un degradado muy suave en las tarjetas de cifra, en lo elegido de una lista, en los tintes de categoría y en un cartel de su propio color.
   - **Dónde no:** en botones y en texto. Un degradado tampoco es la única señal de un estado.
   - **Contraste:** el texto sobre un degradado cumple AA en sus dos extremos.
9. **El marco de la Operación.**
   - **Barra lateral:** va directo sobre el fondo, sin superficie ni borde. El destino activo es una superficie blanca con sombra suave.
   - **Contenido:** va en una superficie blanca de esquinas de 20 px, separada 12 px del borde de la ventana.
   - **Cabecera de pantalla:** una ruta («Operación › Mesa») con las acciones, y debajo el título grande, que dice lo que se está viendo: el conteo de la Mesa, la vista de Personas, la semana del Calendario o el nombre de la ficha.
10. **Mi OE y el modo de campo.**
    - **Barra inferior:** flota sobre el contenido, con esquinas de 24 px. El destino activo lleva una pastilla azul clara (`#E6EDF8`) y el texto en navy. Los destinos son los de ADR-160.
    - **Modo de campo:** lleva el aspecto de Mi OE, con la acción principal en navy flotando abajo.
11. **Tema oscuro.** Los valores se derivan del navy, como los de ADR-158. En oscuro no hay sombras: una superficie se separa del fondo con la línea `#24456A`.

    | Qué | Claro | Oscuro |
    | --- | --- | --- |
    | Fondo | Degradado de `#DCE6F4` a `#F5F2EA` | Degradado de `#03203E` a `#00152B`, pasando por `#001A35` |
    | Superficie | `#FFFFFF`, con sombra suave si flota | `#0A2A4C`, con la línea `#24456A` |
    | Relleno de control | `#F2F4F7` | `#16365A` |
    | Línea tenue | `#EEF0F3` | `#1A3A5E` |
    | Fondo de panel | `#FAFBFC` | `#07264A` |
    | Texto secundario sobre el degradado | `#4F5968` | `#B4C1D2` |
    | Acción principal y lo elegido | Navy con texto `--oe-paper` | `--oe-blue` con texto navy |
    | Destino activo | Superficie blanca en la Operación; pastilla `#E6EDF8` en Mi OE | Relleno de control con texto `--oe-blue` |
    | Superficies navy que flotan | De `#0B3158` a `#001F3E` | De `#1D4270` a `#16365A`, con la línea fuerte `#3B5E86` |

    Los estados, el botón de Asistencia y los fondos claros de aviso e información siguen como en ADR-158. Todo par de texto y fondo del oscuro cumple AA; el más ajustado es `--oe-blue` sobre el relleno de control, con 6,0:1.

## Consecuencias

- **Alcance.** Solo cambia la presentación. Ninguna pantalla existente cambia: el aspecto entra con cada pantalla que se rediseña, detrás de la bandera por persona.
- **Código.** Un tramo propio lleva esto a `tokens.css` y a los componentes base de R6-A en las dos áreas. El botón principal de Mi OE deja de ser naranja y redondo. La página `/marca` muestra las dos áreas lado a lado.
- **Momentos de marca.** La pantalla de asistencia registrada, «Tu semestre en la OE», los carteles y las pantallas de presentación siguen con la capa de marca de ADR-158: ahí el naranja, el amarillo y la condensada suenan fuerte.
- **Pruebas.** La prueba de contraste suma los pares nuevos de los dos temas cuando entren a `tokens.css`, y la de densidad pasa a comprobar 26/32 en la Operación y 12/16 en la etiqueta.
- **Revisión.** Esta extensión se suma a la que Comunicaciones tiene pendiente de ADR-158 ([11-contenido-pendiente](../11-contenido-pendiente.md)).
- **Enmiendas aplicadas el 2026-11-12:** ADR-158 y ADR-161 cierran con su sección «Enmienda», y 07-marca suma el aspecto sobrio a su sección «Dos capas».
