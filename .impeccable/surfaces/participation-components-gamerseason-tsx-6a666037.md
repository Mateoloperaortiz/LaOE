---
version: 1
slug: "participation-components-gamerseason-tsx-6a666037"
primary_target: "src/modules/participation/components/GamerSeason.tsx"
related_targets: ["src/modules/participation/components/GamerPodium.tsx","src/modules/participation/components/GamerPodium.module.css","src/app/app/juegos/page.tsx"]
---

# Podio de + gamer

Extensión local de Juegos A. Modo Operate: un miembro consulta líderes y su posición, en computador o celular, con temas claro/oscuro. No modifica puntos, privacidad ni criterios históricos.

## Direction contract

THESIS: reconocer los primeros puestos reales de un vistazo, con un podio que complementa la tabla y conserva los empates; evita convertir las primeras tres personas en tres puestos ficticios.

OWN-WORLD: hereda navy/amarillo/azul OE, tipografía existente y radios de 16 px. Medalla numérica geométrica y peldaños de color, sin fotos, nuevos activos o fuentes. El oro reconoce rango, no un premio final confirmado.

STORY: Juegos → + gamer → líderes visibles por puesto → tabla con detalle y puesto propio. La etiqueta nueva se propaga por el catálogo único.

FIRST VIEWPORT: al llegar a la clasificación, título y podio antes de las reglas extensas. Tres rangos distintos: segundo a la izquierda, primero elevado al centro, tercero a la derecha; lectura DOM 1–2–3. Móvil: primero centrado y ancho, demás debajo; empates mantienen a todas las personas del grupo con igual peso y nombres completos.

FORM: extensión code-led de la opción A ya aprobada; seed no aplica. Firma: medalla de puesto compartida por el grupo y elevación de rango, sin escoger un representante. Sin entrada animada ni movimiento decorativo; el desplazamiento/ancla usa las convenciones existentes y respeta reducción de movimiento.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No se reescribe DESIGN.md: es una extensión del sistema vigente. No hay recursos raster nuevos. Cierre exige revisión y documentación frescas coordinadas por root, detector una vez sobre targets cambiados y matriz sintética 1280/360 claro/oscuro.

## Estados y veracidad

- Sólo grupos rank 1–3 presentes en el DTO; no relleno para cero/una/dos personas.
- Igualdad de puesto: todos los recibidos visibles, misma jerarquía. Si el top 10 termina en rank≤3, caption explícita de alcance sin inventar total de empatados.
- POINTS muestra puntos gamer; PARTICIPATIONS usa su métrica congelada y no inventa puntos cero. Null conserva estado no disponible sin podio.
- Fuente de política: `spec.md`; implementación sin acceso a dominio o DB.
