# ADR-098: Poderes de The Games

- Estado: Aceptada (enmendada por ADR-106)
- Fecha: 2026-09-29
- Relacionadas: ADR-012, ADR-072, ADR-082, ADR-089, ADR-090, ADR-091, ADR-096, ADR-097
- Enmienda:
  - ADR-089, regla 6: el resultado oficial puede diferir del de la cancha, y el libro guarda el total oficial.
  - ADR-089, regla 9: cada enfrentamiento tiene su propio inicio, que marca el líder de base.
  - ADR-089, regla 10: el juez registra los poderes de su base antes de empezarla.
  - ADR-090, regla 1: la vitrina publica el resultado oficial.
  - ADR-096, regla 1: el estado del hub suma los poderes del equipo.
  - ADR-097, regla 1: el recorrido muestra el resultado y los puntos oficiales.

## Contexto

La OE agregó poderes a The Games. Son tarjetas físicas que los líderes reparten a los capitanes, y un equipo le entrega una al líder de base antes de jugar. Un poder cambia el resultado o los puntos de esa base, o la forma en que se juega.

La OE pidió que la app acompañe el proceso físico sin reemplazarlo:

- registrar el reparto y la entrega;
- validar la declaración;
- aplicar el efecto;
- dejar trazabilidad.

Todo sin un sistema de puntos paralelo y sin inventar reglas. Las reglas las confirmaron la OE y Mateo el 2026-09-28. El evento empieza el 2026-10-01.

## Decisión

1. **Cinco poderes.** El enum `competition_power` tiene cinco valores:
   - `RESULT_SWAP`: Cambio de resultados;
   - `DOUBLE_POINTS`: Multiplicador x2;
   - `CANCEL_POWER`: Cancelar poder;
   - `LATE_START`: El adversario empieza 1 min tarde;
   - `ONE_PLAYER_DOWN`: Un jugador menos.

   Los nombres en español son textos del catálogo. Las imágenes son las medallas que eligió Mateo.
2. **Reglas confirmadas, en el código.** Viven en `POWER_RULES` (versión 1) de `powers-pure.ts`:
   - **Reparto:** 5 tarjetas por equipo, 2/3 o 3/2 entre las jornadas. Los tipos se pueden repetir.
   - **Uso:** una tarjeta se usa una vez y solo en su jornada. Las del jueves no pasan al viernes.
   - **Dónde:** solo en bases `NORMAL`. Nunca en las `MACRO`, en las competencias extra, en los macro retos ni en las apuestas.
   - **Cuándo:** se declara antes de empezar la base, y cada equipo usa como máximo uno por base. Los dos equipos pueden usar uno cada uno.
   - **x2:** duplica los puntos de quien lo usa en esa base. Ganar da 2000, empatar da 1000 y perder da 0. Solo afecta a su equipo.
   - **Cambio de resultados:** invierte todo el enfrentamiento: si gana uno, gana el otro. En un empate gana quien lo usó. Si los dos lo usan, se anulan.
   - **Cancelar poder:** anula el poder del rival en esa base, y las dos tarjetas quedan usadas. Si el rival no declaró ninguno, se gasta sin efecto. Si los dos lo usan, se anulan.
   - **1 min tarde y Un jugador menos:** el rival empieza 60 segundos después del inicio de la base, o juega toda la base con una persona menos. Ninguno de los dos toca los puntos.
   - **Orden de resolución:** base `MACRO` (sin efecto), Cancelar, Cambio, x2 y, al final, los avisos. Así, si A usa Cambio y B usa x2, el Cambio fija el resultado oficial y el x2 de B se aplica sobre ese resultado. Esa es la interpretación de lo que dijo Mateo, confirmada al aprobar el plan.

   No hay reglas editables en pantalla. Cambiar una exige enmendar esta ADR, subir la versión y volver a calcular los resultados afectados con `rescoreMatchup`.
3. **Tarjeta y uso por separado.**
   - **La tarjeta** es `competition_power_grant`: equipo, poder, jornada y estado (`ASSIGNED`, `DELIVERED` o `VOIDED`). Guarda quién la entregó y cuándo, y quién la anuló, cuándo y por qué.
   - **El uso** es `competition_power_use`: la declaración de una tarjeta en una rotación. Va por rotación y equipo, no por enfrentamiento, porque editar una rotación reescribe sus enfrentamientos. Guarda quién recibió la tarjeta y cuándo, y la reversión con su motivo.
   - **Índices únicos parciales:** un uso activo por tarjeta, y uno por equipo y rotación.
   - **El efecto** de cada uso se calcula con el resultado y se guarda en el resultado, no en la tarjeta.
4. **Inicio de cada base.**
   - `competition_matchup.startedAt` lo marca el líder con «Empezar la base». Registrar el resultado también lo marca.
   - Solo se declara antes de ese inicio y con la rotación activa. Un operador también puede hacerlo con la rotación cerrada, si la base nunca empezó.
   - La cuenta regresiva del minuto sale de `startedAt` y de la hora del servidor, así que no se reinicia al recargar.
5. **Resultado de la cancha y resultado oficial.**
   - `competition_result.outcome` sigue siendo el resultado de la cancha.
   - Con poderes, el resultado también guarda `officialOutcome` y `powerDetail`: la versión de reglas, el resultado oficial, el efecto de cada uso y, por equipo, los puntos base, la bonificación y el total.
   - Las filas `MATCH` del libro llevan el total oficial. Corregir o volver a calcular usa las reversiones de siempre, y nada se acredita dos veces.
   - Las posiciones cuentan ganados, empatados y perdidos con el resultado oficial.
6. **Quién hace qué.**
   - **Operación** (ADMIN, la Dirección y OPERATOR):
     - carga el reparto pegando tres columnas (Equipo, Poder, Jornada), todo o nada;
     - marca las entregas, una a una o en bloque por jornada;
     - anula tarjetas con motivo;
     - declara en cualquier base;
     - revierte usos con motivo. Después del inicio de la base, solo ella; si ya hay resultado, el revertir lo vuelve a calcular.
   - **Líder de base** (el `JUDGE` de la base):
     - ve las tarjetas disponibles de los dos equipos;
     - registra el poder al recibir la tarjeta, y puede quitarlo antes de empezar;
     - empieza la base;
     - registra el resultado, con la vista previa del resultado oficial.
   - **Capitán:** solo consulta sus poderes en el hub. La tarjeta física es la declaración.
   - **Controles:** todo se comprueba en el servidor. El bloqueo de la fila de la competencia serializa los comandos, y los índices únicos lo respaldan.
7. **Datos públicos.** La vitrina y el recorrido muestran el resultado y los puntos oficiales con la misma forma (`version: 1`). El hub suma `powers`, sin ids.
8. **Auditoría.** Se registran, con actor, IP y motivo:
   - `competition.power.import`, `add`, `deliver`, `void`, `declare` y `revert`;
   - `competition.matchup.start`;
   - `competition.result.rescore`.
9. **Imágenes.** Las cinco medallas se generaron una sola vez con `sharp`, desde las originales de 1254 px:
   - el blanco exterior se vuelve transparente rellenando desde los bordes, con umbral 232 en los tres canales y erosión de 2 px;
   - la salida es de 256 px, en WebP de calidad 80.

   Viven en `public/the-games/poderes/`.

## Consecuencias

- **Migración `0042`, aditiva:** dos tablas y cuatro columnas que admiten nulos. Los resultados sin poderes no cambian: sin `officialOutcome`, el resultado oficial es el de la cancha.
- **Antes de la rotación 1:** el jueves, la operación tiene que cargar el reparto y marcar las entregas. Sin la entrega no se puede declarar.
- **Lo público:** la pantalla pública muestra al ganador oficial. Las apuestas atadas a un enfrentamiento se resuelven a mano, con el resultado oficial.
- **Bloqueos:**
  - No se puede editar una rotación con poderes declarados o con bases empezadas.
  - Una base con poderes declarados no puede pasar a inflable.
- **Pendiente con la OE:** dos casos se dedujeron de las reglas y quedan en [decisiones abiertas](../decisiones-abiertas.md): dos Cancelar y 1 min tarde de los dos lados.

## Verificación requerida

- **Unitarias:**
  - el resolvedor, con una tabla exhaustiva y un caso por regla;
  - los límites del reparto;
  - el lector del reparto;
  - los estados de cada tarjeta.
- **Integración:**
  - los rechazos al declarar;
  - el puntaje y las correcciones, sin crédito doble;
  - la reversión que vuelve a calcular;
  - las guardas;
  - la concurrencia;
  - los datos públicos oficiales y sin ids.
- **E2E:**
  - el líder declara, empieza la base, recarga sin perder la cuenta regresiva y registra el resultado;
  - la operación pega el reparto y lo entrega.

## Enmienda (2026-10-02, ADR-106)

Regla 4: el líder ya no empieza la base, porque la base empieza con la rotación. Los poderes se registran con la rotación en curso hasta que el líder toca «Confirmar poderes» y acepta el aviso, o hasta que registra el resultado; `startedAt` guarda ese momento, y de ahí sale la cuenta de «1 min tarde». Si algún equipo registró un poder, el líder lo confirma antes de ver el resultado. Ver [ADR-106](ADR-106-la-base-empieza-con-la-rotacion.md).
