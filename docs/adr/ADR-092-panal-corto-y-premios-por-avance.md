# ADR-092: Panal corto y premios por avance

- Estado: Aceptada (enmendada por ADR-131); en producción desde el 24 de septiembre de 2026 a las 08:30 de Colombia
- Fecha: 2026-09-23
- Enmienda: ADR-088 (catálogo y acreditación), ADR-007 (créditos de Panal)

## Contexto

Mateo pidió partidas de unas 25 palabras y checkpoints para poder salir antes con un premio. Confirmó 1 GH Point con 5 palabras, 2 adicionales con 10 y 3 adicionales al llegar a Genio: máximo 6 por día. Después indicó que el cambio debe empezar mañana: **24 de septiembre de 2026 a las 00:00 en Colombia (05:00 UTC)**; hoy permanece intacto.

## Decisión

1. Nuevo catálogo inmutable `rla-es-2.9-panal-v2`: 20–30 respuestas, centro que más acerque el total a 25, un centro por conjunto de letras y al menos un pangrama. Los candidatos se amplían a las 50.000 formas de la fuente de frecuencia existente; se siguen incluyendo todas las formas RLA-ES que cumplan las letras, sin recortar respuestas válidas. Para las partidas nuevas, los nueve términos de mayor puntaje juntos no alcanzan Genio: las tres metas mantienen su orden.
2. El catálogo anterior permanece disponible. Las partidas existentes conservan tablero, palabras y puntos; el catálogo corto se selecciona por día civil desde el 24 de septiembre. Antes del corte también los inicios nuevos usan V1 y el premio original de 6 al alcanzar Genio. No se cambia el comportamiento ni los textos de hoy. El servidor sigue siendo el único que conoce las respuestas.
3. Las metas son independientes e idempotentes: cinco palabras pagan 1, diez pagan 2 y Genio paga 3. Se acreditan al guardar una palabra, sin finalizar la partida, y se puede salir y volver durante el día. Una palabra puede alcanzar varias metas en la misma transacción. Nunca se vuelve a pagar una meta ni se supera el total de 6.
4. El ledger conserva intactos los créditos históricos de 6, que cubren todo el premio diario y excluyen nuevos créditos. Los nuevos créditos llevan identificador de checkpoint (1, 2 o 3), único por partida, y la base valida su importe exacto. `creditedAt` continúa indicando que se completó el premio de 6, no que se llegó a la primera meta.
5. La lectura no acredita puntos. Solo para partidas del 24 de septiembre en adelante, si un despliegue gradual deja avances pendientes de acreditar, la interfaz ofrece guardarlos mediante una acción explícita; también se liquidan al guardar la siguiente palabra. Se conservan los controles de persona, día, elegibilidad, semestre y versión conocida, y los locks de semestre/persona/fila. No hay premios retroactivos de días vencidos.
6. La interfaz muestra las tres metas, GH Points ya acreditados y el próximo premio. Un enlace para volver a Juegos permite salir; los premios y palabras se guardan automáticamente. Se explica el guardado pendiente de partidas previas y se conserva el total real de su tablero.
7. Cada acreditación parcial queda auditada y emite un evento de avance para CRM. Genio conserva su evento existente. Mis datos informa puntos y metas acreditadas a partir del ledger.

## Verificación

Verificar el corte exacto a las 05:00 UTC y la invariancia del tablero/premio/interfaz del 23. Cubrir límites 4/5 y 9/10, salto de varias metas, crédito único con concurrencia/reintentos, salida y regreso, semestre cerrado, medianoche, crédito histórico de 6, recuperación explícita de avances previos, catálogo reproducible y ausencia de respuestas pendientes en el cliente. Verificar la interfaz móvil, escritorio y tema oscuro dentro de la identidad existente.

## Publicación

El corte lógico sigue siendo el 24 a las 00:00, pero la promoción efectiva terminó a las 08:30 de Colombia de ese día. Las partidas iniciadas antes del despliegue conservan V1; las nuevas usan V2. Ver [evidencia](../ci-cd-panal-checkpoints-2026-09-24.md).

## Enmienda (2026-10-14, ADR-131)

La política de avances 1+2+3 se conserva como resultado interno e historia, sin sumar GH Points a partir de la separación semestral. Para Más gamer cuenta una sola participación por juego/día al alcanzar cinco palabras; diez palabras y Genio no agregan otra. La reconstrucción de todo el semestre deduplica los checkpoints y respeta el histórico original, sin borrar ni editar entradas. Ver [ADR-131](ADR-131-gh-points-y-mas-gamer-con-rachas-separadas.md).
