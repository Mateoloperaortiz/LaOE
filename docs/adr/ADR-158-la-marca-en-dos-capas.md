# ADR-158: La marca en dos capas

- Estado: Aceptada el 2026-11-08; se implementa por olas desde la ola 1 (enmendada por ADR-161)
- Fecha: 2026-11-06
- Enmienda: [07-marca](../07-marca.md) §3, §4 y §9; [ADR-043](ADR-043-experiencia-administrativa.md) regla 2; [ADR-044](ADR-044-experiencia-del-portal-y-mi-oe.md) regla 1
- Relacionadas: ADR-043, ADR-044, ADR-076, ADR-081, ADR-085, ADR-086, ADR-138, ADR-159, ADR-160

## Contexto

La web lleva el manual de marca casi al pie de la letra. `src/shared/brand/tokens.css` pone todos los `h1` y `h2` en Sofia Sans Extra Condensed y en mayúsculas, y los carteles de color y el grano aparecen en muchas superficies. Eso funciona en el portal y en los momentos de celebración. En las pantallas de trabajo, como formularios, listas, tablas y fichas, los títulos condensados en mayúsculas se leen más lento, sobre todo con palabras largas como «PERMANENCIA» o «CONVOCATORIAS».

La paleta tiene once colores, todos de marca. No hay grises propios para bordes, superficies y texto secundario: el texto secundario sale de aplicarle opacidad a la tinta. Tampoco hay colores de estado. No existe un rojo de error ni un verde de éxito, así que cada pantalla resuelve sus avisos con naranja o amarillo; el inicio de Mi OE, por ejemplo, marca en naranja que una permanencia no alcanza.

El 2026-11-06 Mateo pidió que la casa sea una app usable, aunque eso cambie un poco el lenguaje visual actual. Las apps con una marca fuerte, como Strava, Nike Run Club o Spotify, se apoyan en una base neutra y guardan la marca para los momentos. Unas maquetas con datos ficticios del 2026-11-06 probaron la propuesta en Mi OE y en la Operación ([ADR-159](ADR-159-la-operacion-es-de-escritorio.md)).

## Decisión

1. **Dos capas.**
   - **La capa funcional** cubre las pantallas de trabajo: formularios, listas, tablas, fichas, ajustes y toda la Operación.
   - **La capa de marca** cubre los momentos:
     - los numerales (puntos, puestos, rachas y cifras de un panorama);
     - las celebraciones y pantallas de éxito;
     - los carteles de la cartelera y de los eventos sin foto;
     - «Tu semestre en la OE»;
     - las pantallas en vivo o de presentación;
     - el portal y los sitios de macroeventos ([ADR-085](ADR-085-plataforma-oe-digital-un-backend-y-frontends-delgados.md)).
2. **Tipografía.**
   - **En la capa funcional**, todo va en Plus Jakarta Sans y en tipo oración:

     | Uso | Tamaño | Peso |
     | --- | --- | --- |
     | Título de pantalla | 28/34 | 800 |
     | Sección | 20/26 | 800 |
     | Cuerpo | 16/24 | 400 |
     | Secundario | 14/20 | 500 |
     | Etiqueta corta | 12/16 | 700, en mayúsculas espaciadas 0,12 em |

   - **Sofia Sans Extra Condensed** en mayúsculas queda para la capa de marca.
   - **La regla global** que pone `h1` y `h2` en la condensada pasa a una clase o a un componente de marca.
3. **Neutros.**
   - **Nuevos**, derivados del navy:

     | Token | Valor | Contraste |
     | --- | --- | --- |
     | Superficie | `#FFFFFF` | — |
     | Borde | `#E4E8EE` | — |
     | Borde fuerte | `#CDD4DE` | — |
     | Texto secundario | `#5A6473` | 6:1 sobre blanco y 5,6:1 sobre `--oe-paper` |

   - **Del manual, sin cambio:** el fondo (`--oe-paper`), el texto (`--oe-ink`) y los títulos (`--oe-navy`).
4. **Estados.**

   | Estado | Colores | Contraste | Origen |
   | --- | --- | --- | --- |
   | Error | `#B42318` sobre `#FDECEA` | 5,7:1 | Nuevo |
   | Éxito | `#1E6B45` sobre `#E7F4EC` | 5,7:1 | Nuevo |
   | Aviso | Navy sobre `--oe-yellow-soft` | 13:1 | Manual |
   | Información | Navy sobre `--oe-sky` | 12:1 | Manual |

   Un estado nunca se indica solo con color: lleva icono y texto.
5. **Acciones.**

   | Acción | Cómo se ve | Contraste |
   | --- | --- | --- |
   | Principal en Mi OE | Naranja con texto navy | 6,9:1 |
   | Principal en la Operación | Navy con texto `--oe-paper` | 15:1 |
   | Secundaria | Superficie con borde fuerte y texto navy | — |
   | Enlace | Navy subrayado | — |

   Cada pantalla tiene un solo botón principal.
6. **Carteles y grano.**
   - **Carteles:** los de color quedan para el contenido (cartelera, eventos sin foto y logros) y no se usan de fondo en tarjetas de trabajo.
   - **Grano:** va solo en las superficies de marca, nunca detrás de texto de trabajo.
7. **Lo que no cambia:**
   - el logo y sus reglas;
   - los once colores y las dos familias;
   - la voz ([ADR-086](ADR-086-copy-paisa-y-parchado.md), [ADR-138](ADR-138-tu-paisa-sutil-sin-acentuacion-argentina.md));
   - el «¡OE OE OE!», solo en éxitos;
   - la tabla de combinaciones permitidas del manual.
8. **Contraste y tamaño.**
   - **Contraste:** todo texto cumple AA, es decir, 4,5:1, o 3:1 desde 24 px.
   - **Zonas táctiles:** en Mi OE miden 44 px como mínimo.
9. **Dónde vive.**
   - **Tokens:** los nuevos entran en `src/shared/brand/tokens.css`.
   - **Componentes:** los usan desde los componentes base del tramo R6, en `src/shared/ui`, que también serán el paquete de componentes de la plataforma (ADR-085).
   - **Documentación:** la página `/marca` documenta las dos capas.

## Consecuencias

- **Alcance.** Cambia la presentación, no el dominio ni los permisos, y no hay migraciones.
- **Transición.** Las pantallas pasan a la capa funcional a medida que se rediseñan, por olas del roadmap y no de una vez. Mientras tanto conviven las dos tipografías en los títulos. Para que la mezcla no dure, la regla global de `h1` y `h2` cambia en el mismo tramo que entrega los componentes base.
- **Pruebas.** Las visuales se limitan a capturas de los componentes base, para no alargar el CI (ADR-139 a ADR-141). Los contrastes de esta ADR se comprueban con una prueba automatizada.
- **Revisión.** Comunicaciones, que cuida el manual, revisa esta extensión. Mateo la aceptó el 2026-11-08, y la revisión sigue anotada en [11-contenido-pendiente](../11-contenido-pendiente.md).
- **Enmiendas aplicadas el 2026-11-08:**
  - 07-marca suma la sección «Dos capas» con estas reglas.
  - ADR-043 y ADR-044 quedan enmendadas por esta ADR y cierran con su sección «Enmienda».

## Enmienda (2026-11-09, ADR-161)

La regla 2 queda como la escala de Mi OE. La Operación tiene su propia densidad de escritorio, más compacta: título de pantalla 24/30, sección 18/24, cuerpo 14/20, secundario y celdas 13/18 y etiqueta corta 11/16, con botones de 40 y 32 px y esquinas de 10 px ([ADR-161](ADR-161-densidad-de-escritorio-en-la-operacion.md)).
