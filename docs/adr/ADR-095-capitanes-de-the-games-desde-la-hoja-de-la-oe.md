# ADR-095: Capitanes de The Games desde la hoja de la OE

- Estado: Aceptada
- Fecha: 2026-09-28
- Relacionadas: ADR-013, ADR-014, ADR-047, ADR-072, ADR-085, ADR-089, ADR-090, ADR-094
- Enmienda:
  - ADR-089, regla 3: el equipo guarda el nombre y el celular de sus capitanes.
  - ADR-089, regla 4: la operación ve ese contacto, y en 2026 los capitanes no se inscriben por formulario.
  - ADR-090, regla 2: la vitrina lleva los nombres de los capitanes cuando el ADMIN la prende.
  - ADR-014: dos excepciones acotadas, los nombres de los capitanes en la vitrina y su celular para la operación de la competencia.

## Contexto

ADR-089 preveía que los capitanes se inscribieran en un formulario de la casa y que cada equipo naciera de esa respuesta. No pasó así:

- La OE inscribió a los participantes de Días EAFIT en Epik, con su propio formulario.
- Los 30 equipos de `the-games-2026` salieron de la hoja de rotaciones (ADR-094), sin respuesta de inscripción.

El 2026-09-28 la OE le entregó a Mateo la exportación de esa inscripción:

- 338 personas en 30 equipos, nombrados «Equipo 1» a «Equipo 30».
- Los capitanes van marcados en la hoja, dos por equipo.
- Cada fila trae cédula, correo, celular, ID Epik, EPS, tipo de sangre, alergias y morbilidades, y un contacto de emergencia.
- Varios de esos son datos de salud, que la política de la OE no pide ([política de datos](../17-politica-de-datos.md)).

Durante la competencia, la operación necesita llamar a un capitán, por ejemplo si su equipo no llega a una base. Además, Mateo quiere que `dias.oeeafit.com/the-games/` muestre quién capitanea cada equipo.

Ese mismo día, Mateo confirmó tres cosas:

- «Equipo N» es el equipo N de la hoja de rotaciones, que es su número en la casa.
- Los capitanes son los dos marcados de cada equipo. En el Equipo 11 la hoja marcaba uno solo, y Mateo confirmó el segundo.
- La inscripción autorizó publicar el nombre de los capitanes.

## Decisión

1. **Solo nombre y celular.**
   - `competition_team_captain` guarda hasta dos capitanes por equipo, cada uno con su puesto (1 o 2), su nombre y su celular.
   - De la hoja de la OE no entra nada más: ni cédula, ni correo, ni ID Epik, ni datos de salud, ni contactos de emergencia.
   - El capitán sigue sin ser usuario ni persona de la casa (ADR-085, regla 8): no tiene cuenta, `Person` ni `Consent`.
2. **Se cargan pegando tres columnas.** En Equipos, el ADMIN pega Equipo, Nombre y Celular, con o sin encabezado, como la hoja de ADR-094.
   - El equipo va por su número («27» o «Equipo 27») o por su nombre, sin distinguir mayúsculas, tildes ni espacios de más.
   - El celular queda en 10 dígitos: se quitan los espacios, los signos y el 57 del país. Si viene vacío, queda vacío.
   - **Una fila con más de tres columnas se rechaza.** Así no se puede pegar la fila completa de la hoja, con la cédula y los datos de salud.
   - Todo o nada: si una fila tiene un problema, no se guarda ninguna, y cada problema se informa con su línea.
   - Cada carga reemplaza a todos los capitanes de la competencia. Un equipo que no está en la carga queda sin capitanes.
3. **Quién ve qué.**
   - La operación de la competencia (ADMIN, la Dirección de The Games y el personal OPERATOR) ve en Equipos el nombre y el celular, con un enlace para llamar. Los jueces no los ven.
   - Cargar, borrar y publicar es solo del ADMIN, porque es quien maneja datos personales (ADR-014).
4. **La vitrina.**
   - `competition.showCaptains` arranca apagado. El ADMIN lo prende cuando la autorización está confirmada, y lo apaga si alguien objeta.
   - Con el interruptor prendido, la vitrina suma `captains: [{ number, names }]`, con los nombres en el orden de la hoja. Apagado, lleva `captains: []`.
   - El celular nunca sale.
   - Es un campo nuevo que no cambia los demás, así que la vitrina sigue en `version: 1`.
5. **Retención.**
   - Archivar la competencia borra sus capitanes y apaga la vitrina, en la misma transacción.
   - El ADMIN puede borrarlos antes con «Borrar los capitanes».
   - `the-games-2026` se archiva a más tardar el 2026-10-16.
6. **Auditoría sin datos personales.** Ninguna fila lleva nombres ni celulares:
   - Cargar deja `competition.captains.import`, con cuántos equipos y capitanes entraron.
   - Borrar deja `competition.captains.clear`, con cuántos salieron.
   - Publicar o dejar de publicar deja `competition.captains.visibility`.

## Consecuencias

- **Migración `0041`, aditiva:** crea la tabla `competition_team_captain` y la columna `competition.showCaptains`, apagada.
- **El formulario de inscripción** de ADR-089, regla 4, sigue disponible para otra edición, pero en 2026 no se usa.
- **`dias`** muestra los nombres bajo cada equipo de la tabla (D-038 de `dias`) y no los guarda.
- **Revisión:** la Dirección revisa la carga equipo por equipo antes de que el ADMIN prenda la vitrina.
- **La hoja de la OE** no entra a la casa ni a ningún repositorio. Queda en manos de la OE.
- **Pendiente:** la próxima versión de la política de datos debe mencionar a los capitanes de The Games ([contenido pendiente](../11-contenido-pendiente.md)).

## Verificación requerida

- **Unitarias:**
  - El lector de las tres columnas: encabezado, separadores, «Equipo N», número y nombre, celular con 57 y con signos, celular inválido, columnas de más, tres capitanes en un equipo y hoja vacía.
  - La vitrina, con la publicación apagada y prendida. El celular no sale nunca.
- **Integración:**
  - Cargar reemplaza a los capitanes anteriores.
  - Un equipo desconocido no deja guardar nada.
  - Solo el ADMIN carga, publica y borra.
  - Archivar borra los capitanes y apaga la vitrina.
  - La auditoría no lleva nombres ni celulares.
  - La vitrina publica los nombres solo con el interruptor prendido.
