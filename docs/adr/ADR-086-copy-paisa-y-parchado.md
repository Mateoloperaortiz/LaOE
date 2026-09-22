# ADR-086: Copy paisa y parchado

- Estado: Aceptada
- Fecha: 2026-09-22
- Relacionadas: ADR-079, ADR-081
- Enmienda: la voz de [07-marca.md](../07-marca.md) §1 y de [14-copy-y-textos.md](../14-copy-y-textos.md) §1

## Contexto

Todo texto visible sale de [14-copy-y-textos.md](../14-copy-y-textos.md) por su código `T-…` (ADR-081). Desde la fase 0 está en voseo («Entrá a Mi OE», «tenés», «Volvé pronto»), cercano y corto, pero neutro: no tiene un solo modismo. El manual pide un tono «parchado» y la app no suena a Medellín.

El 2026-09-22 Mateo pidió que todo el copy suene más colombiano, paisa y parchado, y fijó el alcance:

- **Intensidad sutil.** El tono actual con un toque paisa, no una reescritura en jerga.
- **Todo**, administración incluida.
- **Se reescriben las propuestas de todos los dueños**; lo que ya confirmó o aprobó su dueño no se toca.
- **Primero las pruebas.** La E2E compara unos 1.500 textos literales; antes del copy pasa a leerlos del catálogo.

## Decisión

1. **Voz: voseo paisa con un toque.** Los modismos aparecen donde el tono lo permite: saludos, éxitos, celebraciones, estados vacíos, invitaciones e introducciones. En botones, formularios, errores e instrucciones manda la claridad; ahí el toque es, a lo sumo, una palabra («Listo», «De una»).
2. **Vocabulario permitido**, con medida (uno por texto, no todos los textos): de una, hágale, listo pues, pues (muletilla al final), bacano, qué nota, pilas, parce/parcero (solo en saludos y celebraciones), parche, camellar, severo, a lo bien, ratico, pegarse (a un plan), berraco (en sentido de admiración: «¡Qué berraco!»).
3. **Vetado**: chimba, gonorrea, marica, huevón y cualquier grosería; berraco en sentido de enojo; diminutivos que infantilicen en el admin; jerga que cambie el sentido de un término fijo.
4. **La administración lleva el mismo toque, más sobrio**: modismos en confirmaciones y estados vacíos, nunca en advertencias, auditoría ni exportes.
5. **Los mensajes sensibles siguen serios**: permanencia, salida, expulsión, retiro, datos personales y todo lo marcado «texto sensible». Sin modismos ni ¡OE OE OE!.
6. **No se toca lo que ya aprobó su dueño**: filas en estado «Confirmado» o «Aprobado por el manual» (misión, visión, historia). Las «Propuesta» de GH, la junta, COM y los comités sí se reescriben: siguen siendo propuestas y su dueño puede reemplazarlas.
7. **Invariantes de cada texto**: los `{variables}`, la cantidad de piezas separadas por « · » (`tList` y título · cuerpo de push y correos) y el `**negrito**` quedan idénticos. Los términos fijos de §1 (miembro, activo, Mi OE, cartelera, GH Points, permanencia, semestre, término) no cambian. Siguen los límites: push hasta 40 y 120 caracteres, asunto hasta 60, botones de una a tres palabras.
8. **¡OE OE OE! sigue igual**: cierra éxitos, celebraciones y estados vacíos, nunca errores.
9. **Las pruebas no comparan copy literal.** Toda prueba que busca un texto de la interfaz lo pide al catálogo con `t("T-…")` (el patrón de `autorizacion.spec.ts`), así un cambio de redacción no rompe la suite. Los nombres de datos de prueba (`e2e-…`) siguen literales.

## Consecuencias

- El cambio es casi todo de redacción en un archivo; `copy:sync` lo lleva al código. Pocas cadenas visibles viven fuera del catálogo (errores de la billetera y de algunas rutas de API) y pasan a códigos `T-…`.
- La E2E deja de depender del copy: un texto nuevo se revisa por su sentido, no por cuántas pruebas rompe.
- Un script compara el antes y el después de cada código y rechaza cualquier cambio de variables o de piezas; es lo que impide que una etiqueta quede vacía o un placeholder sin llenar.
- La lista de textos aprobados que no se tocaron queda en el PR para consultarla con sus dueños.

## Cómo quedó (2026-09-22)

- **86 textos reescritos de 1.985.** El nivel sutil se tradujo en eso: saludos («¿Qué más, {nombre preferido}?»), éxitos («¡De una! Sumaste {n} GH Points»), estados vacíos y celebraciones de juegos y retos. Pocos en el admin (18) y ninguno en permanencia, salidas, datos personales, contraseñas, finanzas ni normativa.
- **El 404 tiene código propio, T-2721** («Uy, esta página no existe. Volvé al inicio.»). T-032 sigue siendo el error genérico «no encontrado» que lanzan más de cien acciones y comandos de dominio, y ahí no cabe un toque.
- **Dos correcciones de término fijo** que salieron en la revisión: «integrante» pasa a «miembro» en T-1250 y T-2091, como pide §1.
- **Los errores escritos en el código no llegan a la pantalla.** Los de la billetera (`google.ts`, `apple.ts`) y los `error` de `src/app/api/**` se atrapan y la interfaz muestra un texto del catálogo (por ejemplo T-1208), así que no se movieron.
- **Dos listas no se pueden reescribir sin tocar código**: T-038 (navegación del portal, `src/app/(public)/layout.tsx`) y T-061 (menú de Mi OE, `src/app/app/layout.tsx`) se comparan con nombres escritos a mano. Esta vez no se tocaron.
- Las propuestas se escribieron por sección, pasaron un validador de invariantes (variables, piezas « · », negritas, límites de push y asunto, filas protegidas, palabras vetadas) y una revisión de conjunto que emparejó el tono y quitó repeticiones.

## Lo que queda fuera

- **El contenido editable desde el admin** (páginas del CMS, plantillas y campañas de correo, normativa importada): es de sus dueños y vive en la base.
- **Los PDF oficiales y el manual**: el texto institucional aprobado no cambia de voz.
