# Revisión del soporte de asistencias parciales a asambleas

Diagnóstico previo a la implementación. La evolución del modelo se registra en [ADR-137](../adr/ADR-137-asistencia-parcial-y-excusa-separadas.md); las observaciones siguientes describen el código anterior al cambio.

Fecha: 2026-10-22. Código revisado: `3c765e27`, checkout `release/racha-color-comites`.

Esta nota registra el comportamiento observado. No agrega una decisión de dominio ni cambia la app. La regla solicitada distingue asistencia completa cuando una persona figura en dos listas de una misma asamblea y asistencia parcial cuando figura en una sola; la parcial requiere excusa.

## Resultado

La app no representa esa asistencia parcial. Guarda un único check-in por persona y ocasión, sin campos de cobertura, dos tomas de lista, duración o fracción asistida. Sus estados son `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` y `EXCUSED`; no existe `PARTIAL` ([esquema](../../src/modules/participation/schema.ts#L49), [fila y unicidad](../../src/modules/participation/schema.ts#L518)).

La consola utiliza los mismos estados y ofrece aprobar, rechazar o anular. No tiene una clasificación adicional de asistencia completa o parcial ([consola](../../src/app/admin/ocasiones/%5Bid%5D/page.tsx#L400)).

El importador histórico tampoco conserva esa distinción: cada participante solo declara `recordId`, `email` y `sourceRow`, y una asistencia nueva se inserta siempre como `APPROVED` ([contrato](../../scripts/lib/ghpoints-plan.ts#L8), [escritura](../../scripts/lib/ghpoints-db.ts#L335)).

## Qué significan los estados actuales

| Estado | Efecto observado | Consecuencia para una asistencia parcial |
| --- | --- | --- |
| `APPROVED` | Cuenta como asistencia a la asamblea y para el requisito del término | Acreditaría cumplimiento completo y bloquearía presentar excusa sobre esa ocasión |
| `PENDING` | Espera una decisión de asistencia; no cumple el requisito | No expresa la parte asistida ni significa excusa pendiente |
| `REJECTED` | Asistencia rechazada; no cumple el requisito | Tampoco conserva una clasificación parcial |
| `CANCELLED` | Asistencia anulada; no cumple el requisito | Describe una anulación, no cobertura de la asamblea |
| `EXCUSED` | Excusa válida ya aceptada: satisface el requisito, sin contar asistencia ni dar puntos | No equivale a una parcial cuya excusa falta presentar o decidir |

Fuentes: [cumplimiento de asambleas](../../src/modules/participation/domain/assembly-pure.ts#L67), [transiciones](../../src/modules/participation/domain/check-in-pure.ts#L25), [validación al presentar excusa](../../src/modules/crm/domain/requests.ts#L266), [aplicación de una excusa aprobada](../../src/modules/participation/domain/check-ins.ts#L504).

Las excusas pueden presentarse cuando la asistencia está pendiente, rechazada o anulada. Una asistencia aprobada no pasa directamente a excusada. El plazo ordinario admite una solicitud explícita de excepción tardía y la aprobación tardía exige motivo; el problema de la parcial no se resuelve prohibiendo o dando por aprobadas esas excusas ([presentación](../../src/modules/crm/domain/requests.ts#L275), [aprobación tardía](../../src/modules/crm/domain/requests.ts#L403)).

## Permanencia y representación

Permanencia carga por separado solo check-ins `APPROVED` como asistencias y `EXCUSED` como excusas. Una obligatoria excusada no se considera perdida; los otros estados no acreditan asistencia ([lecturas](../../src/modules/participation/domain/check-ins.ts#L660), [hechos](../../src/modules/permanence/domain/facts.ts#L172), [obligatorias](../../src/modules/permanence/domain/permanence-pure.ts#L796)).

La representación de comité ante una asamblea cerrada también se calcula con `APPROVED` o `EXCUSED`. Aprobar una parcial podría acreditar representación que la nueva regla no haya autorizado ([cálculo](../../src/modules/participation/domain/committee-assembly.ts#L40)).

Por eso importar juntas las asistencias completas y parciales mediante el importador vigente aprobaría todas y perdería la distinción solicitada. Registrar dos ocasiones como si fueran dos asambleas tampoco representa dos tomas de lista de una sola asamblea: el requisito cuenta ocasiones, y el manifiesto rechaza asambleas repetidas de una fecha ([cumplimiento](../../src/modules/participation/domain/assembly-pure.ts#L71), [validación del manifiesto](../../scripts/lib/ghpoints-plan.ts#L71)).

## Evidencia y alcance de la revisión

Las pruebas existentes fijan que una excusa cumple sin sumar asistencia, que una pendiente no cumple y que un aprobado no pasa a excusado ([pruebas unitarias](../../tests/unit/participation-pure.test.ts#L456), [transiciones probadas](../../tests/unit/participation-pure.test.ts#L577)). La prueba de integración muestra que aceptar la excusa elimina la obligatoria perdida ([integración](../../tests/integration/requests-excuse.test.ts#L204)). Se leyeron estas pruebas; no se ejecutaron suites ni se consultó o modificó una base de datos.

La [ADR-063](../adr/ADR-063-importacion-de-asambleas.md) documenta que la importación de asambleas fue verificada en producción el 2026-09-14. Su fila en el [índice de ADR](../adr/README.md#L88) conserva un estado anterior de implementación local; según [las reglas de dominio](../agents/domain.md#L10), controla el estado del archivo de la ADR. Esta revisión confirma el código local y la evidencia documentada, no la versión que está desplegada hoy.

Para registrar la regla solicitada hace falta extender el soporte de la app y el importador. No se eligió una solución técnica ni se cambió el modelo, la documentación normativa o los datos.
