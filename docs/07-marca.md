# Marca: la línea gráfica de la OE en la web

Fuente: **Manual de marca de la Organización Estudiantil, versión Canva** (`Línea Gráfica OE.pdf`, 19 páginas, 10 secciones: nuestra historia, identidad, tono de voz, usos del logotipo, paleta de colores, tipografías, elementos gráficos y texturas, uso de imágenes, inspo y orden del feed). El manual está pensado para redes sociales y piezas impresas; este documento lo traduce a reglas para la interfaz. Donde la web necesita algo que el manual no cubre (botones, formularios, tablas, modo oscuro) se dice que es una **extensión** y se diseña para no contradecirlo.

## 1. Identidad y voz

- Historia desde **1987**; el grupo estudiantil más grande de EAFIT; áreas de mercadeo, gestión humana, finanzas, logística y publicidad; macroeventos **Días EAFIT, Inventiva, EnFemenino y Subsidios-OE**.
- Misión: impulsar el liderazgo y la formación integral de la comunidad estudiantil a través de la organización y ejecución de eventos. Visión: ser el grupo estudiantil más destacado por formar líderes íntegros y transformar la experiencia universitaria.
- **Tono:** "en la OE lo hacemos por vos". Cercano y "parchado", lenguaje cotidiano y relajado. En la interfaz: voseo siempre ("Entrá a Mi OE", "Registrá tu asistencia", "¿Querés unirte?"), frases cortas, cero jerga administrativa en lo que ve un miembro.
- **Personalidad:** serviciales, fraternales, versátiles. El manual las muestra como barras de color escalonadas; en la web ese recurso se usa para listas destacadas.
- **Expresión de marca: ¡OE OE OE!** El manual la escribe en amarillo pálido, gigante, con efecto de volumen. En la web cierra confirmaciones, pantallas de éxito (puntos acreditados, alta completada) y estados vacíos; nunca en mensajes de error.
- Recurso del manual: **palabras clave resaltadas en color** dentro de un párrafo (naranja para fechas y nombres, amarillo para verbos, azul para áreas). Se usa en textos institucionales (La OE, cartelera), no en texto funcional ni en formularios.

## 2. Logotipo

El logotipo es un conjunto fijo: isotipo "OE" dentro de un doble anillo + "Organización Estudiantil" en dos líneas + regla horizontal + "UNIVERSIDAD EAFIT" en versalitas espaciadas. Se usa como unidad; no se recompone.

| Variante del manual | Cuándo | Dónde en la web |
| --- | --- | --- |
| Principal a color, vertical | Piezas donde el logo es protagonista | Pie de página, cabecera de La OE, carnet, PDF de exportes |
| Principal a color, horizontal | "Menos utilizado" según el manual | Barra de navegación en escritorio cuando el fondo es claro y neutro |
| Azul oscuro (vertical y horizontal) | Fondos claros | Navegación y pie en tema claro sobre paper, cream, sky |
| Blanco (vertical y horizontal) | Fondos oscuros | Navegación y pie en tema oscuro; carteles navy, azul y naranja |

Reglas del manual:

- Espacio libre alrededor del logo, a criterio del diseñador. En la web: mínimo la altura del isotipo por cada lado; nada lo toca ni lo cruza.
- No usar colores brillantes fuera de la gama neutra e institucional; no aplicar texturas al logo; no combinar colores dentro del logo. El logo principal a color conserva sus azules propios: no se recolorea con la paleta.
- No recomponer: el manual marca como incorrectos el isotipo con "Organización Estudiantil" sin "Universidad EAFIT", el nombre sin isotipo, el isotipo con solo "Universidad EAFIT" y cualquier apilado distinto.
- **Isotipo solo: uso condicionado.** No representa a la OE en una pieza, pero puede usarse como **elemento decorativo**; el propio manual lo pone gigante y a baja opacidad de fondo en la portada y en "Nuestra historia". En la web: fondos de carteles y cabeceras al 10–15 % de opacidad, tono sobre tono. Favicon e ícono de PWA usan el isotipo: aprobado el 2026-09-02 dentro del uso condicionado que permite el manual.

Archivos disponibles hoy en `LaOE/public/logos` (pasan al repositorio en la fase 0): `oe.svg` es el conjunto vertical completo como máscara monocroma (565 × 770), así que las variantes navy y blanca se obtienen pintándolo con el color del tema; los 27 logos de comités en `committees/` también son SVG monocromos (negro y blanco, sin texto ni imágenes incrustadas, 544 KB en total), listos para tintarse con la paleta. Un comité sin logo no inventa uno: usa el cartel tipográfico. Faltan el logo horizontal y el principal a color en SVG (ver [11-contenido-pendiente.md](11-contenido-pendiente.md)).

## 3. Color

Significado según el manual: **amarillo = diversidad** de voces y perspectivas; **naranja = fraternidad**, energía y vitalidad; **azul = servicio** y colaboración.

Principales:

| Token | HEX | Nombre | Uso en la web |
| --- | --- | --- | --- |
| `--oe-navy` | `#001F3E` | Azul oscuro | Títulos, texto sobre colores cálidos, fondo del tema oscuro, logo navy |
| `--oe-blue` | `#94B6F0` | Azul | Acento principal, barras tras títulos, carteles, enlaces sobre navy |
| `--oe-sky` | `#D4DFF0` | Azul claro | Fondo de tarjetas, barras suaves, filas alternas |
| `--oe-yellow` | `#FFD84B` | Amarillo | Acento cálido, insignias, carteles, resaltados, títulos sobre navy |
| `--oe-orange` | `#FF881B` | Naranja | Llamados a la acción, barras de énfasis, carteles |
| `--oe-paper` | `#F6F6F6` | Blanco suave | Fondo base del tema claro |

Complementarios:

| Token | HEX | Nombre | Uso en la web |
| --- | --- | --- | --- |
| `--oe-yellow-soft` | `#FFE279` | Amarillo suave | Fondos de aviso, barras secundarias, "¡OE OE OE!" |
| `--oe-orange-soft` | `#EBA15E` | Naranja suave | Hover del naranja, franjas, contornos de recortes |
| `--oe-blue-soft` | `#B2C6E8` | Azul suave | Bordes, elementos decorativos, barras |
| `--oe-cream` | `#F6F8ED` | Crema | Fondo alterno de secciones |
| `--oe-ink` | `#212121` | Gris oscuro | Texto de párrafo |

**Tintes.** El manual muestra cada color con dos tintes más claros (y un azul pizarra derivado del navy para barras). En la web los tintes se obtienen con opacidad del token (`70 %` y `40 %`) sobre el fondo, no con HEX nuevos; así la paleta sigue siendo de once colores.

**Combinaciones de texto permitidas** (el manual prohíbe explícitamente blanco sobre amarillo y amarillo sobre blanco por legibilidad):

| Fondo | Texto de párrafo | Texto grande y títulos |
| --- | --- | --- |
| paper, cream, sky | ink, navy | navy, orange, blue |
| yellow, yellow-soft | navy, ink | navy |
| orange | navy | navy; paper solo en display grande, como hace el manual |
| blue | navy | navy; paper y yellow solo en display grande |
| navy | paper | paper, yellow, blue |

Prohibido: paper sobre yellow; yellow sobre paper; texto de párrafo en paper sobre orange o blue (no alcanza contraste AA). Los acentos suaves nunca llevan texto pequeño.

**Tema oscuro (extensión).** Fondo navy con textura, texto paper, títulos paper o yellow, acentos blue y yellow; el naranja se reserva para llamados a la acción. Los carteles no cambian con el tema.

**Rotación de carteles.** Portadas sin foto y tarjetas de la cartelera rotan **azul, amarillo, naranja y navy** siguiendo el orden del feed (sección 8); dos tarjetas vecinas nunca comparten color.

## 4. Tipografía

| Rol | Familia del manual | Pesos del manual | Sustituto libre si no hay licencia |
| --- | --- | --- | --- |
| Títulos | **TT Bluescreens** (condensada, mayúsculas) | Black, Extrabold, Bold, Demibold | **Sofia Sans Extra Condensed** (OFL, variable de 100 a 900): pesos 700, 800 y 900 |
| Contenido | **NouvelR** (geométrica) | Bold, Semibold, Regular, Book, Light | **Plus Jakarta Sans** (OFL, variable de 200 a 800): pesos 400, 500, 600 y 700 |

Cómo las usa el manual y cómo se traslada:

- Títulos siempre en mayúsculas, condensados, muy grandes, a veces partidos en dos líneas con una palabra por línea ("USOS / DEL LOGO"). En la web: `h1` y `h2` en la familia de títulos, mayúsculas, interlineado 0,9 a 1,0; `h3` en adelante en la familia de contenido, semibold.
- Los números de sección ("01", "02") van en un peso ligero y muy grande de la familia de títulos. En la web se reutilizan como numerales de fase, de ranking y de pasos de un formulario.
- Etiquetas pequeñas en mayúsculas con espaciado amplio ("ORGANIZACIÓN ESTUDIANTIL · VERSIÓN CANVA"). En la web: `letter-spacing` de 0,12 em para eyebrows, chips y cabeceras de tabla.
- Cuerpo con interlineado amplio (1,5) y párrafos cortos; el manual no usa cursivas.
- Escala propuesta (extensión): display 64/56/40, títulos 32/24/20, cuerpo 16, notas 14, mínimo 12 solo en tablas.
- La OE no tiene licencia de TT Bluescreens ni de NouvelR (confirmado el 2026-09-02), así que la web usa los sustitutos. Se eligieron comparando ocho candidatas libres por rol contra los especímenes del manual: [fuentes-titulos.png](assets/fuentes-titulos.png) y [fuentes-contenido.png](assets/fuentes-contenido.png). Sofia Sans Extra Condensed es la única tan estrecha como TT Bluescreens que además trae minúsculas y toda la gama de pesos (Antonio se queda corto en peso, Oswald y Barlow son más anchas, Bebas Neue y Anton tienen un solo peso). Plus Jakarta Sans reproduce el ancho generoso y las formas redondas de NouvelR mejor que Manrope, Figtree o Sora.
- Las fuentes se sirven desde el mismo origen (`next/font` con archivos locales), nunca desde un CDN de terceros.
- Las imágenes para compartir (`opengraph-image`, [ADR-033](adr/ADR-033-contenido-y-medios-fase-1.md)) se generan con `next/og`, que solo acepta TTF, OTF o WOFF estáticos y no interpreta ejes variables. Por eso `src/shared/brand/fonts/og/` guarda dos instancias estáticas subseteadas a latín, Sofia Sans Extra Condensed 900 y Plus Jakarta Sans 600 (misma licencia OFL), generadas desde los WOFF2 del repositorio con `uv run --with fonttools --with brotli scripts/og-fonts.py`. Ese cartel replica el `Cartel` de la web con estilos en línea: fondo de la paleta con textura, título condensado en mayúsculas, eyebrow y el isotipo decorativo a baja opacidad.

## 5. Elementos gráficos

Propósito según el manual: **generar impacto y llamar la atención**. Catálogo que muestra el manual (colores siempre de la paleta):

| Elemento | Forma | Uso típico |
| --- | --- | --- |
| Estrella de diez puntas | Ráfaga irregular | Detrás de un recorte fotográfico o de una cifra |
| Destello de cuatro puntas | Estrella fina | Acento junto a un título o una insignia |
| Asterisco de ocho pétalos | Flor sólida en navy | Viñeta grande, separador |
| Barras diagonales | Dos paralelogramos | Énfasis en esquinas de carteles |
| Escalera de cuadros | Bloques ascendentes | Progreso, fondos de sección |
| Bloque de franjas | Rayas horizontales | Textura de acento, separador |
| Bucle simple y bucle doble | Trazo curvo con lazo | Detrás de títulos y fotos (ejemplo "Assessment") |
| Garabato en espiral | Trazo suelto | Portadas de sección |

Reglas: máximo uno o dos elementos por composición; nunca encima del logo ni del texto funcional; siempre en un color de la paleta; en la web se implementan como componentes SVG en línea con relleno por token, no como imágenes. Para el equipo de diseño, el manual da los códigos de búsqueda en Canva: `set:nAE-JpRjyM4`, `set:nAFoCtwGVOs` y el creador `Agensia`. Los elementos se redibujan en el repositorio como componentes SVG (son formas geométricas simples); no dependen de exportar nada desde Canva.

## 6. Texturas

El manual ordena **no usar fondos planos** y muestra dos texturas: **granito** (grano fino uniforme) y **papel** (superficie arrugada), "entre otras".

- Toda superficie grande (hero, carteles, fondos de sección, tema oscuro) lleva textura; los controles pequeños (botones, campos, chips) no.
- Granito en la web: ruido SVG (`feTurbulence`) al 6–10 % de opacidad mezclado con `mix-blend-mode`, sin imágenes pesadas.
- Papel en la web: una imagen de papel arrugado, en escala de grises, de menos de 80 KB, repetida y mezclada con el color del fondo; una sola para todo el sitio.
- La textura no cambia el contraste medido del texto: se valida el contraste sobre el color base.

## 7. Composición e imágenes

Lo que muestran los ejemplos del manual (Tote Bag, Assessment) y su panel de inspiración:

- **La misma pieza en cuatro fondos:** paper, azul, naranja y navy. Los textos cambian de color para mantener legibilidad. En la web, el `Cartel` implementa exactamente esas cuatro variantes.
- **Fotografías recortadas en blanco y negro** con un **contorno de color** (amarillo o naranja) y un elemento (estrella o bucle) detrás. Solo con fotos autorizadas; nunca fotos de miembros sin consentimiento.
- **Título gigante en la familia de títulos**, a veces con letras alternando dos colores de la paleta dentro de la misma palabra ("TO" en un color, "TE" en otro). Es un recurso de cartel, no de interfaz: se permite en portadas y OG images, no en encabezados de página.
- **Frase corta de apoyo** ("¡Aquí te explicamos!") y **logo horizontal pequeño** en una esquina.
- **Barras de color detrás de los títulos** que salen del borde de la página, **numerales de sección** enormes y **diseños partidos** (mitad navy, mitad color).
- Inspiración: carteles editoriales con tipografía condensada protagonista, duotonos azul y amarillo, collage y recortes, texturas de papel y grano.

## 8. Orden del feed

El manual propone cuatro patrones para distribuir los colores entre publicaciones vecinas, pensados para una cuadrícula fija de tres columnas. En la web la cuadrícula cambia de columnas según el ancho (una, dos o tres), así que la cartelera, las tarjetas de eventos y las portadas generadas usan una rotación determinista de cuatro colores por posición (azul, amarillo, naranja, navy; `feedVariant` en `src/shared/brand/feed.ts`): con ella dos tarjetas contiguas nunca repiten color en ninguno de los tres anchos. El patrón 1 queda como referencia para piezas de tres columnas fijas.

```text
Patrón 1          Patrón 2          Patrón 3          Patrón 4
AM  AZ  AM        AZ  AZ  BL        AZ  AO  BL        AM  AO  AM
AZ  AO  AZ        BL  NA  NA        AM  AZ  AO        AO  AM  AO
AM  AZ  AM        AO  AO  AM        NA  AM  AZ        NA  BL  NA
AZ  BL  AZ        AM  AZ  AZ        BL  NA  AM        BL  NA  BL
AM  AZ  AM        NA  NA  BL        AO  BL  NA        AM  AZ  AM
AZ  NA  AZ        BL  AO  AO        AZ  AO  BL        AZ  AM  AZ
AM  AZ  AM        AZ  AZ  AM        AM  AZ  AO        NA  AO  NA
AZ  AO  AZ        AM  AM  NA        NA  AM  AZ        AO  NA  AO
```

AM amarillo `#FFD84B` · AZ azul `#94B6F0` · AO azul oscuro `#001F3E` · NA naranja `#FF881B` · BL blanco suave `#F6F6F6`. El manual aclara que son posibilidades, no estructuras obligatorias.

## 9. Aplicación en la interfaz (extensión)

| Pieza | Regla |
| --- | --- |
| Fondo de página | Tema claro: paper con textura de granito; secciones alternas en cream o sky. Tema oscuro: navy con textura |
| Navegación | Logo horizontal navy sobre paper o blanco sobre navy; enlaces en la familia de contenido, semibold; el activo con barra azul debajo |
| Botón primario | Fondo navy, texto paper; hover con tinte del 85 % |
| Botón de acción cálida | Fondo naranja, texto navy; solo una por pantalla (check-in, dar de alta, publicar) |
| Botón secundario | Borde navy, texto navy, fondo transparente |
| Insignias y chips | Fondo de un color de la paleta con texto navy o paper según la tabla de combinaciones |
| Tarjetas | Fondo paper o sky, borde blue-soft, título en familia de títulos; portada con `Cartel` si no hay imagen |
| Tablas | Cabecera en versalitas espaciadas, filas alternas en sky al 40 % |
| Formularios | Campos con borde blue-soft, foco navy, error en naranja con texto navy; nunca amarillo para error |
| Estados vacíos y éxito | Ilustración con un elemento gráfico y cierre "¡OE OE OE!" |
| Numerales | Fase, puesto en ranking y pasos en el peso ligero de la familia de títulos |

Componentes de marca en `src/shared/brand/`:

| Componente | Qué hace |
| --- | --- |
| `Cartel` | Portada tipográfica en cuatro variantes (paper, azul, naranja, navy) con textura, título en familia de títulos, subtítulo opcional, logo de comité opcional e isotipo decorativo a baja opacidad |
| `Textura` | Capa de granito o papel con intensidad por tema |
| `BarraTitulo` | Barra de color detrás de un título, que sale del borde |
| `Numeral` | Número grande en el peso ligero de títulos |
| `Elemento` | Estrella, destello, asterisco, barras, escalera, franjas, bucle y espiral como SVG con relleno por token |
| `SelloOE` | Cierre "¡OE OE OE!" en amarillo suave con volumen |
| `Insignia` | Etiqueta pequeña con fondo de la paleta y texto legible |
| `Recorte` | Foto en blanco y negro con contorno de color, solo con consentimiento |

## 10. Accesibilidad y movimiento

- Contraste mínimo AA en todo texto; validado sobre el color base, no sobre la textura.
- Revisión de cada fase en 360, 768 y 1280 px, claro y oscuro, navegación por teclado y lector de pantalla básico.
- `prefers-reduced-motion` desactiva animaciones de carteles, confeti de puntos y el volumen animado de "¡OE OE OE!".
- Iconos con texto alternativo; el color nunca es el único portador de significado (una insignia de estado lleva texto).

## 11. Lista de revisión de marca

Antes de dar por lista una pantalla (aplicada el 2026-09-03 a las pantallas públicas de la fase 1: inicio, páginas fijas, cartelera y anuncio, eventos, evento y edición, comités y comité, en 375, 768 y escritorio, claro y oscuro; de ahí salió la regla de `tokens.css` de que lo que va dentro de un `Cartel` usa la tinta del cartel y no la del tema. Aplicada el mismo día a las pantallas de la fase 2 (Mi OE: inicio, directorio, comités y comité, egresados, normativa y documento, carnet, ajustes; admin: Persona 360, importación del roster, documentos) en los mismos anchos y temas; de ahí salieron dos correcciones: la navegación de Mi OE envuelve en 375 para que ninguna pestaña quede fuera de pantalla, y un elemento gráfico nunca va sobre el título de un `Cartel` (el destello de la galería de egresados pisaba la primera letra). Aplicada el 2026-09-04 a las pantallas de la fase 3 (check-in `/a/[publicId]`, GH Points, inicio de Mi OE con saldo y agenda; consola, modo anfitrión, ocasiones, ledger, rankings, asambleas, cierre, vista de líder y alias del admin) en 375, 768 y escritorio, claro y oscuro; tres correcciones: en oscuro el cartel navy se fundía con el fondo y ahora lleva el borde del tema; la navegación del admin en un celular es una sola fila que se desplaza (envolvía en ocho filas y empujaba el modo anfitrión fuera de la primera pantalla); las etiquetas de la ficha del check-in no se parten en 375). Aplicada el 2026-09-05 a las pantallas de la fase 4 (Mi OE: inicio con la barra y los avisos, `/app/permanencia` de un demo en prueba; admin: tablas de permanencia y su editor, grupos y detalle de grupo, bandeja de evaluaciones, cumplimiento, cierre de permanencia, vista de líder y panel de la junta) en los mismos anchos y temas; una corrección: la columna "Comités" del detalle del grupo quedaba vacía y ahora lista los comités de cada persona; las tablas anchas (cumplimiento, junta) se desplazan dentro de su contenedor y las tarjetas de resumen apilan en 375:


- [ ] Ningún fondo grande es plano.
- [ ] Ningún texto paper sobre amarillo ni amarillo sobre paper.
- [ ] El logo es el conjunto completo, en su variante correcta para el fondo, con espacio libre; el isotipo solo aparece decorando.
- [ ] Títulos en la familia de títulos, en mayúsculas; cuerpo en la familia de contenido.
- [ ] Como mucho dos elementos gráficos; ninguno sobre el logo ni sobre texto funcional.
- [ ] Los colores vienen de los once tokens o de sus tintes por opacidad.
- [ ] Voseo y tono cercano en todo texto visible para miembros.
- [ ] Contraste AA y revisión en claro y oscuro.
