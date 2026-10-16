---
version: 1
slug: "src-app-app-gh-points-committeepodium-tsx"
primary_target: "src/app/app/gh-points/CommitteePodium.tsx"
related_targets: ["src/app/app/gh-points/committee-podium.module.css","src/app/app/gh-points/page.tsx"]
---

# CommitteePodium · dirección de la extensión

## THESIS
Modo Operate. Reconocer qué comité lidera el semestre y entender por qué: el resultado principal combina por mitades el promedio de GH Points por integrante activo y la participación ajustada, con dimensiones normalizadas respecto al mejor comité.

## OWN-WORLD
Se conserva la identidad vigente y la composición aprobada de CommitteePodium: escenario navy, primer puesto amarillo al centro, segundo azul y tercero naranja, tipografía y tokens OE. El screenshot del usuario del 16 de octubre es la autoridad visual. Extensión local; sin nueva identidad, comp, raster, librería ni seed de diseño. PRODUCT existente y ausencia previa de DESIGN no se reparan.

## STORY
Elegir semestre y pestaña Comités → reconocer líderes y puntaje combinado → abrir el detalle del comité → consultar insumos reales y aportes 50/50 → cerrar y recuperar el foco. Los empates y rangos provienen del servidor. Los cierres ATTENDANCE mantienen su porcentaje y explicación histórica, sin GH inventados.

## FIRST VIEWPORT
Título existente y podio original preceden al desglose. En era COMBINED, el indicador dice Puntaje combinado · Sobre 100 y la cifra principal carece de signo porcentual. Debajo se reconoce el reparto 50% GH / 50% participación sin desplazar el protagonismo de nombre y puesto. El detalle progresivo revela promedio GH, activos, total GH y participación ajustada real; luego normalizados y aportes. El promedio GH negativo sigue visible.

## FORM
Code-led dentro del componente existente. Se preservan escalones, orden semántico 1–2–3, distribución visual 2–1–3, grupos empatados, lista inferior, foco de apertura/cierre y disclosure nativo. Detalle de dos dimensiones legible a360px y en ambos temas. Cálculos del ranking y normalización pertenecen al backend; el frontend sólo formatea el DTO. Snapshot histórico no anuncia el criterio nuevo.

## FINISH
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Una tanda visual de escritorio/móvil/claro/oscuro y estados representativos, un lote de fixes y una confirmación como máximo. Detector una vez sobre targets web cambiados. Root coordina reviewer y documenter frescos; la extensión conserva archivos del sistema existente, sin crear DESIGN ni assets por deriva.
