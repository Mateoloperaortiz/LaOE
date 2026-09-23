# Panal por avances: cierre documental local

Fecha: 23 de septiembre de 2026. Proyecto: `panal-checkpoints`. Extensión Operate de Juegos, con el producto y la identidad existentes como autoridad; no cambia el mundo visual ni requiere seed.

Fuentes contrastadas: `PRODUCT.md`, `.impeccable/surfaces/panal.md`, `src/shared/brand/tokens.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/modules/participation/components/Panal.tsx`, `Panal.module.css` y `src/app/app/juegos/panal/page.tsx`. Se leyeron los cambios de CSS y página y se compararon visualmente las tres capturas de esta carpeta con sus equivalentes de `.impeccable/review/panal/` y el cierre documental anterior.

## Comparación con el sistema incumbente

| Aspecto | Resultado observado |
| --- | --- |
| Paleta y tema | Conserva navy, blue, yellow y paper, con fondo, texto, bordes y enlaces semánticos para claro y oscuro. El CSS añadido de premios usa los tokens de borde y enlace existentes; no agrega colores globales. |
| Tipografía | Conserva Sofia Sans Extra Condensed para el título de Panal y Plus Jakarta Sans para contenido y controles. Reutiliza los roles `display-lg` y `titulo-md`; las metas usan texto de 14 px en el CSS local y estados auxiliares `text-xs`. Son roles existentes, sin ampliar la escala global. |
| Firma y controles | Conserva siete hexágonos, centro amarillo subrayado y seis exteriores azules. La geometría, el foco local y la adaptación a movimiento reducido no cambian en el diff. El panal sigue siendo un control funcional; no se añadieron imágenes. |
| Composición | Conserva dos columnas desde 64 rem y una en celular. La próxima meta ocupa el espacio de progreso; premios, palabras y reglas quedan al lado en escritorio y después de los controles en celular. Las capturas de 1440 × 1000 y 390 × 844 muestran las acciones y «Volver a Juegos» en el primer viewport. |
| Premios | La adición local es una lista de tres columnas con líneas superiores y texto: 5 palabras / +1, 10 palabras / +2 y Genio / +3, total 6 GH Points. El premio confirmado cambia la línea al color de enlace y dice «Guardado»; los pendientes muestran su avance o umbral. No aparecen tarjetas anidadas ni nueva profundidad. |
| Salida y retorno | El enlace «Volver a Juegos» acompaña las acciones; el componente evita navegar mientras hay una solicitud en curso. El texto explica guardado automático y retorno durante el día. Los premios pendientes tienen mensaje y reintento propios. |

Reglas locales conservadas: **panal como control**, **acciones en el primer viewport** y **estado comprensible mediante texto**. Describen esta superficie y no se convierten en prohibiciones globales para otras pantallas.

## Extensión y evidencia

La nueva política empieza el **24 de septiembre de 2026 a las 00:00 de Colombia (05:00 UTC)**. El 23 conserva catálogo, premio y copy anteriores. Desde el cambio, cada reto tiene entre 20 y 30 palabras y permite acumular +1 GH Point con 5 palabras, +2 más con 10 y +3 más al llegar a Genio, hasta 6. Se distinguen puntos de juego, próxima meta y GH Points guardados.

Las capturas [de escritorio](desktop.png), [de celular](mobile.png) y [de celular oscuro](mobile-dark.png) muestran el 24, 26 palabras disponibles, cinco encontradas y 1 de 6 GH Points guardado. Según [el registro de verificación](verification.md), se obtuvieron con reloj Node adelantado en un proceso local aislado, sin modificar el reloj del sistema ni acreditar premios a personas reales.

[El revisor independiente](finish-review.md) concluyó `ship` para esta extensión y no pidió correcciones materiales. Conservó como referencias el panal hexagonal, las acciones del primer viewport y la distinción textual entre puntos, premios y próxima meta. Su comparación externa está limitada por la ausencia de una tarjeta QUALITY BAR; las capturas por sí solas no demuestran el corte horario ni los estados transitorios.

La verificación funcional se incorpora como **evidencia reportada por el agente principal**, sin repetir pruebas ni detector en este cierre: `npm run check` aprobado; 16 casos de integración de Panal; catálogo anterior reproducible sin diferencias de bytes; catálogo nuevo de 126 tableros con 20–30 palabras; E2E de ambas fechas, salida/retorno, tres premios, reintento y accesibilidad clara/oscura; detector `[]`. El detalle y sus límites están en [verification.md](verification.md).

## Límite documental y publicación

Se actualizó únicamente `.impeccable/surfaces/panal.md` y se creó este informe. No se editó código, producto, tokens, otras documentaciones ni archivos de sistema. `DESIGN.md` y `.impeccable/design.json` no existen en este checkout; la extensión conserva la autoridad del sistema implementado y no los genera de manera lateral.

No canonizado ni reparado: la ausencia previa de DESIGN.md/sidecar y los recursos globales de eyebrow y sello quedan fuera de esta extensión; su presencia no se promueve a regla nueva de Panal. La revisión no encontró defectos materiales nuevos dentro del alcance local.

**Publicación pendiente de verificación.** El cierre documental y el veredicto local no certifican despliegue ni activación en producción.
