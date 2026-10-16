# ADR-136: Comités por promedio GH y participación, con pesos 50/50

- Estado: Aceptada
- Fecha: 2026-10-16
- Relacionadas: ADR-007, ADR-009, ADR-024, ADR-035, ADR-070, ADR-073, ADR-131, ADR-133
- Enmienda: ADR-009 y ADR-024 regla 4 (criterio del ranking del término); ADR-035 reglas 10 y 13 (ranking y foto); ADR-070 (indicador principal del podio); ADR-131 regla 1 (aporte GH a comités)

## Contexto

El ranking de comités se resolvía sólo por participación ajustada de asistencias. Mateo aclaró que espera que los GH Points individuales aporten también, eligió **combinarlos** con esa participación y comparar GH mediante **promedio por integrante activo**. Confirmó pesos **50 % GH y 50 % participación**, con cada dimensión normalizada de 0 a 100 respecto al mejor comité comparable.

Esta decisión cambia la clasificación de comités, no las entradas o el saldo personal. La participación por ocasión sigue existiendo; los videojuegos permanecen en + gamer. Las fotos anteriores conservarán el criterio con el que se resolvieron.

## Decisión

1. **Dos dimensiones, un puntaje.** La participación es el promedio simple existente de las tasas ajustadas de ocasiones `CLOSED` con puntos positivos del término. No cambia su fórmula por ocasión, su suavizado ni el valor relativo de esas actividades. La dimensión GH es la media del saldo GH neto semestral de integrantes activos actuales. No es suma bruta, cantidad de créditos positivos o porcentaje literal de asistentes.
2. **Población activa actual.** Se toman personas `ACTIVE`, con pertenencia viva al instante efectivo de evaluación dentro del término y comité no `INACTIVE`. Cada persona cuenta una sola vez por comité; también entra al denominador si su saldo es cero. Quienes están en licencia, retirados u honorarios no forman parte de esa población activa. Un comité sin activos no tiene promedio válido y no compite. La población del promedio no reemplaza el denominador histórico de cada ocasión.
3. **El saldo acompaña al integrante actual.** Al transferirse de A a B, todo su saldo GH neto del semestre deja el promedio abierto de A y entra al de B junto con su persona en el denominador. No se atribuyen entradas según dónde se ganaron: eso exigiría otra regla e historia por fecha. Una persona multicomité aporta completo una vez en cada comité vivo, como ADR-024; no se divide el saldo ni se inventa un comité principal. Entrar en licencia o retirarse también cambia numerador y denominador mientras el término siga abierto.
4. **GH neto y procedencia estricta.** Se incluyen créditos y débitos GH del término: asistencias, retos/trivias/evidencias, bonos y beneficios GH legítimos, ajustes y legados GH. Se excluyen las fuentes nativas WORDLE/GAME2048/SUDOKU/PANAL/COLOR y LEGACY identificable como juego; una reversión hereda la clasificación de la entrada original, sin descontar dos veces. El filtro del nuevo combinado excluye gamer **incluso con `game_points_separated=false`**; no altera el saldo personal histórico que conserva esa política. No se clasifica un ajuste por texto del motivo, ni se clonan entradas por comité o se acreditan puntos personales nuevos.
5. **Normalización y pesos fijos.** Para cada comité `c`, `GH[c] = sumaGHneta[c] / activos[c]` y `P[c]` es su participación ajustada. Entre los comités comparables se toma el mejor valor positivo de cada dimensión:

   `GHnormalizado[c] = mejorGH > 0 ? 100 × max(0, GH[c]) / mejorGH : 0`

   `Pnormalizada[c] = mejorP > 0 ? 100 × max(0, P[c]) / mejorP : 0`

   `puntaje[c] = 0,5 × GHnormalizado[c] + 0,5 × Pnormalizada[c]`

   El promedio GH original sigue visible con signo; el piso cero sólo pertenece a su contribución normalizada. Con máximo no positivo la dimensión aporta cero a todos. Los pesos no se redistribuyen: si sólo hay participación, el mejor puede aportar 50, no 100. No se agregan pesos editables, configuración o bandera.
6. **Ceros observados y puestos.** Sin hechos GH o de asistencia en ningún comité comparable se conserva el estado vacío; existir en el roster no crea un ganador ficticio. Si existe al menos un hecho de cualquiera de las dos dimensiones entre los comparables, participan todos los comités reales con integrantes activos, incluidos los que no tienen hechos propios o cuyo neto es cero. La señal se decide para toda la población comparable, no por comité. Por ejemplo, A con un crédito GH de +10 y su reversión y B con integrantes activos sin créditos producen dos comités con índice 0 y puesto 1 compartido; B no es un placeholder. Se conserva precisión en el cálculo y el puntaje final a dos decimales visibles define el puesto, con igualdad compartida de competición. No hay desempate adicional por puntos GH, asistencia, tamaño, nombre o fecha. El nombre/ID sólo ordena presentación.
7. **El detalle explica el índice.** El podio y la clasificación nuevos presentan el puntaje combinado, con promedio GH neto y número de activos, participación original y actividades consideradas, componentes normalizados y pesos 50/50 en el detalle. «Participación ajustada» ya no afirma que por sí sola define el puesto nuevo. El índice 0–100 no son GH Points adicionales ni el porcentaje real de asistencia. No cambia el top 10 ni inventa puestos para empates.
8. **Foto y criterio explícitos al cerrar.** El cierre conserva versión del criterio, componentes originales y normalizados, máximos/cortes, pesos, población/denominadores y puestos bajo la misma barrera del término. Una foto anterior sin criterio combinado se interpreta como participación ajustada histórica; no se le añade media GH cero, un puntaje combinado o un roster actual. Un término cerrado sin foto no se reconstruye como combinado. No hay reapertura, backfill de premios o recalificación de snapshots antiguos.
9. **Es una proyección de participation.** Se reutilizan el ledger, el cálculo de participación y las lecturas públicas del módulo; la UI no consulta base ni deriva otra clasificación. La exclusión de gamer del combinado es explícita y no cambia la política de saldos individuales. No nacen otra moneda, tabla de premios, canjes o efectos de gamificación al calcular el ranking.

## Ejemplos y consecuencias

- Si A tiene promedio GH 40 y participación 0,10, y B tiene GH 20 y participación 0,20, normalizan a 100/50 y 50/100. Ambos suman 75 y comparten puesto; no se elige ganador por una de las dimensiones.
- Si todos los promedios GH son cero o negativos, la dimensión GH aporta cero. El detalle conserva los negativos y el líder de participación puede llegar a 50. No se borran correcciones del ledger para mantener una escala positiva.
- Una persona con 30 GH en A y B aparece una vez en el promedio de cada uno, pero conserva 30 puntos personales. Revertir un crédito de 10 reduce su neto y los promedios de sus comités actuales, sin generar otro débito para la clasificación.
- Cuando cambia el mejor comité o la población activa, pueden cambiar los puntajes normalizados de otros comités aunque sus hechos individuales no cambien. El cierre fija la foto y sus máximos, no el roster posterior.
- La implementación debe probar a través de interfaces públicas pesos, ceros, negativos, falta de dimensión, población/duplicados, multicomité/transferencia, correcciones, gamer fuera incluso con flag histórico falso, cierre concurrente y eras antiguas/nuevas. Datos sintéticos; QA y check se registran sólo después de ejecutarse. Esta ADR no acredita implementación, CI, publicación o cambio productivo.
