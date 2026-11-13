# ADR-189: El portal como afiche vivo

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Enmienda: [ADR-158](ADR-158-la-marca-en-dos-capas.md) (regla 1: la capa de marca del portal cambia de composición) y [ADR-188](ADR-188-el-rediseno-llega-a-todas-las-pantallas.md) (regla 5: «El portal no cambia»)
- Relacionadas: ADR-037, ADR-085 (P2), ADR-163, ADR-164, `07-marca.md`

## Contexto

El rediseño llegó a las 133 rutas de la capa funcional (ADR-188). Las 17 de la capa de marca quedaron como estaban, porque ADR-158 y ADR-163 dicen que esa capa no cambia.

El 2026-11-13 Mateo pidió ideas para el portal, eligió la dirección «Afiche vivo» sobre una maqueta de la portada y pidió llevarla a todo el portal. La dirección es esta:

- la marca se queda completa: los cinco fondos del cartel, la condensada, los elementos gráficos y el grano;
- la portada se compone como un afiche de borde a borde, no como una tarjeta dentro de la página;
- el titular de la portada cambia solo, con datos que la casa ya lee.

Las referencias que se revisaron están en `informes/referencias-portal-2026-11-13/` (LA28, Nike, Estéreo Picnic, Google I/O, Spotify Wrapped y otras). De ellas se toma la composición, no el diseño.

## Decisión

1. **El portal sigue en la capa de marca.** Lo declara igual (`data-capa="marca"`) y ninguna regla de la capa funcional entra. Lo que cambia es la composición de sus páginas.
2. **El afiche.** Cada página del portal abre con una banda de borde a borde que usa los colores y el grano de un cartel (07-marca §7) y, como el cartel, no cambia con el tema. Lleva el título de la página en la condensada, a tamaño de afiche. Es un componente del portal (`Afiche`), no una pieza nueva de la marca.
3. **El titular de la portada tiene tres momentos**, y la casa elige uno al dibujar la página:
   - **Convocatoria abierta**: hay un formulario público de admisión abierto (ADR-037). El titular invita a postularse y muestra hasta cuándo, si el formulario tiene fecha de cierre.
   - **Semana de evento**: la próxima edición pública empieza hoy o en los siete días siguientes, contados en días civiles de la zona de la app. El titular es la edición, con su fecha, su lugar y cuánto falta.
   - **Resto del semestre**: ninguna de las dos. El titular es el lema.

   Si coinciden, manda la convocatoria: la edición sigue en «Próximo encuentro», justo debajo. La regla vive en una función pura (`portadaMomento`).
4. **La portada.** Debajo del titular van, en orden: la franja de los comités publicados, las cifras de la OE, el próximo encuentro (si no es ya el titular), los macroeventos, la cartelera y un cierre que repite la acción principal.
5. **Las cifras son texto del catálogo**, no un cálculo: son las mismas que el portal ya publica en su titular (1987, 18 comités, cuatro macroeventos). Si cambian, las cambia Comunicaciones en el catálogo.
6. **Las fotos.** El afiche no depende de una foto: sin imagen, su lado gráfico es un elemento de la marca. Entra una imagen solo donde la casa ya la tiene publicada, que hoy es la portada de un evento o de una edición. Una foto de la OE en el titular queda pendiente de dos cosas: autorización de uso público y un lugar donde Comunicaciones la suba (`11-contenido-pendiente.md`).
7. **La cabecera y el pie son navy**, en los dos temas: enmarcan cada página como las bandas de un afiche.
8. **Las tarjetas del portal son afiches.** Los eventos y los anuncios siguen siendo carteles con la rotación de color del feed (07-marca §8), más altos y con el título abajo.
9. **Lo que no cambia.** Las pantallas de presentación (`/presentar`) ya son afiches de pantalla completa (ADR-181). El muestrario (`/marca`) y los textos largos de las páginas editables siguen igual. Los temas y los bloques de la plataforma siguen atados a P2 de ADR-085.

## Consecuencias

- **Sin migración ni dato nuevo.** La portada lee lo que ya leía: el formulario de admisión abierto, la próxima edición, los eventos, los anuncios y, ahora, los comités publicados.
- **Textos nuevos** en el catálogo (T-5034 a T-5039): las etiquetas de los momentos, la cuenta regresiva, las cifras y el sello.
- **El contraste se mide.** Sobre papel, el acento del titular es una barra naranja debajo del texto navy, no texto naranja.
- **`tests/unit/portada-momento.test.ts`** fija los tres momentos y sus bordes (hoy, el día siete, el día ocho, una edición que ya empezó).

## Pendiente

- Fotos de la OE con autorización de uso público, y dónde las sube Comunicaciones.
- Que Comunicaciones confirme los rótulos de las cifras.
