# ADR-133: Más gamer por puntos de desempeño

- Estado: Aceptada (enmendada por ADR-134 y ADR-135)
- Fecha: 2026-10-15
- Relacionadas: ADR-007, ADR-020, ADR-041, ADR-067, ADR-075, ADR-078, ADR-088, ADR-092, ADR-131
- Enmienda: ADR-131 reglas 12–14 y 17 (unidad y orden de la competencia gamer; presentación y conservación de cierres)

## Contexto

ADR-131 separó GH Points de los videojuegos y dio el mismo valor competitivo a cumplir cualquier juego: una participación por juego y día. Los motores conservaron sus premios originales, que distinguen intentos de Wordle, dificultad y ayudas de Sudoku, score verificado de 2048 y avance de Panal; esos importes quedaron en `point_entry.points`, fuera del saldo GH.

Mateo pidió que ese desempeño vuelva a pesar en Más gamer y eligió expresamente **la primera partida válida del día, como hoy**. No eligió la mejor partida posterior ni una mejora del premio ya acreditado. La clasificación puede usar los puntos existentes sin modificar motores, escalas, límites de partidas o historial del ledger.

## Decisión

1. **Más gamer se ordena por puntos gamer.** Es una competencia semestral propia de Juegos, separada de GH Points. Se suma el importe de las entradas positivas de videojuegos sin una reversión que las anule, con la misma clasificación de origen de ADR-131. No entran asistencias, retos, trivias, misiones, bonos presenciales, boosters ni ajustes GH cuyo motivo mencione un juego. Los puntos no se convierten entre competencias.
2. **Se conserva el premio de la primera partida acreditable del día.** Wordle acredita al ganar. Sudoku acredita el primer tablero resuelto, según dificultad y modo elegidos al empezar. El 2048 acredita la primera partida terminada que alcanza el primer umbral; una anterior por debajo de él no consume el premio. Las partidas posteriores siguen guardándose y pueden mejorar récords, pero no cambian los puntos competitivos de ese día. Panal conserva sus avances acumulativos en la misma partida diaria.
3. **No se cambian las escalas existentes.**

   | Juego | Desempeño | Puntos gamer |
   | --- | --- | --- |
   | Wordle | Victoria en intento 1 / 2 / 3 / 4 / 5 / 6 | 6 / 5 / 4 / 3 / 2 / 1 |
   | Sudoku sin ayudas | Fácil / Medio / Difícil | 2 / 4 / 6 |
   | Sudoku con ayudas | Fácil / Medio / Difícil | 1 / 2 / 3 |
   | 2048 | Score mínimo 1.000 / 2.500 / 5.000 / 9.000 / 13.000 / 20.000 | 1 / 2 / 3 / 4 / 5 / 6; solo el umbral más alto |
   | Panal desde 2026-09-24 | Cinco palabras / diez / Genio | +1 / +2 / +3; acumulado 1 / 3 / 6 |
   | Panal anterior | Genio | 6, su premio completo original |

   Son premios competitivos, no el score bruto de fusiones del 2048 ni la suma de letras del Panal. Perder, abandonar, vencer o no alcanzar premio no añade puntos. Los escritores nativos conservan hasta seis por juego y día, hasta 24 diarios entre los cuatro; no se agrega un límite global que recorte historia. No hay un tope compartido de cinco ni consumo de los topes de retos de GH. Ningún juego admite boosters GH por esta decisión.
4. **El ledger es la fuente de los importes.** Se suman exactamente los `points` positivos vivos de WORDLE, GAME2048, SUDOKU, PANAL y LEGACY identificable mediante la normalización ya compartida con GH. Panal suma sus checkpoints reales; no se deduplican importes por juego/día, no se toma su máximo y no se vuelve a ejecutar una partida para calcular otro premio. El legado conserva su importe original: los límites actuales de los escritores nativos no se aplican retroactivamente como un recorte de filas históricas. Por ejemplo, dos entradas LEGACY identificadas de 1 y 6 suman 7 puntos aunque su hecho deduplicado siga siendo una participación; no se edita, fusiona o limita el historial para ajustarlo a una regla nativa posterior. Una reversión excluye su crédito de origen, sin contarla dos veces ni alterar la entrada original.
5. **Las participaciones y los días siguen siendo hechos distintos.** Los créditos se deduplican por persona/juego/día únicamente para contar participaciones, días activos, racha e hitos. Los varios premios del Panal no crean varias participaciones y un premio de seis no crea seis días. El comodín semanal no entrega puntos ni días activos; los hitos 3/7/30 no otorgan GH Points o boosters GH.
6. **El desempate conserva dedicación.** Puntos gamer descendentes; después participaciones válidas descendentes; después días activos descendentes. Si las tres cantidades coinciden, puesto compartido de competición. El nombre solo ordena la presentación. Se mantiene la audiencia de miembros activos y honorarios y la privacidad del top 10 más el puesto propio.
7. **El semestre abierto reconoce sus puntos existentes completos.** La lectura no empieza a contar desde el release o desde `gamification.launch`. No se escriben premios retroactivos: se presenta el importe que ya conserva el historial. No cambian saldos, niveles ni premios GH, permanencia, asistencias o bono presencial. La implementación no necesita un nuevo corte, bandera, comando de activación o tabla de premios.
8. **Los cierres conservan la métrica con la que se resolvieron.** Un cierre nuevo guarda puntos gamer, participaciones, días y posiciones junto con la métrica explícita `POINTS`. Una foto anterior de ADR-131 con clasificación gamer conserva sus puestos por participaciones, se identifica como `PARTICIPATIONS` y no inventa puntos congelados: el valor es nulo. Un cierre anterior al reconocimiento gamer que ya no disponía de esa foto sigue declarando clasificación gamer no disponible; la ausencia de datos no se convierte en una clasificación por participaciones. No se recalcula un ranking cerrado desde los hechos de hoy ni se etiqueta su puesto antiguo como si fuese por puntos.
9. **Todas las superficies usan la misma proyección.** Juegos muestra puntos gamer como resultado principal y explica las escalas y la primera acreditación diaria. El perfil, el ranking, el cierre y sus exportes conservan la métrica del semestre; no sustituyen un punto desconocido por cero. La presentación de un juego distingue su score, su premio acreditado y la clasificación gamer. Las rachas y sus recordatorios conservan sus criterios, preferencia y activación anteriores.

## Consecuencias y verificación

- La ponderación ya está acreditada; cambia el ranking y su presentación. El ledger permanece append-only y la separación de GH no se revierte. El código no reconstruye resultados posteriores sin crédito ni escribe diferencias para mejorarlos.
- Resolver primero un Sudoku fácil con ayudas deja un punto ese día aunque después se resuelva uno difícil sin ayudas. Acreditar primero un 2048 de 1.000 deja un punto aunque después se alcancen 20.000. La interfaz debe explicar esa consecuencia sin prometer una mejora del premio diario.
- El cierre sigue tomando la barrera exclusiva del término antes de capturar proyecciones; los escritores de juegos mantienen sus candados y validación de servidor. Extender la foto con puntos y métrica no reabre premios ni exige cambiar tablas.
- Las pruebas fijan los importes existentes, primera acreditación e intentos posteriores, reintentos y medianoche, suma de checkpoints, LEGACY sin recortes nuevos, reversión, separación GH, los tres criterios de orden y puestos compartidos, y las tres generaciones de cierre. La UI y el exporte deben coincidir con la proyección, con datos sintéticos.
- `npm run check`, E2E del alcance y revisión Standards/Spec sobre un SHA fijo siguen siendo condiciones de entrega. Esta ADR no acredita despliegue o activación productiva.

## Enmienda (2026-10-15, ADR-134)

Las reglas 2 a 4 suman `COLOR` al origen gamer y su escala nueva. La primera partida **completa válida** de Color da de uno a seis puntos según el promedio perceptual de sus tres rondas; incluso un promedio cero da uno y consume el premio diario, sin reintentar un resultado completo de cero puntos hasta mejorarlo. Esta excepción no cambia el primer umbral acreditable de 2048, Sudoku, Wordle o los avances de Panal. La oferta máxima de escritores nativos pasa de 24 a 30 puntos diarios entre cinco juegos; no se aplica un cap nuevo a LEGACY ni se altera el ledger o las fotos anteriores. La suma, los desempates y las tres generaciones de cierre siguen intactos. Ver [ADR-134](ADR-134-juegos-protagonista-y-color.md).

## Enmienda (2026-10-15, ADR-135)

La regla 9 presenta ahora la competencia como **+ gamer**, con podio por puestos reales compartidos dentro del top 10 visible. No modifica la suma, los tres desempates, métricas o fotos de esta ADR; el nombre Más gamer del texto original se conserva como historia. Ver [ADR-135](ADR-135-podio-y-nombre-gamer.md).
