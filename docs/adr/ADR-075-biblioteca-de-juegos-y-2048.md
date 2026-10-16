# ADR-075: Biblioteca de juegos y 2048 con replay verificado

- Estado: Aceptada (enmendada por ADR-078, ADR-088 y ADR-122, ADR-131 y ADR-134); en producción desde el 2026-09-18 (`b3226a5`)
- Fecha: 2026-09-17
- Enmienda: ADR-041 (regla 1: el tablero deja `/app/gh-points` y sí hay ruta de juego; regla 6: el ledger gana un tipo más), ADR-067 (regla 17: el Wordle deja de estar en Resumen; regla 4: el 2048 también queda fuera de los topes), ADR-074 (regla 5: la URL del aviso), ADR-007 (tipo `GAME2048`)
- Relacionadas: ADR-001, ADR-011, ADR-012, ADR-020, ADR-030, ADR-032, ADR-035, ADR-038

## Contexto

El Wordle no vive en una ruta propia: está incrustado como una sección dentro del resumen de GH Points. No fue un descuido, fue una decisión escrita —ADR-041 regla 1: «no hay nueva ruta de juego»— y era la correcta cuando el juego era uno solo.

Con un segundo juego deja de serlo. El resumen ya es saldo, próximo reto, movimientos, asambleas y tres rankings, con subnavegación propia de gamificación (ADR-067). Meterle un segundo tablero lo convierte en un cajón de sastre, y deja al 2048 escondido debajo de una tabla de movimientos.

El 2048 además plantea un problema que el Wordle no tiene. El Wordle es del servidor de punta a punta: seis intentos, seis viajes, cada uno con su lock y su `requestId`. El 2048 se juega a 60 fps con miles de movimientos; no se puede mandar cada uno al servidor, y un puntaje que envía el navegador es regalarle GH Points a quien abra la consola.

Mateo pidió la biblioteca el 2026-09-17 y decidió, sobre alternativas planteadas: premio por umbrales de puntaje, partidas ilimitadas con un solo crédito por día, sección propia de primer nivel con pestaña en la barra, y el Wordle mudado a la biblioteca.

## Decisión

1. **Biblioteca propia.** `/app/juegos` es el índice de la sección: una tarjeta por juego con su nombre, de qué va y si ya acreditaste hoy. `/app/juegos/wordle` recibe el tablero que hoy está en `/app/gh-points`, **sin cambiarle una sola regla de ADR-041**. `/app/juegos/2048` es el juego nuevo. El resumen de GH Points conserva un enlace a la biblioteca y al Wordle del día. `Juegos` se suma al mapa `RUTAS`, al final de T-061 y a la barra de navegación como quinto destino, lo que exige un ícono más y pasar la grilla del pie de móvil a seis columnas.

2. **El servidor nunca lee un puntaje del cliente.** Al empezar, una acción POST crea `game2048_run` con una **semilla de 64 bits** que genera el servidor y la devuelve junto al identificador de la partida. El navegador juega local con el mismo motor puro que corre el servidor. Al terminar manda **partida, lista de movimientos y `requestId`**, nada más: la lista es una cadena de `U`, `D`, `L`, `R`. El servidor **rejuega la partida entera** desde semilla y movimientos, y el puntaje que calcula es el único que existe. Un puntaje inventado no tiene lista que lo sostenga; un movimiento inventado produce otro puntaje. GET nunca crea una partida (ADR-041 regla 4).

3. **Determinismo sin coma flotante.** El generador es SplitMix32 con estado de 32 bits, sembrado con los dieciséis dígitos hexadecimales de la semilla, y solo usa multiplicación entera, `xor` y desplazamientos: ninguna operación fraccionaria, así que navegador y servidor no pueden divergir por versión del motor de JavaScript ni por plataforma. Orden fijo de sorteo en cada aparición: **primero la casilla**, **después el valor** (un 4 una de cada diez veces). El tablero nace con dos apariciones por esa misma regla. Cada partida estampa la versión de reglas: retocar el motor no reescribe la historia, invalida el replay de las partidas viejas.

4. **Un movimiento que no mueve nada no es un movimiento.** El navegador no lo registra y el replay **rechaza la lista entera** si contiene uno. Así la lista es canónica y no se puede inflar para disfrazar un puntaje.

5. **Tope duro de 4.000 movimientos.** Alcanzado el tope la partida se cierra sola, se envía, y el puntaje de ese momento es el que vale; se puede empezar otra enseguida. El servidor rechaza cualquier lista más larga. El número sale de medir, no de estimar: cuarenta partidas jugadas con una heurística de tres jugadas de profundidad llegaron al 2048 en **1.355 a 1.680 movimientos**, y la única que alcanzó 4096 quedó cortada justo en un tope de 2.000, así que ese tope habría truncado partidas legítimas. 4.000 es más del doble del peor caso medido para el 2048, son cuatro kilobytes de carga útil y acotan el replay a menos de un milisegundo de CPU. El replay corre **fuera de la transacción**, antes de tomar ningún lock, porque semilla y movimientos son inmutables.

6. **Idempotencia por `requestId`, el patrón de ADR-041 regla 5.** `startRequestId`, único por persona, hace que un doble clic en «Jugar» devuelva la misma partida y la misma semilla. `finishRequestId`, único parcial por persona, hace que reenviar el cierre tras una respuesta de red perdida devuelva el estado guardado en vez de acreditar dos veces. Mismo contenido, misma respuesta; contenido distinto con el mismo `requestId`, se rechaza. Además **una sola partida abierta por persona**: pedir otra devuelve la abierta si es de hoy, y si es de otro día la vence antes de crear la nueva.

7. **Abandonar no cuesta nada; cruzar la medianoche tampoco acredita.** Una partida sin cerrar no acredita jamás: no hay nada que revalidar. El navegador guarda su lista de movimientos y al volver reconstruye el tablero desde la semilla —el motor es determinista, sale gratis— para retomarla. El crédito exige que **el día de inicio sea el día de cierre y sea hoy**: terminar a las 00:30 una partida de ayer guarda el puntaje y no da puntos, igual que ADR-041 regla 2. Si se acreditara contra el día de inicio, alguien empezaría a las 23:59 y cobraría dos veces en la misma sesión.

8. **El crédito del día es una restricción de la base, no una comprobación optimista.** Como las partidas son ilimitadas, el único no puede ir sobre persona y día en la tabla entera: va **sobre la fila que acreditó**, un único parcial de persona y día donde el crédito no es nulo. Es el patrón que la casa ya usa para el check-in y para las insignias. La base rechaza la segunda acreditación del día aunque dos pestañas cierren a la vez. El comando no llega a chocar con ella: toma la fila en exclusiva y un lock por persona, así que la segunda partida del día **se guarda igual y simplemente no acredita** —no es un error, es una partida más— y el único queda como red de seguridad. Del lado del ledger, un único sobre la partida garantiza una entrada por partida, como ya ocurre con el Wordle.

9. **Una partida que no acredita no consume el día.** El crédito se estampa en la primera partida terminada del día **cuyo puntaje alcance el primer umbral**. Una partida de treinta segundos que no llega a mil puntos no quema el crédito: acreditar cero no es acreditar, y ADR-041 regla 2 ya dice que perder no crea entrada de cero. El crédito sigue siendo uno por día y lo topa la base.

10. **Tabla de premios.** Por puntaje, no acumulativa: paga el umbral más alto alcanzado.

    | Puntaje | GH Points | A qué equivale |
    | --- | --- | --- |
    | 1.000 | 1 | un 128 en el tablero |
    | 2.500 | 2 | camino al 256 |
    | 5.000 | 3 | un 512 |
    | 9.000 | 4 | un 1024 |
    | 13.000 | 5 | el tramo largo |
    | 20.000 | 6 | el 2048 |

    Llegar a la ficha `2^n` cuesta exactamente `(n-1)·2^n` puntos de fusiones, menos lo que descuentan las apariciones de 4: 128 cuesta 768, 512 cuesta 4.096, 1024 cuesta 9.216 y 2048 cuesta 20.480. El techo es 6, el mismo del Wordle, y por eso el check del ledger es de 1 a 6. Los umbrales son constantes del motor atadas a la versión de reglas, no configuración: cambiar la escala es una enmienda, no un parámetro.

11. **Fuera de los topes de gamificación,** como el Wordle (ADR-067 regla 4). Los topes de 20 diarios y 60 semanales existen para acotar puntos **multiplicados** por boosters y campañas; un juego con techo duro de 6 por día no necesita cupo, y meterlo adentro haría que jugar te comiera el presupuesto de los retos.

12. **Elegibilidad y semestre: los mismos del Wordle.** Activos y honorarios, término vigente que contenga el día y con los puntos abiertos, cierre compartido en la escritura. La disponibilidad que muestra la biblioteca es la misma proyección para los dos juegos, así los dos dicen lo mismo cuando no se puede jugar.

13. **Efectos.** `game2048.completed` se emite **solo cuando acredita**, con persona, término, partida, día, puntaje, ficha máxima y puntos; produce una interacción de participación idempotente en la línea de tiempo del CRM. **No emite push** —ADR-074 gobierna el único aviso diario de la casa—, ni asistencia, ni recompute de comité. Correcciones por ajuste administrativo con motivo.

14. **Sin familia de insignias, por ahora.** Una familia del 2048 significa un valor más en el catálogo, tres definiciones sembradas, los hechos derivados, la conciliación histórica y el álbum: un tramo entero que no bloquea el juego y que hoy quedaría escondido detrás de la bandera de gamificación. Se descarta explícitamente. La ficha máxima se persiste precisamente para que ese tramo futuro no necesite migración.

15. **Accesibilidad sin depender del color.** Cada ficha lleva **su número**, que es el juego entero, así que nunca hay información solo en color; la paleta sale de los tokens de la marca con contraste comprobado en claro y oscuro. El tablero es una grilla con nombre accesible y celdas que anuncian «vacía» o su valor. Operable de tres formas: flechas sobre la región enfocable, **cuatro botones de dirección visibles** —el camino garantizado, como el teclado en pantalla del Wordle— y gestos táctiles con umbral y eje dominante, con el bloqueo de desplazamiento **solo sobre el tablero** para que la página siga corriendo. La región viva **no anuncia cada movimiento**, que sería un torrente: anuncia el cambio de ficha máxima, el cruce de un umbral y el fin de la partida. Sin animación cuando el sistema pide movimiento reducido.

16. **Privacidad.** La proyección expone identificador, día, estado, puntaje, ficha máxima, movimientos contados, puntos y disponibilidad. La **semilla sale una sola vez**, al crear la partida, a su dueño; no aparece en eventos, auditoría ni en la exportación de `Mis datos`. La lista de movimientos tampoco se exporta: es evidencia interna.

## Consecuencias

- Migración aditiva `0035_biblioteca_de_juegos`: el enum `game2048_status`, la tabla `game2048_run`, el valor `GAME2048` en `point_entry_kind` y la columna `game2048_run_id` en `point_entry`. Los checks nuevos comparan `kind::text` porque un literal recién agregado con `ADD VALUE` no se puede usar en la transacción del migrador y el cast a texto no es inmutable en un predicado de índice: la misma razón de ADR-041 y ADR-067. `db:release` exige los cinco índices únicos nuevos.
- `POINT_ENTRY_KINDS` y el catálogo T-085 se amplían **al final**, que es como se resuelven las etiquetas por índice (ADR-041 regla 9, ADR-057). Lo mismo T-667 y T-061.
- La URL del aviso diario (ADR-074 regla 5) pasa a `/app/juegos/wordle`. Los push ya entregados siguen abriendo el resumen, que conserva el enlace: no hace falta redirección, y el ancla `#wordle` del resumen desaparece.
- La barra de navegación de Mi OE pasa de cuatro destinos a cinco. En un teléfono de 390 px son seis columnas de unos 65 px con etiqueta de 11 px: entra, pero «GH Points» queda al borde de truncarse y hay que mirarlo en el navegador, no solo en el test.
- Dos detalles que apareció al implementar, anotados para quien lea el esquema: PostgreSQL limita a 255 el contador de repetición de una expresión regular, así que el largo de la lista se verifica con `length()` y no con `{1,4000}`; y `moveCount` lleva su propio check contra `length(moves)`, porque el contador no puede separarse de la evidencia que lo sostiene.
- La lista de movimientos es anulable desde el primer día: una partida sin acreditar puede perder su evidencia sin migración si algún día se poda. Hoy no se poda.
- **Lo que este diseño no impide**: un bot que resuelva 2048. Conociendo la semilla el navegador conoce las apariciones futuras, y eso es inevitable en cualquier juego que corra en el cliente. Lo que sí garantiza es que **el techo de ese bot es el techo de cualquiera**: 6 GH Points, una vez al día, los mismos de quien juega bien. Se acepta ese riesgo en vez de pagar el costo de un juego sincronizado por servidor.
- Queda fuera, por decisión: envío por hitos, tabla de máximos entre miembros, rachas, modo práctica sin crédito, familia de insignias y push del 2048.
- Pruebas: unitarias del motor (determinismo, fusiones, tope, movimientos inertes, tabla de premios), integración del comando (replay, `requestId`, único del día, concurrencia, medianoche, cierre de puntos, elegibilidad) y E2E de la biblioteca con revisión de accesibilidad.

## Corrección de la regla 3 (2026-09-18, después de la publicación)

La regla 3 nombra un generador que el motor no usa. No es SplitMix32 con estado de 32 bits: `src/modules/participation/game2048-engine.ts` implementa **sfc32**, con **cuatro palabras de 32 bits (128 bits de estado)**, y así lo estampa la versión de reglas `4x4-sfc32-v1`. La regla se escribió antes que el motor (`f65e652`), el motor nació con sfc32 en su primer commit (`43744da`) y al implementar se actualizó la regla 5, la del tope de movimientos, pero no la 3.

El sembrado real: `seedRng` parte la semilla en sus dos mitades de ocho dígitos hexadecimales, `hi` y `lo`, arma el estado `[hi, lo, hi ^ lo, 1]` —la cuarta palabra es el contador de sfc32— y descarta 12 rondas antes del primer sorteo. Así los 64 bits de la semilla entran enteros al estado, algo que un estado de 32 bits no podía hacer sin plegarlos. Cada aparición sortea dos enteros sin signo de 32 bits (`t >>> 0`) y los acota con el resto (`%`): la casilla contra el número de casillas libres y el valor contra diez, donde el 0 da un 4.

Tampoco es exacta la lista de operaciones: la multiplicación entera era de SplitMix32. sfc32 no multiplica; suma, hace `xor`, desplaza y rota, con cada suma truncada a 32 bits (`| 0`). La propiedad que protege la regla sigue intacta: ninguna operación es fraccionaria.

El resto de la regla 3 sigue vigente tal cual: solo enteros, primero la casilla y después el valor, un 4 una de cada diez veces, dos apariciones al nacer el tablero y la versión de reglas estampada en cada partida. Se corrige el texto y no el motor porque, por esa misma regla, cambiar el generador invalidaría el replay de todas las partidas guardadas. Y como el motor nunca tuvo otro generador, ninguna partida —tampoco las de producción, que corre `b3226a5`— se jugó con SplitMix32: no hay nada que rejugar ni migrar, y la versión de reglas no cambia.

## Enmienda (2026-09-19, ADR-078)

La regla 1 suma una tercera tarjeta: `/app/juegos/sudoku`. La barra de Mi OE no cambia. La regla 12 se amplía: la disponibilidad que muestra la biblioteca es la misma proyección para los **tres** juegos. Todo lo demás de esta ADR sigue vigente, y el motor del 2048 no se toca: el Sudoku lleva su propia copia del generador sfc32 para no atar las dos versiones de reglas. El Sudoku no hereda el replay —una lista de jugadas no prueba nada en un juego que cualquier programa resuelve—: el servidor guarda la solución y compara. Ver [ADR-078](ADR-078-sudoku-con-solucion-en-el-servidor.md).

## Enmienda (2026-09-23, ADR-088)

La biblioteca suma `/app/juegos/panal` como cuarto juego y su disponibilidad sigue los mismos criterios de elegibilidad y semestre abierto. Sus reglas, catálogo y crédito único de 6 GH Points al llegar a Genio se documentan en [ADR-088](ADR-088-panal-diario-en-espanol.md). No cambian los premios de los otros juegos.

## Enmienda (2026-10-10, ADR-122)

Regla 7: decía que el navegador reconstruye el tablero para retomarlo, y no qué pasa si lo reconstruido ya terminó, que es lo que deja un cierre que no llegó a la casa: «Seguir la partida» lo dejaba en juego sin jugada posible y sin ningún botón (DT-236, inciso c). Ahora «seguir» sobre un tablero sin jugada manda su cierre con los movimientos guardados, como lo habría hecho su última jugada. Qué acredita una partida y cuándo no cambia. Ver [ADR-122](ADR-122-reglas-de-alcance-y-correccion-del-decimo-ciclo.md) regla 15.

## Enmienda (2026-10-14, ADR-131)

Las reglas 8 a 13 conservan el replay y el puntaje interno del 2048, sus versiones, primer umbral y unicidad diaria. Esos créditos dejan de sumar GH Points; alcanzar 1.000 valida una participación gamer por día, del mismo valor competitivo que cumplir cualquier otro juego. La biblioteca muestra clasificación, racha y reconocimientos gamer separados. Las escalas internas de resultado no son puntos convertibles a GH; no hay un tope compartido de cinco. Ver [ADR-131](ADR-131-gh-points-y-mas-gamer-con-rachas-separadas.md).

## Enmienda (2026-10-15, ADR-134)

La regla 1 adopta el diseño Reto protagonista: Color destacado y catálogo editorial de los otros juegos, sin cambiar rutas o motores existentes. Se añade `/app/juegos/color` como quinto juego, con tres rondas de observación de tres segundos, mezcla HSL y premio de uno a seis puntos gamer por la primera partida completa válida del día. Conserva elegibilidad y término abierto, con reglas propias de servidor, precisión y acreditación de [ADR-134](ADR-134-juegos-protagonista-y-color.md). No cambia la primera partida acreditable ni el replay del 2048.
