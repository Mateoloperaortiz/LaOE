# ADR-078: Sudoku con la solución en el servidor

- Estado: Aceptada; en producción desde el 2026-09-19 (`4ac5920`)
- Fecha: 2026-09-19
- Enmienda: ADR-075 (regla 1: la biblioteca tiene un tercer juego; regla 12: la disponibilidad compartida vale para los tres), ADR-067 (regla 4: el Sudoku también queda fuera de los topes y no admite boosters), ADR-007 (tipo `SUDOKU`)
- Relacionadas: ADR-001, ADR-011, ADR-012, ADR-020, ADR-030, ADR-032, ADR-035, ADR-038, ADR-041, ADR-076

## Contexto

La biblioteca de juegos (ADR-075) nació con dos tarjetas: el Wordle y el 2048. Mateo pidió el 2026-09-18 sumar un Sudoku con el mismo rigor de los otros dos: el servidor decide el premio, un crédito por día civil de Colombia y techo de 6 GH Points.

El Sudoku plantea un problema distinto al del 2048. En el 2048 el puntaje es una función de la partida jugada, así que el servidor la rejuega entera y el puntaje que calcula es el único que existe. En el Sudoku no hay puntaje: hay una cuadrícula correcta o no la hay, y **cualquier programa la encuentra en milisegundos**. Una lista de jugadas no prueba nada, porque un solver la produce igual de prolija que una persona. El servidor puede garantizar que la cuadrícula enviada es la solución del tablero que él repartió; no puede garantizar que la resolvió una persona. Es el mismo riesgo que ADR-075 aceptó para un bot del 2048, con el mismo techo.

Mateo decidió, sobre alternativas planteadas: premio por dificultad y no por tiempo ni errores; tablero distinto para cada persona; partidas ilimitadas con un solo crédito por día; las cuatro ayudas (notas a lápiz, duplicados resaltados, errores marcados al instante y pistas); y, como marcar errores al instante equivale a pistas ilimitadas —basta probar del 1 al 9 en una casilla hasta que no salga marcada—, **dos modos que se eligen al empezar**, donde jugar con ayudas paga la mitad.

## Decisión

1. **Tercera tarjeta de la biblioteca.** `/app/juegos/sudoku` es el juego nuevo y `/app/juegos` le suma su tarjeta con el estado del día. La barra de Mi OE no cambia: la pestaña Juegos ya existe. GET nunca crea una partida (ADR-041 regla 4).

2. **Lo que el servidor garantiza, y lo que no.** Garantiza tres cosas: que la cuadrícula enviada es la solución del tablero que él repartió, que hay un solo crédito por día y que el techo es 6. No garantiza que lo resolvió una persona, y por eso **no hay replay ni lista de jugadas**: serían teatro. El cierre manda partida, cuadrícula de 81 dígitos y `requestId`, nada más.

3. **El servidor genera el tablero, fuera de la transacción.** Al empezar, una acción POST sortea una semilla de 64 bits, genera el tablero con el generador puro y crea `sudoku_run` con semilla, versión de reglas, dificultad, modo, dadas y solución. La generación corre antes de tomar ningún lock, como el replay del 2048. **La semilla no sale del servidor, ni hacia su dueño**: con semilla y generador se reproduce la solución, y el navegador no la necesita porque recibe las dadas. El generador vive en el dominio y el navegador nunca genera ni resuelve; lo que comparten navegador y servidor —geometría, duplicados, formatos y tabla de premios— vive en un motor aparte en la raíz del módulo, por la misma regla `componentes-sin-servidor` de ADR-075.

4. **La dificultad es la técnica más cara que el tablero exige,** no la cantidad de dadas.

    | Dificultad | Técnica que exige | Piso de dadas |
    | --- | --- | --- |
    | Fácil | Único lugar: un dígito cabe en una sola casilla de una fila, columna o caja | 36 |
    | Medio | Único candidato: a una casilla le queda un solo dígito posible | 28 |
    | Difícil | Candidatos bloqueados, par desnudo o par oculto | 24 |

    Un solver lógico aplica siempre la técnica más barata primero y vuelve a la primera tras cada avance; el nivel del tablero es el más alto que tuvo que usar. **Nunca se exige adivinar:** un tablero que ese solver no resuelve se descarta. Como las tres técnicas son deducciones correctas, que el solver llegue al final implica que la solución es única, así que en producción no corre ningún backtracking de unicidad; el conteo de soluciones queda como verificación cruzada de las pruebas. Medio y Difícil terminan con una cantidad de dadas parecida, y es por diseño: los separa la técnica, no el conteo. Los pisos evitan tableros ralos, no definen la dificultad.

5. **El orden de sorteos es parte de las reglas.** El generador es sfc32 sembrado como el del 2048 —estado `[hi, lo, hi ^ lo, 1]` y doce rondas descartadas—, solo con aritmética entera, y cada intento consume el mismo flujo en este orden: una permutación de Fisher–Yates para cada caja diagonal (0, 4 y 8), una permutación del orden de dígitos, una búsqueda en profundidad **sin sorteos** que completa la cuadrícula (casilla con menos candidatos, empate al índice menor), y una permutación de los 41 pares `{i, 80 − i}` que fija el orden de cavado con **simetría rotacional de 180°**. Se cava par por par respetando el piso, y una quita se conserva solo si el solver lógico del nivel pedido sigue resolviendo el tablero. El intento se acepta si el nivel que el solver necesitó es exactamente el pedido. Cambiar cualquiera de estos pasos es una versión de reglas nueva; la partida estampa `9x9-sfc32-v1`. El generador lleva su propia copia privada del PRNG: compartirla con el motor del 2048 acoplaría dos versiones de reglas, y un retoque pensado para el Sudoku rompería replays guardados del 2048.

6. **Topes del generador, medidos.** Hasta 200 intentos por semilla y hasta tres semillas por pedido; si las tres se agotan el comando falla con error y registro, sin un rechazo propio para algo que no ocurre. Los números salen de medir con la implementación real y quedan en la sección «Medición del generador» de esta ADR.

7. **Dos modos, fijados al crear la partida.** «Sin ayudas» trae notas a lápiz y duplicados resaltados, que son solo las reglas del juego, y paga 2, 4 o 6 GH Points según la dificultad. «Con ayudas» suma errores marcados al instante y pistas, y paga **la mitad: 1, 2 o 3**. El modo es una columna de la fila que escribe el servidor al empezar: no es un dato que el cliente declare al cerrar, y no se puede cambiar a mitad de partida. La base impide que una partida con ayudas acredite más de 3.

8. **La solución viaja solo cuando el modo la necesita.** Con ayudas, la solución va en la respuesta de la partida **a su dueño y solo mientras la partida está abierta y es de hoy**. Sin ayudas no viaja en ninguna respuesta: el navegador sabe cuándo enviar porque una cuadrícula completa, sin duplicados y que respeta las dadas es la solución, por unicidad. Esconderla no es una medida de seguridad —es derivable de las dadas—: es coherencia con el modo elegido.

9. **Pistas locales y sin tope.** Marcar errores al instante ya funciona como oráculo, así que topar las pistas sería teatro. No se envían ni se guardan contadores de pistas, de errores ni de tiempo: no son verificables y no pagan.

10. **El cierre compara, no confía.** El servidor compara la cuadrícula con la solución guardada **fuera de la transacción**, porque la solución es inmutable. Si no coincide responde «no resuelto» sin abrir transacción ni escribir auditoría, y la partida sigue abierta. Con el navegador de la casa eso solo ocurre con un envío forjado o un defecto.

11. **Idempotencia por `requestId`,** el patrón de ADR-041 regla 5 y ADR-075 regla 6. Una sola partida abierta por persona. Pedir otra con la misma dificultad y el mismo modo devuelve la abierta si es de hoy —un doble clic o dos pestañas dejan una sola—; pedirla con otra dificultad u otro modo se rechaza y la pantalla ofrece seguir o abandonar, porque devolver en silencio un Fácil a quien pidió Difícil confunde. Reenviar un `startRequestId` de una partida ya cerrada responde «terminada», no un error; reusar un `finishRequestId` en otra partida se rechaza como conflicto.

12. **Abandonar es un comando, y no cuesta nada.** El 2048 resuelve «empezar de cero» cerrando la partida con los movimientos que haya; el Sudoku no puede, porque cerrar exige la solución y con una sola abierta por persona quien eligió Difícil quedaría atrapado hasta la medianoche. Abandonar es idempotente y no lleva `requestId`. Una partida abierta de otro día se vence. El crédito exige que **el día de inicio sea el día de cierre y sea hoy** (ADR-075 regla 7).

13. **Partidas ilimitadas, un crédito por día.** El crédito va a la **primera partida resuelta del día**, con un único parcial de persona y día sobre la fila acreditada (ADR-075 regla 8). Resolver siempre alcanza el premio mínimo, así que aquí no existe la partida terminada que no consume el día: un Fácil con ayudas de 1 punto es el crédito del día. **La pantalla lo avisa antes de empezar** y muestra el premio de las seis combinaciones.

14. **Fuera de los topes de gamificación** y sin boosters, como el Wordle y el 2048 (ADR-067 regla 4). Elegibilidad y semestre: los mismos del Wordle (ADR-075 regla 12).

15. **Efectos.** `sudoku.completed` se emite **solo cuando acredita**, con persona, término, partida, día, dificultad, modo y puntos; produce una interacción de participación idempotente en la línea de tiempo del CRM. No emite push, ni asistencia, ni recompute de comité. Sin familia de insignias. Correcciones por ajuste administrativo con motivo.

16. **Accesibilidad.** El tablero es una grilla ARIA con foco itinerante: una sola parada de tabulador y flechas para moverse. El rol no es cosmético: sin él un lector de pantalla en modo exploración captura los dígitos como atajos de encabezado y nunca llegan a la página. Cada casilla anuncia fila, columna y contenido —vacía, fija, puesta, repetida o sus notas—. **Ningún estado se comunica solo por color:** las dadas van en negrita sobre fondo, y el duplicado, el error y la pista llevan cada uno su marca. El **teclado numérico en pantalla es el camino garantizado**, como los botones de dirección del 2048; el teclado físico suma flechas, dígitos, borrar, notas y deshacer. La región viva es parca: avisa duplicado, error, pista y resuelto, nunca cada dígito. Sin animación cuando el sistema pide movimiento reducido.

17. **Privacidad.** La proyección expone identificador, día, estado, dificultad, modo y puntos. Ni la semilla ni la solución aparecen en eventos, auditoría ni en la exportación de `Mis datos`; las dadas solo viajan con la partida abierta.

## Consecuencias

- Migración aditiva `0036_sudoku`: los enums `sudoku_status` y `sudoku_difficulty`, la tabla `sudoku_run`, el valor `SUDOKU` en `point_entry_kind` y la columna `sudoku_run_id` en `point_entry`. Los checks de `point_entry` comparan `kind::text` por la razón de ADR-041, ADR-067 y ADR-075; los de `sudoku_run` comparan sus enums directo porque nacen en la misma migración. `db:release` exige los cinco índices únicos nuevos.
- `POINT_ENTRY_KINDS` y los catálogos T-085 y T-667 se amplían **al final**, que es como se resuelven las etiquetas por índice.
- La base no verifica que las dadas coincidan con la solución: pediría una función. Lo cubren las pruebas del generador y las de integración.
- **Economía.** Los juegos pasan de 12 a 18 GH Points diarios posibles fuera de los topes: en el peor caso 126 por semana, contra el tope semanal de 60 de los retos. Se acepta porque cada juego conserva su techo duro de 6 por día, y queda escrito para quien revise la escala de la permanencia.
- **Lo que este diseño no impide:** resolver el tablero con un programa. Lo que sí garantiza es que el techo de ese programa es el de cualquiera: 6 GH Points, una vez al día.
- El aviso previo importa más que en el 2048: aquí toda partida resuelta acredita, así que quien resuelva primero un Fácil con ayudas ya usó el crédito del día.
- Queda fuera, por decisión: cronómetro y mejores tiempos —la duración del servidor incluye las pausas y la del navegador no es confiable; `createdAt` y `finishedAt` ya quedan en la fila, así que sumarlo no pedirá migración—, técnicas superiores (tríos, X-wing), que serían una versión de reglas nueva, tabla de máximos, rachas, cambio de modo a mitad de partida, familia de insignias y push.
- Pruebas: unitarias del motor, del reductor de juego y del generador (un tablero literal por dificultad que fija el orden de sorteos, y propiedades sobre semillas de contador: solución única, nivel correcto, simetría y piso), integración del comando (la solución no viaja sin ayudas, los seis premios, no resuelto, `requestId`, único del día, tope con ayudas, concurrencia, medianoche, cierre de puntos, elegibilidad) y E2E con revisión de accesibilidad.

## Medición del generador

`node --import tsx scripts/sudoku-bench.ts 20000 1000` sobre el generador de esta ADR, con 20.000 semillas por dificultad derivadas de un contador (dos corridas miden lo mismo), en la máquina de desarrollo (Apple M5 Max, Node 24.19):

| Dificultad | ms p50 / p99 / máx | Intentos p50 / p99 / máx | Dadas p50 / p99 / máx (mín) | Semillas agotadas | Ambiguos |
| --- | --- | --- | --- | --- | --- |
| Fácil | 0,2 / 0,2 / 1,8 | 1 / 1 / 1 | 36 / 37 / 37 (36) | 0 | 0 de 1.000 |
| Medio | 1,4 / 8,5 / 16,7 | 4 / 25 / 52 | 28 / 32 / 35 (28) | 0 | 0 de 1.000 |
| Difícil | 4,3 / 25,7 / 69,2 | 5 / 33 / 87 | 28 / 32 / 34 (24) | 0 | 0 de 1.000 |

Lo que fijan estos números:

- **200 intentos por semilla.** El peor caso medido fue 87, y en Difícil acierta alrededor de uno de cada seis intentos: agotar 200 tiene una probabilidad del orden de 10⁻¹⁶ por semilla, y el comando todavía prueba dos semillas más. El peor caso teórico de una semilla agotada ronda los 200 ms.
- **Sin worker ni cola.** El p99 de Difícil son 26 ms de CPU en esta máquina; aun con un servidor tres veces más lento queda bajo 100 ms, una sola vez por partida y fuera de la transacción.
- **Sin tope técnico de partidas por día.** Generar es más barato que rejugar un 2048 largo.
- **«Ambiguos»** es la verificación cruzada: los primeros 1.000 tableros de cada dificultad pasaron por un conteo de soluciones hasta 2 y todos tienen exactamente una, como predice la regla 4.
- En Fácil el primer intento siempre sirve, porque el cavado mismo conserva solo lo que el único lugar resuelve. En Medio y Difícil la mediana de dadas es la misma, 28: los separa la técnica.
