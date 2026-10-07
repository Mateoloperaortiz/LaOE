# ADR-030: Perfil de egresado (memorial) en lugar de anonimización por plazo

- Estado: Aceptada (enmendada por ADR-114)
- Fecha: 2026-09-03
- Enmienda: ADR-014 (retención de egresados), ADR-024 (egresados) y ADR-029 (permiso del General)

## Contexto

Mateo decidió el 2026-09-03 dos cosas. Primera: cuando un miembro se gradúa pierde el correo institucional y no puede volver a entrar, así que su perfil queda como un **memorial**: la historia de su paso por la OE se conserva y se muestra, en vez de anonimizarse a los cinco años como decía ADR-014. Segunda: el permiso de líder de comité para quien figura como `General` en el roster se otorga **con confirmación** del ADMIN, no automáticamente.

## Decisión

1. **La salida es un comando con consentimientos.** "Dar de baja" (graduación, retiro voluntario o decisión de permanencia) pide el motivo y registra dos consentimientos que la OE captura antes de la salida o en ese momento: aparecer en la galería de egresados (`Consent.purpose = MEMORIAL`) y ser contactado (`COMMUNICATIONS`, con `personalEmail`).
2. **El perfil de egresado conserva la historia institucional:** nombre, foto si hay consentimiento, comités y cargos por término, cargos de junta y de GH, años en la OE, totales de puntos y reconocimientos, asambleas y ocasiones a las que asistió. Se muestra a los miembros en `/app/egresados`, una galería por año de salida, cuando hay consentimiento `MEMORIAL`; sin él, solo lo ve ADMIN.
3. **Al salir se depura lo que no es historia:** el celular se borra salvo consentimiento de contacto; las respuestas de formularios y las tareas se borran; las notas internas, los puntajes y las evaluaciones quedan solo para ADMIN como historial de GH.
4. **No hay plazo de anonimización ni job `retention`.** Quien pida la eliminación de sus datos (ADR-014) se anonimiza de inmediato: el nombre pasa a "Egresado", sin foto ni contacto, y sus pertenencias y su ledger se conservan de forma anónima para no romper la historia de comités y rankings.
5. **Reactivación.** Si un egresado vuelve a la OE (por ejemplo un posgrado con correo institucional nuevo), el comando "reactivar" (ADR-003) recupera el perfil con su historia; el correo se actualiza y las sesiones viejas no existen.
6. **Palabras.** "Memorial" es el nombre interno de Mateo; la interfaz dice "Egresados" para evitar la connotación fúnebre. Una marca "En memoria" para miembros fallecidos queda fuera de v1 y exigiría consentimiento de la familia.
7. **General con confirmación.** La importación propone el permiso de líder marcado por defecto y el ADMIN confirma; cierra la pregunta pendiente de ADR-029.

## Consecuencias

- La regla de cinco años de ADR-014 queda reemplazada; el cron `retention` desaparece de la lista de programados.
- La política de tratamiento de datos debe cubrir la galería de egresados y el contacto posterior; se revisa al recibir el texto aprobado.
- La galería de egresados es un entregable de la fase 2 y también una pieza de identidad: cada año de salida es un cartel con los nombres.
- No queda ninguna decisión abierta; lo pendiente es contenido.

## Enmienda (2026-10-07, ADR-114)

La regla 4 dice que al anonimizar las pertenencias y el ledger se conservan de forma anónima. Las asistencias también se conservan, pero una asistencia excusada guardaba en su motivo la causal y el texto que la persona escribió al pedir la excusa, que puede ser médico. [ADR-114](ADR-114-reglas-de-seguridad-privacidad-e-integridad.md) regla 4 lo precisa: al anonimizar se vacía el motivo de las asistencias excusadas de la persona y se conserva que fueron excusadas; el motivo que escribe GH al rechazar o anular una asistencia se queda. Sigue abierto (DT-100) que ese mismo texto queda en la solicitud original de `crm`, en la auditoría y, por 30 días, en el outbox.
