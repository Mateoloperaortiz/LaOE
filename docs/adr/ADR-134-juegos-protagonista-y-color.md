# ADR-134: Juegos con reto protagonista y Color integrado a Más gamer

- Estado: Aceptada (enmendada por ADR-135)
- Fecha: 2026-10-15
- Relacionadas: ADR-007, ADR-020, ADR-041, ADR-075, ADR-078, ADR-081, ADR-082, ADR-083, ADR-086, ADR-131, ADR-133
- Enmienda: ADR-075 regla 1 (biblioteca y quinto juego); ADR-007 (origen COLOR); ADR-131 reglas 12 y 17 (participación y biblioteca); ADR-133 reglas 2 a 4 (primer resultado de Color, escala y procedencia)

## Contexto

Mateo eligió la opción A del prototipo de Juegos: **Reto protagonista**, con Color destacado y el catálogo editorial de los cuatro juegos existentes. Pidió mantener los nombres originales de los juegos y la interfaz en español. Después invocó `implement`, confirmó **Color integrado al ranking gamer hasta seis puntos diarios** y acordó los seams de pruebas: acceso desde Juegos y flujo público iniciar → recordar → ajustar → resultado.

La propuesta inicial de práctica sin puntos queda descartada para esta entrega. Color toma la idea general de recordar colores, con diseño y reglas propios; no copia código, activos o marca de Dialed. El prototipo OE usa HSL y tres rondas; no se adopta HSB ni las cinco rondas de la referencia externa.

## Decisión

1. **Juegos conserva su destino y su competencia.** `/app/juegos` destaca Color y presenta los otros cuatro juegos como catálogo editorial. Conserva selección de semestre, puntos y puesto propios, clasificación, racha, hitos y comodín, con los estados de disponibilidad y de historia de ADR-131/133. Wordle, 2048, Sudoku y Panal mantienen nombre, ruta, motores, escalas y premio diario. No se añade una clasificación de Color aparte, una familia de insignias o un nuevo aviso.
2. **Color tiene tres rondas y no paga rapidez.** En `/app/juegos/color`, cada ronda permite observar un objetivo durante **tres segundos**, lo oculta y permite reconstruirlo mediante controles HSL: tono, saturación y luminosidad. Confirmar devuelve comparación y precisión de la ronda. Después de tres respuestas se muestra promedio final y premio realmente acreditado. La fase de mezcla no tiene cronómetro competitivo; no se suma una bonificación por responder antes.
3. **El servidor conserva los hechos y calcula el resultado.** Cada partida guarda dueño, término/día, versión de reglas, objetivos, secuencia de observación y respuestas, estado, precisiones y acreditación. Iniciar no acredita; una lectura no crea partida. Sólo el gesto de observar revela el objetivo de la ronda actual, no los pendientes. Confirmar exige propiedad, orden y los tres segundos de observación según reloj del servidor; reintentar una petición no permite cambiar una respuesta ya confirmada o adelantar la secuencia. Las peticiones llevan idempotencia como los otros juegos. No se recibe un score o unos puntos declarados por el cliente para acreditar.
4. **La precisión es una regla OE versionada.** HSL CSS usa tono de 0 a 360 grados —360 equivale a 0— y saturación/luminosidad de 0 a 100; los valores deben ser finitos. Se convierte HSL a sRGB, después a **RGB lineal y OKLab**. La distancia euclídea `d` entre objetivo y respuesta produce `clamp(100 - 250 × d, 0, 100)`. Se promedian las tres precisiones sin redondear rondas; se redondea el promedio final a **un decimal**, y ese valor visible decide el premio. La precisión de cada ronda también se presenta con un decimal, sin cambiar el cálculo del promedio. La referencia técnica es la [conversión original de Oklab de Björn Ottosson](https://bottosson.github.io/posts/oklab/#converting-from-linear-srgb-to-oklab), con las matrices actualizadas de 2021-01-25; el factor 250 y las bandas son decisiones del juego OE, no una fórmula de Dialed ni una calibración clínica. Una versión nueva no revaloriza partidas anteriores.
5. **La primera partida completa válida fija de uno a seis puntos.** La escala inicial usa el promedio final de la regla 4:

   | Promedio de precisión | Puntos gamer |
   | --- | --- |
   | 0,0 a 49,9 | 1 |
   | 50,0 a 64,9 | 2 |
   | 65,0 a 79,9 | 3 |
   | 80,0 a 89,9 | 4 |
   | 90,0 a 94,9 | 5 |
   | 95,0 a 100,0 | 6 |

   Completar válidamente incluso con precisión cero consume el premio diario y da uno. Se evita que un resultado completo sin puntos permita aprender los colores con el feedback y repetir hasta conseguir seis. Las partidas posteriores se pueden guardar, pero no aumentan el premio de ese día. Abandonar, vencer o no completar las tres rondas no acredita ni crea entradas de cero. Esta regla es de **Color**: Sudoku y 2048 conservan su primera partida acreditable y sus mínimos anteriores.
6. **El día y los candados son los de la casa.** Juegan activos y honorarios con término vigente y puntos abiertos. El crédito exige iniciar y terminar el mismo día civil de Colombia y que sea hoy, como ADR-075/078. Una partida abierta por persona, idempotencia, guard del término y candado por persona impiden doble escritura; un único parcial de acreditación por persona/día limita el premio a seis también con dos pestañas. Una partida posterior conserva su resultado y no vuelve a pagar. El cierre del semestre y la acreditación comparten la barrera del término; no se reabren pagos de términos cerrados.
7. **COLOR es gamer y nunca GH.** Se añade el origen nativo `COLOR`, ligado a su partida, al ledger append-only. Su crédito positivo vivo suma puntos gamer; una reversión hereda esa procedencia del original. Una partida acreditada cuenta una participación Color por día y puede cumplir el día de racha gamer: sus tres rondas no son tres participaciones. El orden sigue puntos → participaciones → días, con puesto compartido en igualdad triple. La oferta nativa pasa de cuatro juegos/hasta 24 a **cinco juegos/hasta 30 puntos diarios**. No se agrega un cap global sobre el ledger, un recorte de LEGACY, una conversión de puntos, un booster GH o un cambio de presencia/permanencia.
8. **La historia conserva su criterio.** Las nuevas entradas Color se incorporan al semestre abierto y a sus cierres por la proyección gamer existente. No hay partidas históricas Color para reconstruir ni backfill de premios. No se recalculan fotos cerradas `POINTS`, `PARTICIPATIONS` o no disponibles. No se cambia `gamification.launch` ni se agrega otra activación o bandera del dominio para el juego.
9. **Permanece en participation.** El dominio y sus datos viven junto a los demás juegos; las acciones quedan junto a la ruta y llaman la interfaz pública del módulo con `actorContext`. Los tipos y reglas puras compartibles viven en la raíz de `participation`, para que la UI no importe `domain/`. Se añade migración aditiva para partida, procedencia y restricciones necesarias; no un módulo Color independiente, motor genérico, servicio o sistema de premios nuevo. Exportes y Mis datos conservan sólo los resultados propios permitidos y no revelan objetivos futuros, semillas o secretos.
10. **La interacción es accesible, con un límite perceptual explícito.** Sliders con nombres y valor, teclado, foco visible, instrucciones de fases y feedback textual; el promedio y el premio no dependen sólo del color. La observación no parpadea ni usa animación necesaria. El color es el contenido del desafío: esas mejoras no garantizan igual dificultad para distintas visiones cromáticas, pantallas o filtros. No se presenta axe como prueba de equivalencia perceptual ni de autoría humana. Añadir sonido obligatorio, reflejos o un modo de patrones con premio equivalente cambiaría qué se mide y queda fuera de esta decisión.

## Consecuencias y verificación

- La comparación puede ser reproducible y validada en servidor sin afirmar quién recordó el color o si usó herramientas: el objetivo debe llegar al navegador para mostrarse. La autoridad del premio, la propiedad, el orden y el tope diario sí pertenecen al sistema.
- Se conserva el diseño aprobado de HSL/3 segundos/3 rondas, pero la distancia RGB de la demo exploratoria se reemplaza por el criterio perceptual explícito de la regla 4. El promedio final y el premio comparten redondeo normativo.
- TDD en los seams aprobados: un recorrido vertical fallando antes de implementar, sin probar funciones privadas mediante espejos del algoritmo. Ejemplos independientes fijan identidad de color, precisión cero, promedio, redondeo y cortes; los comandos cubren propiedad, orden/observación, reintentos, primera partida completa, dos pestañas, medianoche, elegibilidad, cierre y separación GH. Browser cubre acceso desde Juegos, tres rondas y controles/foco/feedback en pantalla.
- El cambio se entrega con `npm run check`, E2E del alcance y revisión Standards/Spec de un SHA fijo. Esta ADR registra la decisión aceptada; no acredita pruebas, publicación, migraciones productivas o despliegue aún no realizados.

## Enmienda (2026-10-15, ADR-135)

La regla 1 incorpora el podio gráfico y el nombre visible **+ gamer** dentro de la misma identidad Reto protagonista. Agrupa puestos reales y empates sin ampliar el top 10, inventar representantes o rellenar puestos ausentes. No cambia Color, los otros juegos, los puntos o sus reglas. Ver [ADR-135](ADR-135-podio-y-nombre-gamer.md).
