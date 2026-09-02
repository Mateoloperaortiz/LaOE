# Marca: línea gráfica OE en la web

Fuente: *Línea Gráfica OE.pdf* (versión Canva del manual) y su adaptación en GHPOINTS (`docs/manual-de-marca-oe.md`). Aquí se fijan los tokens y las reglas que la interfaz debe respetar.

## Identidad

- Historia desde **1987**; el grupo estudiantil más grande de EAFIT.
- Personalidad: **serviciales, fraternales, versátiles**. Voz cercana y parchada, con voseo ("Entrá a Mi OE", "lo hacemos por vos").
- Expresión de marca: **¡OE OE OE!** (cierres, estados vacíos, confirmaciones).

## Color

| Token | HEX | Uso |
| --- | --- | --- |
| `--oe-navy` | `#001F3E` | Fondos oscuros, texto sobre claros, logo en variante navy |
| `--oe-blue` | `#94B6F0` | Acento principal, superficies de cartel |
| `--oe-sky` | `#D4DFF0` | Fondos suaves, tarjetas |
| `--oe-blue-soft` | `#B2C6E8` | Bordes, estados hover |
| `--oe-yellow` | `#FFD84B` | Acento cálido, carteles, insignias |
| `--oe-yellow-soft` | `#FFE279` | Fondos de aviso |
| `--oe-orange` | `#FF881B` | Llamados a la acción, energía |
| `--oe-orange-soft` | `#EBA15E` | Hover de naranja, fondos cálidos |
| `--oe-paper` | `#F6F6F6` | Fondo base claro |
| `--oe-cream` | `#F6F8ED` | Fondo alterno claro |
| `--oe-ink` | `#212121` | Texto |

Reglas:

- **Nunca texto blanco sobre amarillo ni amarillo sobre blanco.** Sobre amarillo y naranja va tinta o navy.
- Contraste mínimo AA en todo texto; los acentos suaves no llevan texto pequeño.
- Modo oscuro: fondo navy con textura, texto `--oe-paper`, acentos amarillo y azul; el naranja se reserva para llamados a la acción.
- Los carteles rotan **azul, amarillo, naranja y navy** en el orden del feed, como propone el manual.

## Tipografía

| Rol | Manual | Sustituto web si no hay licencia |
| --- | --- | --- |
| Títulos | **TT Bluescreens** (Black, Extrabold, Bold, Demibold) | Barlow Condensed (700 y 800) |
| Cuerpo | **NouvelR** (Bold, Semibold, Regular, Book, Light) | Manrope (400 a 700) |

Ambas se sirven desde el mismo origen (`next/font` con archivos locales); nunca desde un CDN de terceros. La decisión de licencia está en [decisiones-abiertas.md](decisiones-abiertas.md). Títulos grandes, condensados y en mayúsculas cuando son de una o dos palabras; cuerpo con interlineado amplio.

## Texturas y elementos gráficos

- **Sin fondos planos**: toda superficie grande lleva textura de papel o granito. En la web se implementa con un ruido SVG liviano (`feTurbulence`) mezclado por `mix-blend-mode`, sin imágenes pesadas.
- Elementos de apoyo: estrellas, destellos, figuras radiales, franjas, patrones de bloques y trazos curvos, siempre en colores de la paleta y nunca sobre el logo.
- Fotografías: recortes en blanco y negro con contorno de color cuando haya fotos aprobadas; nunca fotos de integrantes sin consentimiento.

## Logo

- `public/logos/oe.svg` y los 27 logos de comités en `public/logos/committees/*.svg` (un comité sin logo no inventa uno: usa el cartel).
- Margen limpio alrededor del isotipo; variantes blanco y navy; sin texturas ni colores fuera de gama encima.

## Componentes de marca

| Componente | Qué hace |
| --- | --- |
| `Cartel` | Portada tipográfica para contenido sin foto: color rotativo, textura, título en TT Bluescreens o sustituto, opcional subtítulo y logo de comité |
| `Textura` | Capa de ruido reutilizable con intensidad por tema |
| `Sello OE` | Cierre "¡OE OE OE!" para estados vacíos y confirmaciones |
| `Insignia` | Etiqueta pequeña (etapa, comité, estado) con fondo de la paleta y tinta legible |

## Accesibilidad y movimiento

- Revisar cada fase en 360, 768 y 1280 px, claro y oscuro, navegación por teclado y lector de pantalla básico.
- `prefers-reduced-motion` desactiva animaciones de carteles y confeti de puntos.
- Iconos con texto alternativo; el color nunca es el único portador de significado.
