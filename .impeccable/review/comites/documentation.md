# Cierre documental: comités de Mi OE

Fecha: 2026-09-15. Resultado: **extensión local compatible con la marca vigente; revisión independiente `ship`**.

## Alcance y autoridad

Se documentaron `src/app/app/comites/page.tsx`, `CommitteeDirectory.tsx` y `committees.module.css` mediante lectura de código y contraste con [07-marca](../../../docs/07-marca.md), [ADR-044](../../../docs/adr/ADR-044-experiencia-del-portal-y-mi-oe.md) y [ADR-069](../../../docs/adr/ADR-069-directorio-de-comites-de-mi-oe.md). Se aplicó el enfoque de extracción de `impeccable/reference/document.md` al cierre de esta superficie.

La decisión confirmada es «Más limpio y fácil de explorar»: fichas compactas con logos oficiales, prioridad de los comités propios y búsqueda de los demás. Se conserva el mundo visual de Mi OE. Este registro describe valores locales; no los convierte en tokens ni reglas globales. La ausencia de `DESIGN.md` era preexistente: no se crea un sistema global ni un sidecar como efecto lateral. `PRODUCT.md` permanece intacto.

## Comparación con la marca

| Aspecto | Evidencia de herencia y decisión final |
| --- | --- |
| Paleta y temas | `src/shared/brand/tokens.css` sigue siendo la fuente. Las fichas consumen `--fondo`, `--titulo`, `--tinta`, `--tinta-suave`, `--enlace`, `--borde` y `--fondo-suave`; estos resuelven paper/navy y sus contrastes según el tema. No hay nuevos colores HEX en el CSS local. |
| Acentos | Los paneles de logo usan sky (`#D4DFF0`), yellow-soft (`#FFE279`) y blue-soft (`#B2C6E8`), con tinta navy (`#001F3E`): cuatro colores institucionales existentes. La sigla determina el acento; filtrar no lo cambia. No codifica categoría, cargo ni estado. |
| Tipografía | `globals.css` importa los tokens y el layout carga las fuentes locales. Se heredan Sofia Sans Extra Condensed para el título y Plus Jakarta Sans para contenido, controles y subtítulos, conforme a la enmienda de Mi OE. El título conserva 36 px y baja a 32 px hasta 639 px. |
| Textura y densidad | El fondo de página conserva `background-image: var(--grano)` del `body`. Las fichas de consulta usan superficies lisas acotadas, como los componentes funcionales existentes de Mi OE. Esto no extiende la excepción administrativa a los fondos grandes, al portal ni a los carteles. |
| Identidad | `LogoComite` reutiliza las máscaras SVG de `/logos/committees/`; no se redibuja ni genera un logo. Sin `logoKey`, se muestra la sigla abreviada como texto. El logotipo de OE y la navegación siguen en `MemberShell`. |
| Accesibilidad | Se conserva el foco de Mi OE: contorno de 2 px en `--titulo`, separado 3 px. Los estados añaden borde, subrayado y texto, además del color. El buscador tiene etiqueta; el recuento anuncia cambios; limpiar devuelve el foco al campo. |

**Resultado del contraste:** no se encontraron divergencias materiales respecto de la paleta, las fuentes, los recursos de identidad ni la adaptación de Mi OE. Los antiguos carteles se reemplazan solo en este directorio; no se redefine el componente global `Cartel` ni su rotación editorial de colores.

## Componentes y valores observados

| Pieza | Valores y comportamiento final |
| --- | --- |
| Composición | Contenedor heredado de Mi OE: máximo 1152 px. Separación local entre bloques: 2.5 rem; dentro de sección: 1.125 rem; entre fichas: 1 rem. Una columna inicial, dos desde 40 rem; los demás comités pasan a tres desde 70 rem. Los propios permanecen en dos columnas como máximo. |
| Ficha de comité | Un enlace completo al detalle, borde de 1 px, radio de 1 rem y relleno de 1.25 rem. Nombre de 1.125 rem con interlineado 1.35, sin recorte; resumen de 0.875 rem con interlineado 1.625, hasta tres líneas. La acción «Ver comité» queda al pie, con separador y flecha. |
| Ficha propia | Mantiene todos los cargos mediante `cargoEnComite`; texto de 0.8125 rem e interlineado 1.6, sin límite de líneas. Fondo local `color-mix(in oklab, var(--fondo) 96%, var(--titulo))`. No participa del filtro. |
| Panel de logo | Caja de 6.5 × 6 rem, radio de 0.625 rem; en fichas propias, 5 × 4.5 rem. El recurso conserva máscara con ajuste `contain`; los nombres y cargos pueden envolver. |
| Buscador | Ancho máximo de 28 rem y altura mínima de 3 rem; borde de 1 px, radio de 0.75 rem, tipografía de contenido. Búsqueda local por nombre o sigla, sin distinguir tildes/mayúsculas; entrada limitada a 120 caracteres. No persiste en la URL. |
| Recuento y limpieza | Cifras tabulares; recuento con `aria-live="polite"`. «Limpiar búsqueda» tiene altura mínima de 44 px y subrayado. La fila permite envolver para pantallas pequeñas y texto ampliado. |
| Estados | Mensajes distintos para ausencia de pertenencias, ausencia de otros comités y búsqueda sin coincidencias. Presentación ausente usa T-310. Texto funcional nuevo registrado como T-2595 a T-2599; las presentaciones provienen de datos editoriales. |
| Profundidad y movimiento | Sin sombras locales. El borde y los tonos separan las fichas. Hover/foco refuerzan borde, superficie y subrayado; estado activo usa `--fondo-suave`. Transiciones de color de 160 ms `ease`, desactivadas con movimiento reducido. Sin animación de entrada. |

## Contrato y evidencia de cierre

El [contrato de superficie](../../surfaces/casa-digital-src-app-app-comites-page-tsx.md) queda cerrado como extensión en modo **Operate**: reconocer el comité, conservar el acceso propio, buscar los demás y abrir su ficha. La autenticación y las lecturas permanecen en servidor, mediante las APIs públicas existentes; el cliente recibe únicamente los campos de las fichas. No hay cambios de permisos, dominio ni dependencias.

- [Revisión independiente](review.md): `ship`, sin hallazgos materiales P0–P2, sobre código, contrato y las seis capturas base (`desktop`, `mobile`, `desktop-dark`, `mobile-dark`, `user-1979`, `preview`), más `long-content-1440` y `long-content-390`.
- Resultados reportados por el constructor y registrados en el [roadmap](../../../docs/09-roadmap.md): lint, typecheck, deps:check, deadcode y build aprobados; E2E focalizadas 5/5, compuestas por dos preparaciones de sesión y tres casos; axe sin violaciones en la matriz y con texto al 200 %. Detector de diseño reportado: `[]`.
- Este pase documental verificó el código y las fuentes indicadas; no volvió a ejecutar las pruebas ni a producir capturas. Los PNG son evidencia de revisión con datos sintéticos, no recursos publicados de la interfaz. No se incorporaron imágenes raster a la superficie.

## Límites

Entrega local, sin publicación. No se ejecutaron `npm run check` completo ni la suite E2E completa en este tramo. Las capturas no acreditan la calidad del contenido real ni pruebas en dispositivos físicos. El portal público, los detalles de comité, la navegación global, `PRODUCT.md` y el sistema de marca quedan fuera de esta extensión. Los valores locales de este registro no autorizan aplicarlos a otras superficies.
