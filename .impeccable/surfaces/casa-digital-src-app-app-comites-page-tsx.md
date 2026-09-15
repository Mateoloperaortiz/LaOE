---
version: 1
slug: "casa-digital-src-app-app-comites-page-tsx"
primary_target: "casa-digital/src/app/app/comites/page.tsx"
related_targets: ["casa-digital/src/app/app/comites/CommitteeDirectory.tsx","casa-digital/src/app/app/comites/committees.module.css"]
---

# Comités de Mi OE

Modo: Operate. Alcance: directorio interno `/app/comites`, dentro del sistema visual vigente de Mi OE. La captura del usuario muestra tarjetas saturadas con párrafos grandes y alturas desiguales. Se conserva la marca, la navegación, el contenido editorial, las pertenencias y los cargos.

## Direction contract

THESIS: reconocer y abrir un comité rápidamente. Las fichas compactas dan protagonismo a los logos oficiales y mantienen los comités propios primero.

OWN-WORLD: superficies del tema OE; navy #001F3E y paper #F6F6F6 para lectura; sky #D4DFF0, blue-soft #B2C6E8 y yellow-soft #FFE279 acotan los logos. Sofia Sans Extra Condensed en el título, Plus Jakarta Sans en controles y contenido. Se hereda la textura del fondo de Mi OE.

STORY: ver los comités propios y el cargo, buscar por nombre o sigla, abrir la ficha interna. La búsqueda ignora tildes y mayúsculas y ofrece recuperación cuando no hay resultados.

FIRST VIEWPORT: título y descripción breve; acceso directo a los comités propios; buscador y recuento; directorio de tres columnas con logos, nombres, hasta tres líneas de presentación y enlace explícito. En móvil pasa a una columna.

FORM: extensión local del directorio de Mi OE; no se sortea otra identidad. Seed: no aplica a una sección dentro de un sistema establecido. Interacción distintiva: la búsqueda reduce el directorio conservando los accesos a los comités propios. Hover y foco refuerzan la acción de abrir, sin animaciones de entrada.

FINISH: revisión independiente cerrada con veredicto ship, sin hallazgos materiales P0–P2. El cierre de esta extensión local vive en [documentation.md](../review/comites/documentation.md) y [review.md](../review/comites/review.md), con valores observados, herencia y límites. DESIGN.md ausente es estado preexistente: no se crea ni se repara el sistema global como efecto lateral. No se incorporan imágenes raster a la interfaz; las capturas son evidencia local con datos sintéticos.

No se crean imágenes ni se modifica el sistema global. El usuario confirmó la opción «Más limpio y fácil de explorar»: tarjetas claras con acentos institucionales.

## Cierre local — 2026-09-15

Implementación documentada contra 07-marca, ADR-044 y ADR-069. Se verificaron seis capturas base y contenido extenso a 1440/390 px. El constructor reportó lint, typecheck, deps:check, deadcode, build y 5/5 E2E focalizadas aprobados; axe sin violaciones y detector `[]`. No se ejecutaron la suite E2E completa ni `npm run check` completo. Publicación pendiente; el alcance sigue limitado a `/app/comites`.
