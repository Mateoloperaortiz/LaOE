# ADR-138: Tú paisa sutil, sin acentuación argentina

- Estado: Aceptada
- Fecha: 2026-10-23
- Relacionadas: ADR-079, ADR-081, ADR-086
- Enmienda: ADR-086 (la voz), la voz de [07-marca.md](../07-marca.md) §1 y de [14-copy-y-textos.md](../14-copy-y-textos.md) §1

## Contexto

[ADR-086](ADR-086-copy-paisa-y-parchado.md) fijó la voz como «voseo paisa con un toque» y la ilustró con «Entrá a Mi OE», «tenés» y «Volvé pronto». Esas formas escritas —imperativo agudo («entrá», «mirá», «leé»), presente en «-ás/-és» («tenés», «podés», «querés»), imperativo con enclítico sin tilde en la raíz («inscribite», «pegáte» escrito «pegate», «revisalo») y «acá»— son las del voseo rioplatense. En Medellín el vos hablado existe, pero escrito en una interfaz esas grafías se leen argentinas, no paisas.

El 2026-10-23 Mateo pidió quitar el copy con acentuación argentina para que suene más colombiano paisa, y fijó el alcance: **solo la casa digital**, trato de **tú paisa sutil**, y **sin tocar lo ya aprobado o confirmado**.

Alternativas descartadas: el «usted» paisa («entre», «tiene», «hágale pues») suena antioqueño pero formal para botones y saludos entre estudiantes; y mantener el vos antioqueño escrito apenas cambia las grafías en disputa, así que no resuelve la percepción que motivó el cambio.

## Decisión

1. **Voz: tuteo paisa sutil.** Lo que ve un miembro y el admin se conjugan en «tú» colombiano («Entra a Mi OE», «tienes», «puedes», «vuelve», «elige», «inscríbete», «revísalo», «aquí»). Lo paisa va en el léxico permitido por ADR-086, no en la acentuación de los verbos.
2. **Todo lo demás de ADR-086 sigue vigente**: vocabulario permitido y vetado, intensidad sutil (uno por texto y no en todos), admin más sobrio, mensajes sensibles serios, «¡OE OE OE!» solo en éxitos y celebraciones, invariantes de `{variables}`, piezas « · » y `**negrito**`, límites de push, asunto y botones, y pruebas que leen el copy del catálogo.
3. **Dos citas fijas no se conjugan de nuevo**: el eslogan del manual «Lo hacemos por vos» (T-002 y los cierres de correo que lo citan) y la muletilla «hágale». Cambiar el eslogan es decisión de COM sobre el manual, no de esta enmienda.
4. **Alcance**: solo las filas en «Propuesta» de [14-copy-y-textos.md](../14-copy-y-textos.md). Las «Confirmado» y «Aprobado por el manual» quedan intactas. La redacción interna (docs, comentarios de código) y el copy de DÍAS quedan fuera; igualarlos sería otra decisión.

## Consecuencias

- La conversión es forma por forma sobre el catálogo y `npm run copy:sync` la lleva al código generado; como las pruebas piden el copy con `t("T-…")`, un «tenés» que pasa a «tienes» no rompe la suite.
- Todo texto nuevo en `docs/14` nace en «tú»: un «entrá» o un «podés» en una propuesta nueva es un error de voz, se corrige en revisión.
- Quien lea ADR-086 sin esta enmienda encontrará la voz anterior; por eso ADR-086 cierra con la sección «Enmienda» que apunta aquí y su estado pasa a «Aceptada (enmendada por ADR-138)».

## Cómo quedó (2026-10-23)

- **486 textos convertidos de 2.693**, forma por forma sobre la celda de propuesta (presente, imperativo, imperativo con enclíticos, subjuntivos en «-ás/-és» y «acá» → «aquí»). Ninguna fila protegida cambió y ningún texto perdió ni ganó variables, piezas « · » o negritas; sin residuos rioplatenses en las propuestas.
- **52 textos «Confirmado» o «Aprobado» conservan el voseo anterior** por la regla 4, entre ellos los de juegos y Color T-3008 en adelante, los de GT/GAP T-2345 a T-2387 y la etiqueta «Vos» del podio (T-3552). Igualarlos exige que su dueño los reapruebe en «tú»; hasta entonces conviven las dos voces en esas pantallas.
- Los únicos rioplatenses que quedan en el resto del repo no son copy: palabras del diccionario del Wordle («podés», «tenés»), datos de prueba que simulan un formulario ajeno y mensajes internos que no llegan a la pantalla (ADR-086).
- Verificación local: `npm run copy:sync` (2.693 textos) y las etapas de `npm run check` en verde —lint, tipos, dependencias, código muerto, 2.603 unitarias, 11 del extractor, 2.020 de integración y build—; la corrida única se cortó en integración por no estar arriba la base local de pruebas y se completó por etapas con la base en 127.0.0.1:5433.
