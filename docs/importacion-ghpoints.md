# Importación de GH Points

El CLI importa asistencias normalizadas y evidencias de permanencia. No interpreta nombres aproximados ni archivos de formularios: esa normalización se revisa antes. Los archivos personales permanecen fuera del repositorio.

## Preparación

El manifiesto `oe-ghpoints/2` contiene `batchId`, `termCode`, `targetTermId`, `allowOnLeavePoints`, `sources`, `confirmations`, `permanenceRules` y `activities`. Cada fuente tiene `key`, ruta relativa al paquete y SHA-256. Cada actividad tiene clave estable, título, tipo (`PARTIDO`, `JUEGOS`, `DECORACION`, `ASAMBLEA`), fechas inclusivas, precisión `DAY`, restricción de nuevos, ID de ocasión existente o `null`, fuente, evaluación y participantes (`recordId`, correo y fila). `sourceSheet` conserva la hoja cuando la fuente es un libro. Para `ASAMBLEA`, `assemblyKind` es obligatorio y explícito: `ORDINARY`, `BOARD_ELECTION` o `RUNOFF`.

Los puntos son 10 por partido, 20 por juegos y 30 por decoración. Una actividad de varios días da puntos una sola vez. Las fuentes se verifican antes de cualquier subida: máximo 30 MB por archivo y 200 MB por paquete; rutas y enlaces deben permanecer dentro del paquete.

Las asambleas tienen cero puntos y registran un check-in aprobado sin entrada de ledger; alimentan permanencia y el cumplimiento de asambleas. Se deduplican después de resolver las identidades. Una asamblea existente en la misma fecha requiere mapeo; una membresía pendiente retiene su asistencia. El importador no crea fichas ni asigna la clase de asamblea a partir de una fecha. Véase [ADR-063](adr/ADR-063-importacion-de-asambleas.md).

## Vista previa

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --out /ruta/plan.json
```

Lee la conexión `DATABASE_URL` disponible en el proceso. `--environment` es una etiqueta de la consulta; el ID del término del manifiesto es la guarda contra otra base. Verificar la conexión antes de ejecutar. Para consultar una instantánea privada sin conexión:

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --snapshot /ruta/consulta.json --out /ruta/plan.json
```

La vista previa no escribe en la base ni en el bucket. Separa altas, ya existentes y retenciones; incluye reglas por crear, reutilizadas o en conflicto y un hash del plan. No aplica automáticamente evaluaciones ni configura producción.

## Aplicación

Después de revisar la vista previa y autorizar la carga:

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --out /ruta/resultado.json --apply --actor-id ID_ADMIN --plan-hash HASH_REVISADO
```

Reconsulta elegibilidad y créditos dentro de la transacción. No admite `--snapshot`. Por defecto, cualquier retención impide la carga completa; `--skip-blocked` permite omitir explícitamente esas filas y conservarlas para un reintento. Conflictos de ocasiones, reglas o cierre no se pueden omitir. Los bloqueos de tablas tienen un límite de espera de cinco segundos; un conflicto revierte la transacción y requiere regenerar la vista previa.

Los IDs `gh-import:<lote>:<actividad>` y la unicidad ocasión/persona protegen el reintento. Conservar lote, actividades y registros; no renombrarlos para repetir una carga. No tocar manualmente el ledger para resolver conflictos.

La auditoría del `ImportJob` permite rastrear cada check-in hasta el objeto privado, fuente y fila. Las imágenes que documentan porcentajes también pueden ser fuentes del paquete. El archivo del manifiesto y los originales se suben al bucket con nombres por hash antes de la transacción; un rollback SQL no borra esas copias. Se conserva la notificación silenciosa de la importación histórica.

## Porcentajes

Se usan las reglas del motor de permanencia, independientes de los GH Points:

| Rubro | Cálculo |
| --- | --- |
| Integraciones generales | 2 por asistencia, máximo 10; excluye la integración exclusiva de nuevos |
| Apoyo Athletic | 5 con al menos tres partidos y evidencia de apoyo validada por GH |
| Decoración | 10 exclusivamente para nuevos, con cumplimiento validado |
| Integración de nuevos | 5 para nuevos; actividad distinta de decoración |

La referencia general también contempla asambleas, GT, GAP, GAP OE y comités de trabajo. Los rubros de nuevos reemplazan GT, comités de trabajo y GAP OE. El importador no infiere el desempeño: el manifiesto conserva si GH lo validó (`GOOD`) o si sigue pendiente (`PENDING`). Las personas en licencia pueden recibir GH Points por la importación y siguen exentas de permanencia según el régimen existente.
