# ADR-052: Aislamiento, calendario y fallos de las pruebas E2E

- Estado: Aceptada (enmendada por ADR-077 y ADR-116)
- Fecha: 2026-09-11
- Relacionadas: ADR-004, ADR-012, ADR-020, ADR-023, ADR-032

## Contexto

La auditoría encontró una corrida verde con 15 trabajos fallidos: la limpieza había eliminado sus personas sintéticas y el helper ignoraba el contador `failed`. Varios lectores dependían de escrituras de otros casos; las pruebas seleccionaban `2026-2` mientras el servidor resolvía el término con el reloj actual. El usuario autorizó resolver los tres problemas.

## Decisión

1. `npm run test:e2e` crea una base PostgreSQL local `casa_e2e_<id aleatorio>`, aplica migraciones y seed y la elimina al terminar, también ante un fallo. La URL suministrada aporta conexión y credenciales; su base no se modifica. La configuración de Playwright exige pasar por este launcher. La creación y las restauraciones rechazan destinos remotos y nombres ajenos al espacio reservado.
2. Servidor y pruebas reciben el mismo entorno: correo de consola, jobs manuales, OTP y credenciales Apple sintéticos y proveedores externos de push y Google apagados. El bucket debe ser local. Se mantiene un worker y se desactivan los reintentos automáticos, también en CI.
3. Después de preparar las dos sesiones, se drena el outbox y se guarda una copia de las tablas públicas. Una fixture automática restaura esa copia antes de cada escenario y antes de sus `beforeEach`, incluso al filtrar un único caso. Los recorridos que representan una secuencia real viven en un caso con `test.step`; los lectores independientes preparan sus propios documentos, evaluaciones o mensajes.
4. La restauración es una transacción en una conexión exclusiva de la base desechable. Usa `SET LOCAL session_replication_role = replica` para restaurar referencias circulares ya válidas en la copia. Excluye columnas calculadas, que PostgreSQL vuelve a generar. Requiere el superusuario del PostgreSQL local de pruebas; no cambia la conexión del servidor.
5. Los hooks drenan antes de borrar entidades. La fixture cierra los contextos del navegador y vuelve a drenar al terminar. Cualquier `failed > 0` o fila con `lastError`, aunque esté esperando reintento o en dead letter, hace fallar el caso. Se procesan los eventos encadenados hasta agotar los disponibles, con límite de 5000 trabajos. Los eventos programados todavía no vencidos no se adelantan.
6. Un calendario sintético central calcula el semestre actual y el anterior en Bogotá con mitades completas del año. Solo en la base E2E se adaptan los términos históricos del seed, conservando sus IDs y relaciones. Selectores, CSV y fechas de actividades o solicitudes usan ese calendario. Las versiones históricas de documentos y los términos cerrados de 2019 conservan sus fechas.
7. Las fronteras de calendario se verifican en unitarias y con PostgreSQL invocando `getCurrentTerm()` con su reloj por defecto controlado desde Vitest. Incluyen cambios de año y semestre en 2027 y el día bisiesto de 2028. Esto no equivale a ejecutar todo Chromium con un reloj futuro.

## Consecuencias

Cada caso parte del mismo estado autenticado, sin heredar permisos, licencias, trabajos o contenido de otro. Un efecto fallido deja de ser compatible con un resultado E2E verde. La base se prepara automáticamente, con un pequeño costo de restauración por escenario.

La suite admite ejecución secuencial; no admite `--workers` mayor que uno. El almacenamiento S3 sigue siendo el emulador local compartido y no se vacía indiscriminadamente. No cambian el calendario de la OE, el seed de desarrollo, la política de reintentos del outbox en producción ni sus handlers.

## Enmienda (2026-09-18, ADR-077)

La regla 2 exigía un bucket local y no decía nada de su CORS, que solo admitía el origen de `APP_URL`: en un `E2E_PORT` distinto de 3000 el navegador no podía subir archivos. El lanzador ahora suma `http://localhost:<E2E_PORT>` al CORS del bucket local antes de crear la base, sin quitar los orígenes de otras sesiones, sin reescribir uno que ya esté y bajo un candado consultivo de PostgreSQL. El bucket sigue compartido y sin vaciarse. Ver [ADR-077](ADR-077-el-lanzador-e2e-suma-su-origen-al-cors-del-bucket.md).

## Enmienda (2026-10-08, ADR-116)

La regla 4 no decía cómo se vaciaban las tablas antes de volver a llenarlas: se truncaban, y cada `TRUNCATE` le crea un archivo nuevo a la tabla, a su TOAST y a cada índice. Con una restauración por escenario eran unos 168.000 por corrida, y la suite completa en local se quedaba sin tiempo en la preparación cuando Postgres cerraba el checkpoint que los recogía (DT-111). La restauración ahora borra las filas y las vuelve a insertar, en la misma transacción y bajo el candado que tomaba `TRUNCATE`, y devuelve a su inicio las secuencias que son de una columna. Lo demás de la regla 4 sigue igual. El costo de restauración por escenario baja de unos 380 ms a unos 55 ms. Ver [ADR-116](ADR-116-reglas-de-correccion-privacidad-y-permisos.md) regla 21.
