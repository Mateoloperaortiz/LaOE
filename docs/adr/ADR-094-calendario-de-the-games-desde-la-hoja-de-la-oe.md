# ADR-094: El calendario de The Games se importa desde la hoja de la OE

- Estado: Aceptada
- Fecha: 2026-09-24
- Relacionadas: ADR-012, ADR-089, ADR-093
- Enmienda: ADR-089 (regla 8: además de generarse, el calendario de una jornada se puede importar desde una hoja de cálculo; regla 3: la importación crea los equipos de la hoja si la competencia no tiene)

## Contexto

El 2026-09-24 la Dirección de The Games entregó a Mateo `Rotaciones_TheGames.xlsx`, con el calendario del jueves. La hoja principal, «Equipo-Rotacion-Base», tiene una fila por equipo y rotación con cuatro columnas: Equipo, Rotación, Base y Rival. Las otras dos hojas son vistas de la misma información.

Ese calendario es el que se va a jugar, pero no sale del generador de ADR-089 regla 8: lo armó la OE, con sus 30 equipos con nombre y sus 15 bases numeradas. Mateo lo revisó el mismo día:

- Tiene 15 rotaciones con 15 enfrentamientos cada una.
- Cada equipo pasa una vez por cada base.
- Los 225 cruces son distintos, entre dos grupos de 15 equipos.
- Las tres hojas coinciden.

Cumple ADR-093. Cargarlo a mano serían 30 equipos y 225 enfrentamientos, uno por uno.

Ese mismo día llegó la hoja del viernes, en el mismo formato. Tiene las bases 16 a 30 y es coherente, pero repite los 225 cruces del jueves en el mismo orden: cada equipo enfrenta a los mismos 15 rivales. El validador lo muestra como 225 cruces repetidos, que hay que confirmar. Sin repetir, el mínimo es una revancha por equipo, porque los 225 cruces entre grupos ya se jugaron el jueves y dentro de cada grupo quedan 14 rivales para 15 partidos. El 2026-09-25 llegó una versión 2 del viernes, `Rotaciones_TheGames_16-30_v2.xlsx`. Numera las rotaciones del 16 al 30, usa las bases 1 a 15, trae una quinta columna «Enfrentamiento repetido» y es coherente. Repite 113 cruces del jueves: 7 u 8 por equipo.

## Decisión

1. **Se importa una jornada pegando la hoja.** En Rotaciones, una jornada sin rotaciones se puede generar (ADR-089 regla 8) o importar.
   - El operador copia de la hoja de cálculo las columnas Equipo, Rotación, Base y Rival, con o sin encabezado, y las pega.
   - Se aceptan tabuladores, que es lo que da copiar desde la hoja, y también comas o punto y coma.
   - La base puede venir como «3» o como «Base 3».
   - Las columnas de más, como «Enfrentamiento repetido», se ignoran.
   - La casa no lee archivos `.xlsx`. Pegar evita una dependencia nueva y una subida de archivos.
2. **La hoja tiene que ser coherente para entrar.** Cada fila dice que el equipo juega contra el rival en esa base y esa rotación. Por eso:
   - Si también está la fila del rival, tiene que decir lo mismo.
   - Un equipo no puede tener dos enfrentamientos en una rotación, ni una base dos enfrentamientos.
   - Las rotaciones van seguidas, sin saltos, y **conservan el número de la hoja**. Si el viernes sigue la numeración del jueves, la jornada 2 va de la rotación 16 a la 30, igual que en las hojas de la OE. El orden de avance es jornada y número.

   Cada problema de la hoja se informa con su línea, y no se guarda nada.
3. **Equipos.** Si la competencia no tiene equipos, la importación crea los de la hoja, numerados en el orden en que aparecen en la columna Equipo. Si ya tiene, los nombres de la hoja tienen que coincidir con los suyos, sin distinguir mayúsculas, tildes ni espacios de más. Un nombre desconocido es error: un error de tipeo no crea un equipo 31.
4. **Bases.** La base N de la hoja es la base en el puesto N de la jornada.
   - Si la jornada no tiene bases, se crean como «Base N» con el número de la hoja, todas normales. En la hoja del viernes, que numera sus bases del 16 al 30, quedan «Base 16» a «Base 30». Después el operador les pone su nombre y marca como macro las de inflables.
   - Si ya tiene bases, la hoja solo puede usar las que existen.
5. **El validador manda.** El calendario importado pasa por el mismo validador que un cambio a mano (ADR-089 regla 8 y ADR-093):
   - Los errores bloquean.
   - Las advertencias nuevas piden confirmar: un cruce repetido con la otra jornada o un equipo que no juega.

   Todo ocurre en una sola transacción: entra la jornada completa o no entra nada.
6. **La duración la fija el operador.** La hoja no trae horas. El operador fija los minutos por rotación al importar, igual que al generar.
7. **Auditoría.** Cada equipo y cada base creados dejan su fila, igual que si se crearan a mano. La jornada deja además una fila `competition.schedule.import`, con los números de rotaciones, enfrentamientos, equipos y bases creados. Los enfrentamientos quedan con origen `MANUAL`.

## Consecuencias

- No hay migración ni tablas nuevas.
- **La jornada 2:** el generador supone su propia jornada 1, porque toma las mitades por número de equipo. Si se importa la jornada 1, la 2 también se importa. Si se genera, hay que revisar en el validador los cruces repetidos antes de confirmar.
- **Corregir la hoja:** mientras la jornada no tenga resultados, se borra su calendario y se importa otra vez. También se puede corregir una rotación a mano.
- **Pruebas:**
  - unitarias del lector de la hoja: separadores, encabezado, base como «Base N», filas incoherentes y rotaciones con salto;
  - integración de la importación: crea equipos, bases y rotaciones; rechaza un nombre desconocido y una hoja con errores sin guardar nada; pide confirmar los cruces repetidos con la otra jornada.
