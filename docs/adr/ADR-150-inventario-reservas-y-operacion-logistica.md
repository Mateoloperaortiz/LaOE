# ADR-150: Inventario, reservas y operación logística de la OE

- Estado: Aceptada; verificada localmente; revisión en staging en preparación
- Fecha: 2026-10-29
- Relacionadas: ADR-031, ADR-034, ADR-058, ADR-060, ADR-064, ADR-072, ADR-084, ADR-110, ADR-112, ADR-115, ADR-119
- Enmienda: ADR-031 (inventario pasa del backlog a implementación), ADR-034 (carnet universitario en el perfil), ADR-058 y ADR-060 (registro de cargos logísticos por la VP administrativa)

## Contexto

La VP administrativa necesita un inventario consultable por toda la OE, reservas exclusivas de las direcciones logísticas habilitadas y una sección de operación para el CML. La reserva, la entrega física y la devolución son hechos distintos. Una devolución incompleta requiere gestión humana antes de evaluar un llamado de atención.

## Decisión

1. `inventory` es dueño del catálogo, unidades y cantidades, ubicaciones y cajas, concesiones de reserva, reservas, préstamos, movimientos y novedades. Importa las interfaces públicas de `people`, `permanence` y `terms`; los módulos no se importan de vuelta. La remisión a CRM viaja por un contrato neutral y el outbox.
2. La VP se reconoce por su nombramiento `VP_ADMIN` en el término vigente y membresía operativa. Puede administrar inventario y registrar exclusivamente los cargos `LOGISTICA` de comités y mesas de macroeventos, respetando los demás cargos, titular/codirección e inhabilidades. No recibe `ADMIN` ni facultades generales sobre las personas o las mesas.
3. Reservar exige tanto un cargo logístico vivo como una concesión expresa de la VP ligada al identificador concreto de ese cargo. Incluye titular y codirección de comité del término vigente y de edición de macroevento del término vigente o futuro. Retirar un cargo corta el acceso inmediatamente; nombrarlo de nuevo requiere una concesión nueva. Revocar no cancela reservas anteriores ni impide recibir materiales pendientes.
4. Toda la OE consulta catálogo, calendario, reservante y comité o macroevento. Cada reserva tiene un solo frente. Sus intervalos son `[inicio, fin)`, almacenados en UTC y presentados en Colombia. Las cantidades se comprueban por demanda máxima simultánea bajo bloqueo, no sumando todas las reservas que toquen el rango. La entrega comprueba además existencia física. Reserva y préstamo no duplican demanda; un préstamo atrasado no se libera por vencer su fecha.
5. Opera el CML quien tenga pertenencia viva al comité de trabajo `CML` del término actual y membresía operativa. Puede preparar y confirmar salidas/entradas y registrar novedades; no administra catálogo, concesiones ni sanciones. Escanear no confirma un movimiento: se revisan unidades/cantidades y ubicación/caja antes de confirmar con clave idempotente. Las barras son Code 128 de la OE, con alternativa manual.
6. En comités recoge el director o un delegado operativo del mismo comité. En macroeventos recoge únicamente quien reservó. La salida conserva las referencias y el frente de quien reservó y quien retiró. Las devoluciones parciales mantienen pendientes; lo dañado queda fuera de servicio. Cerrar una incidencia no aumenta existencias. Declarar pérdida exige una resolución y ajuste explícitos auditados por la VP.
7. `Person.cardUid`, separado de EPIK y del QR de Mi OE, representa cuatro pares hexadecimales separados por espacios y normalizados a mayúsculas. Es único cuando existe. El perfil de un miembro exige completarlo al guardar; los miembros anteriores reciben aviso persistente, conservan el acceso a Mi OE y no retiran materiales hasta completarlo. No es una credencial ni se publica en directorio o calendario. Se incluye solo en la descarga propia y se vacía al anonimizar.
8. Las novedades conservan faltantes/daños, notas y responsable de la salida. Solo operadores, VP y ADMIN consultan sus detalles. La VP documenta gestión y remite a una tarea de ADMIN enlazada con la incidencia y Persona 360. La tarea se deduplica por incidencia incluso si fue completada; ni remitir ni completar la tarea crea una sanción. El llamado de atención se decide y registra por el flujo vigente de ADR-112.

## Consecuencias

Las cajas son ubicaciones, no kits, y los materiales son retornables en esta versión. La aprobación de reservas es directa por disponibilidad; las cancelaciones conservan motivo y auditoría. Los datos de revisión son sintéticos. La publicación inicial es una revisión de la rama en staging según ADR-151; la publicación en producción y la observación en teléfonos físicos son hitos que deben registrarse con evidencia propia.
