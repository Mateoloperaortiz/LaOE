# Importación de GH Points

El CLI importa asistencias normalizadas y evidencias de permanencia. No interpreta nombres aproximados ni archivos de formularios: esa normalización se revisa antes. Los archivos personales permanecen fuera del repositorio.

## Preparación

El manifiesto `oe-ghpoints/2` contiene `batchId`, `termCode`, `targetTermId`, `allowOnLeavePoints`, `sources`, `confirmations`, `permanenceRules` y `activities`. Cada fuente tiene `key`, ruta relativa al paquete y SHA-256. Cada actividad tiene clave estable, título, tipo (`PARTIDO`, `JUEGOS`, `DECORACION`, `ASAMBLEA`), fechas inclusivas, precisión `DAY`, restricción de nuevos, ID de ocasión existente o `null`, fuente, evaluación y participantes (`recordId`, correo y fila). `sourceSheet` conserva la hoja cuando la fuente es un libro. Para `ASAMBLEA`, `assemblyKind` es obligatorio y explícito: `ORDINARY`, `BOARD_ELECTION` o `RUNOFF`.

Los puntos son 10 por partido, 20 por juegos y 30 por decoración. Una actividad de varios días da puntos una sola vez. Las fuentes se verifican antes de cualquier subida: máximo 30 MB por archivo y 200 MB por paquete; rutas y enlaces deben permanecer dentro del paquete.

Las asambleas tienen cero puntos y registran un check-in aprobado sin entrada de ledger. La asistencia completa alimenta permanencia y el cumplimiento de asambleas; la parcial conserva la presencia acreditada y requiere una excusa aceptada para justificar la parte faltante. Se deduplican después de resolver las identidades. Una asamblea existente en la misma fecha requiere mapeo; una membresía pendiente retiene su asistencia. El importador no crea fichas ni asigna la clase de asamblea a partir de una fecha. Véase [ADR-063](adr/ADR-063-importacion-de-asambleas.md).

### Asambleas con dos listas de asistencia

El formato sigue siendo `oe-ghpoints/2`. Cada participante puede declarar `attendanceExtent: FULL | PARTIAL`; omitirlo conserva el significado `FULL` de los manifiestos anteriores. El importador recibe una persona conciliada por asamblea, con su correo propio. Quien registró a otra persona desde su cuenta no le presta esa identidad al manifiesto: primero se resuelve quién asistió y a qué ficha corresponde.

`attendanceEvidence` conserva las filas que respaldan esa presencia. Cada referencia contiene `list: FIRST | SECOND`, `sourceKey`, `sourceRow` y, cuando corresponde, `sourceSheet`. Las fuentes deben estar declaradas en `sources` y sus archivos se verifican por SHA-256 como el resto del paquete. Una completa que incluye estas referencias exige ambas listas, sin repetirlas; una parcial exige exactamente una. El importador deriva `attendanceList` de esa única referencia, sin pedir otro campo que pueda contradecirla. Estos campos de listas y la asistencia parcial solo se admiten en `ASAMBLEA`.

Ejemplo sintético de los participantes de una sola asamblea:

```json
{
  "participants": [
    {
      "recordId": "FULL-RECORD",
      "email": "full@example.test",
      "sourceRow": 8,
      "attendanceExtent": "FULL",
      "attendanceEvidence": [
        { "list": "FIRST", "sourceKey": "FIRST-FILE", "sourceSheet": "Sheet1", "sourceRow": 8 },
        { "list": "SECOND", "sourceKey": "SECOND-FILE", "sourceSheet": "Sheet1", "sourceRow": 12 }
      ]
    },
    {
      "recordId": "PARTIAL-RECORD",
      "email": "partial@example.test",
      "sourceRow": 9,
      "attendanceExtent": "PARTIAL",
      "attendanceEvidence": [
        { "list": "FIRST", "sourceKey": "FIRST-FILE", "sourceSheet": "Sheet1", "sourceRow": 9 }
      ]
    }
  ]
}
```

`sourceRow` sigue siendo obligatorio por compatibilidad. Cuando hay referencias de asistencia, la auditoría usa la primera como procedencia principal y conserva además todas las referencias con sus objetos privados. Una completa anterior sin estas referencias sigue siendo completa; no se inventan dos filas de origen para ella.

La importación confirma el registro de presencia y guarda su extensión: `APPROVED/FULL` acredita asistencia completa y `APPROVED/PARTIAL` acredita solo la parte observada. Una parcial emite `checkin.partial`, sin premio, puntos ni evento de aprobación completa. La solicitud y la decisión de excusa siguen su flujo propio; aceptarla conserva la extensión y la lista original. El importador no presenta ni aprueba excusas.

## Vista previa

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --out /ruta/plan.json
```

Lee la conexión `DATABASE_URL` disponible en el proceso. `--environment` es una etiqueta de la consulta; el ID del término del manifiesto es la guarda contra otra base. Verificar la conexión antes de ejecutar. Para consultar una instantánea privada sin conexión:

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --snapshot /ruta/consulta.json --out /ruta/plan.json
```

La vista previa no escribe en la base ni en el bucket. Separa altas, ya existentes y retenciones; `fullToAdd` y `partialToAdd` muestran cuántas asistencias completas y parciales se agregarían. Incluye reglas por crear, reutilizadas o en conflicto y un hash del plan. No aplica automáticamente evaluaciones ni configura producción.

## Aplicación

Después de revisar la vista previa y autorizar la carga:

```sh
npm run ghpoints:import -- --manifest /ruta/paquete/manifiesto_importacion.json --environment production --out /ruta/resultado.json --apply --actor-id ID_ADMIN --plan-hash HASH_REVISADO
```

Reconsulta elegibilidad y créditos dentro de la transacción. No admite `--snapshot`. Por defecto, cualquier retención impide la carga completa; `--skip-blocked` permite omitir explícitamente esas filas y conservarlas para un reintento. Conflictos de ocasiones, reglas o cierre no se pueden omitir. Los bloqueos de tablas tienen un límite de espera de cinco segundos; un conflicto revierte la transacción y requiere regenerar la vista previa.

Los IDs `gh-import:<lote>:<actividad>` y la unicidad ocasión/persona protegen el reintento. Conservar lote, actividades y registros; no renombrarlos para repetir una carga. No tocar manualmente el ledger para resolver conflictos.

El reintento compara también la extensión y la lista acreditada. Una diferencia queda retenida como `EXISTING_ATTENDANCE_CONFLICT` y exige conciliación: la carga no convierte una parcial en completa ni cambia la lista que la respalda. Una asistencia que ya quedó excusada y conserva la misma extensión/lista se reconoce como existente, sin modificar el motivo, la decisión o sus fechas. Una excusa anterior sin evidencia de presencia (`attendanceExtent: null`) exige conciliación antes de atribuirle una asistencia nueva. Las consultas privadas anteriores que no incluyen los campos nuevos conservan el significado histórico de aprobada completa y excusada sin presencia acreditada.

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
