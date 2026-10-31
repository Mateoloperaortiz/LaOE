# ADR-155: Conservar la posición al cambiar la vista

- Estado: Aceptada; publicada
- Fecha: 2026-10-30
- Relacionadas: ADR-043, ADR-044, ADR-154
- Enmienda: ADR-154, regla 4 (navegación GET dentro de la misma página)

## Contexto

La corrección de los guardados de ADR-154 no cubre cambiar pestañas, filtros o páginas de un listado. La reproducción en GH Points pasó de 2.367 píxeles a cero a 390 px, y de 1.899 a cero a 1440 px. Una sonda con `scroll={false}` aprobó los cuatro recorridos de pestañas. Las seis comprobaciones iniciales de filtros y paginación fallaron: la paginación pasó de 9.257 y 3.070 píxeles a cero, y los GET perdieron el marcador de continuidad del documento de la prueba.

La auditoría de `src` encontró 327 usos de NextLink en 122 archivos, 33 formularios GET, ocho llamadas a `router.push` o `router.replace` y una a `location.assign`. La mayoría de los enlaces tiene destinos calculados; mantener excepciones por pantalla dejaría entradas fuera de la regla común. Kanban, paleta de comandos y contenido Markdown también producen enlaces fuera de los imports de NextLink.

Una revisión adicional de once familias de callbacks directos identificó el arrastre del Kanban como el único guardado con redirección a la misma página que evitaba el formulario. Su reproducción pasó de 2.178 píxeles a cero.

Dos reproducciones posteriores detectaron controles GET desactualizados tras limpiar: la URL y `defaultValue` ya estaban vacíos, pero `input.value` conservaba el texto sintético anterior. La navegación sin recarga necesita renovar también el estado de los controles no controlados.

## Decisión

1. Una navegación conserva el desplazamiento cuando su destino tiene el mismo origen y ruta y no pide una ancla explícita. Cambiar la consulta actualiza la vista sin volver al inicio. Otra ruta, otro origen o una ancla explícita mantienen su navegación habitual; también se respeta un `#` vacío.
2. La función pura `preservePageScroll`, en `src/shared/lib/navigation-scroll.ts`, expresa esa regla para enlaces y navegación programática. No contiene permisos ni lógica de los módulos.
3. Los enlaces de la interfaz usan `AppLink`, en `src/shared/ui/AppLink.tsx`, que conserva la API de NextLink, incluidos `ref`, atributos y callbacks. Si no se indica `scroll`, aplica la regla común. Una opción explícita prevalece; los clics modificados y otros comportamientos nativos siguen a cargo de NextLink. La política incluye los enlaces locales de Kanban y la paleta, sin alterar sus demás funciones.
4. `ActionForm` intercepta únicamente un GET hacia la misma página, sin ancla explícita y en el destino actual. Construye los controles con `FormData(form, submitter)` y la consulta con `URLSearchParams`: conserva nombres repetidos, el nombre y valor del botón y los nombres de archivos. Como un GET nativo, reemplaza la consulta de `action` por esos controles. Navega mediante `router.push` con `scroll: false`, dentro de una transición de React, sin recargar el documento.
5. Los GET a otro destino, con ancla o con un `target` distinto de `_self` conservan su comportamiento nativo. Los handlers del formulario pueden cancelar el envío. Las Server Actions mantienen la restauración de ADR-154, incluido el foco de validación y el desplazamiento durante la espera.
6. Arrastrar una tarjeta del Kanban reutiliza su `ActionForm` existente: un mapa de referencias localiza el formulario y el selector de etapa, actualiza el selector y llama a `requestSubmit`. Así ambas formas de mover conservan la misma Server Action, mejora progresiva y estado `aria-busy`, sin una llamada paralela que evite el ciclo de envío del formulario.
7. Los GET con controles no controlados declaran una `key` derivada de sus valores aplicados (`defaultValue` y `defaultChecked`). Al limpiar filtros o volver mediante el historial, React remonta solo el formulario cuando cambian esos valores: los campos reflejan la consulta recibida sin recargar el documento. La identidad se declara junto al formulario; no se inspeccionan hijos ni se reinician campos mediante efectos genéricos. Los 33 GET quedan cubiertos: 32 keys nuevas en 31 archivos RSC y la existente de `ResourceToolbar`, basada en búsqueda y filtros.
8. El contenido Markdown usa `ContentLink`, un componente cliente de `src/shared/ui/AppLink.tsx`. Solo una consulta local del mismo origen y ruta, sin fragmento explícito, usa `AppLink` con `prefetch={false}`. Los demás enlaces siguen siendo elementos `a` nativos: API, descargas, anclas, externos y otras rutas conservan su transporte anterior, además del desplazamiento. El saneamiento de ReactMarkdown y `skipHtml` permanecen intactos.
9. La navegación GET usa `useTransition` para exponer `aria-busy`, bloquear envíos duplicados y deshabilitar sus controles mientras llega el commit. Así una edición posterior no se pierde al remontar el formulario de la consulta anterior. Al terminar, restaura los estados previos de los controles; no agrega contenedores ni cambia las reglas de CSS.

## Consecuencias

Pestañas, filtros, paginación y paneles siguen representados en la URL, conforme a ADR-043 y ADR-044. Compartir un enlace, usar atrás y adelante o navegar a otra pantalla conserva su significado. No se agregan dependencias, textos, datos personales ni cambios de dominio.

Las regresiones deben cubrir los controles compartidos y las variantes de escritorio y celular, GET con sus controles reales, consultas repetidas, anclas, otra página y la navegación por teclado. Limpiar y recorrer el historial debe actualizar tanto la URL como los valores visibles de los campos. Una respuesta RSC retenida debe comprobar el bloqueo del GET hasta el commit; el arrastre debe comprobar también el estado de envío con el POST retenido. Los resultados efectivos, el CI y la publicación se registran en el roadmap.
