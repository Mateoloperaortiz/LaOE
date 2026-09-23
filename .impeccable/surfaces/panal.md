# Panal de Mi OE

Modo: Operate. Extensión de Juegos para formar palabras en español en computador y celular.

THESIS: tocar siete letras para descubrir palabras, ver cuánto avanzaste y retomar durante el día; desde el 24 de septiembre de 2026, elegir hasta qué meta llegar conservando los premios obtenidos.

OWN-WORLD: hereda tokens OE (navy #001f3e, blue #94b6f0, yellow #ffd84b, paper #f6f6f6), Sofia Sans Extra Condensed en títulos y Plus Jakarta Sans en cuerpo; superficies semánticas para claro y oscuro. No cambia el sistema global.

STORY: biblioteca → reto de hoy → formar y enviar palabras → progreso y próxima meta → premio guardado → seguir buscando o volver a Juegos → retomar durante el mismo día.

FIRST VIEWPORT: nombre y fecha, progreso y próxima meta legibles, campo de palabra, panal compacto y acciones; «Volver a Juegos» acompaña los controles desde la nueva política. Premios, palabras encontradas y reglas al lado en escritorio y debajo en celular. Los controles y la salida permanecen visibles sobre la navegación fija en la captura de 390 × 844.

FORM: extensión local, seed no aplica. Firma: siete botones hexagonales, centro amarillo inamovible y seis exteriores azules que se pueden mezclar; el panal es el control real, sin ilustración decorativa. Los tres premios usan líneas, texto y estados «Guardado» o progreso; no dependen solo del color. Estados de carga, palabra inválida, duplicada, desconexión y reintento, premio pendiente de guardar, cierre y día nuevo.

FINISH: pruebas de flujo y accesibilidad en 390 y 1440 px; revisión independiente al finalizar. Sin recursos raster nuevos ni cambios de DESIGN.md, sidecar o tokens globales. La revisión visual local y las pruebas reportadas no equivalen a publicación verificada.

Extensión por avances, documentada el 23 de septiembre de 2026:

- Desde el **24 de septiembre de 2026 a las 00:00 de Colombia (05:00 UTC)**, el catálogo diario tiene entre 20 y 30 palabras, alrededor de 25. El catálogo anterior permanece disponible; el 23 conserva catálogo, premio único y copy anteriores.
- Premios acumulables: **+1 GH Point con 5 palabras, +2 más con 10 y +3 más al llegar a Genio; total máximo de 6 al día**. Los puntos de juego y los GH Points siguen siendo magnitudes distintas.
- Palabras válidas y premios confirmados se guardan automáticamente. Se puede volver a Juegos y retomar durante el día; el guardado pendiente se comunica y permite reintentar. El enlace de salida evita abandonar durante una solicitud en curso.
- La próxima meta acompaña la barra de progreso; «Tus premios de hoy» muestra las tres metas, el estado de cada premio y el total guardado.

Cierre inicial: el revisor independiente consideró resueltos los controles del primer viewport móvil, el puntaje total por palabra y el resultado visible; su veredicto `ship` estaba limitado a esas correcciones. Evidencias en [la revisión inicial](../review/panal/review.md).

Cierre de la extensión: [la revisión independiente](../review/panal-checkpoints/finish-review.md) concluye `ship` dentro del alcance de premios por avances, salida/retorno y reto más corto, sin correcciones materiales. [La verificación reportada](../review/panal-checkpoints/verification.md) cubre las políticas del 23 y del 24, el corte horario, guardado, retorno, reintento y accesibilidad. Las capturas [escritorio](../review/panal-checkpoints/desktop.png), [celular](../review/panal-checkpoints/mobile.png) y [celular oscuro](../review/panal-checkpoints/mobile-dark.png) corresponden a pruebas locales con fecha 24, cinco palabras y el primer premio guardado; no son datos de producción. [El cierre documental](../review/panal-checkpoints/documentation.md) compara la extensión con la superficie incumbente y conserva el sistema global.

Estado de publicación: **pendiente de verificación**. El visto bueno local no acredita despliegue ni activación en producción.
