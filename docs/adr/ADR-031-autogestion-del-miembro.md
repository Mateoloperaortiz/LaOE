# ADR-031: Autogestión del miembro: solicitudes, convocatorias, datos propios, onboarding, reconocimientos, encuestas y panel de la junta

- Estado: Aceptada (enmendada por ADR-036, ADR-037 y ADR-038); enmendada por ADR-150
- Fecha: 2026-09-03
- Relacionadas: ADR-003, ADR-011, ADR-013, ADR-014, ADR-025, ADR-027, ADR-030

## Contexto

Con más de 500 miembros, lo que hoy pasa por hojas de cálculo, Forms y WhatsApp (licencias, retiros, cambios de comité, inscripciones a grupos de trabajo, datos desactualizados, reconocimientos, retroalimentación) es donde GH pierde el tiempo y donde la gente se pierde. Mateo aceptó el 2026-09-03 siete mejoras que cierran esos ciclos con piezas que el sistema ya tiene: formularios, tareas, comandos, grupos de trabajo, cartelera y outbox.

## Decisión

1. **Solicitudes con flujo** (`Request`). Desde Mi OE la persona pide licencia, retiro voluntario, cambio de comité o transferencia interna. Nada cambia hasta que GH aprueba: la solicitud crea una tarea, y aprobarla ejecuta el mismo comando de dominio que haría un admin a mano (ADR-003); rechazar exige motivo. Todo queda en la línea de tiempo.
2. **Convocatorias internas** (`InternalCall`). Un formulario ligado a un grupo de trabajo (GT de macroevento, GAP, GAP OE, barra brava, tareas de nuevos) con cupo, ventana y selección por orden de llegada o manual por el líder. La inscripción aceptada crea la pertenencia al grupo y así alimenta la permanencia sin que nadie transcriba.
3. **Datos propios.** Desde Ajustes la persona edita foto, celular y correo personal, cada uno con su consentimiento por propósito; el correo institucional no se edita porque es la identidad. Cada cambio se audita y aparece en la línea de tiempo.
4. **Onboarding de nuevos** (`OnboardingProgress`). Pasos configurables por término para la primera semana: leer la normativa, conocer su comité, primera integración, activar push, decoración de oficina. Los pasos con hecho registrado se marcan solos (primer check-in de integración, push activado, normativa abierta); los demás a mano. Se muestra en el inicio de Mi OE mientras la persona sea nueva.
5. **Reconocimientos** (`Recognition`). El destacado del mes que asigna el líder en la tabla de su comité se publica como anuncio en la cartelera del comité y como insignia en el perfil de la persona; ADMIN puede crear otros reconocimientos. Se publican solo con el consentimiento de directorio de la persona.
6. **Encuesta tras la ocasión.** `Occasion.surveyFormId` opcional: al cerrar la ocasión, el outbox envía por push el formulario a quienes hicieron check-in. Respuestas anónimas por defecto, agregadas por ocasión y comité, visibles para el líder y GH.
7. **Panel de la junta** (`/admin/junta`). Indicadores derivados, sin datos personales: retención por semestre, nuevos por comité, distribución de permanencia, cuántos van a "no alcanza", asistencia a reuniones por comité, integraciones y asambleas. Lo ven los cargos de junta (permiso `BOARD`, otorgado con el cargo) y ADMIN; exportable.

## Consecuencias

- Modelos nuevos: `Request`, `InternalCall`, `OnboardingProgress`, `Recognition`; campo `surveyFormId` en `Occasion`; permiso `BOARD`.
- Las solicitudes y las convocatorias reutilizan el módulo de formularios; no hay un segundo constructor.
- Reparto en el roadmap: datos propios y onboarding en la fase 2; reconocimientos y panel de la junta en la fase 4; solicitudes y convocatorias en la fase 5; encuesta tras ocasión en la fase 6.
- Al backlog, por decisión de Mateo: votación electrónica de la junta (cuando la asistencia funcione sin fallas y con reglas de los estatutos), actas de reunión, subcomités como tipo de grupo, inventario y préstamos, álbum por edición, modo anfitrión sin señal. Los certificados de participación no se priorizaron.

## Enmienda (2026-09-04, ADR-036)

Los avisos de permanencia de la fase 4 (mitad de término, tres semanas antes, "no alcanza", asamblea obligatoria, evaluaciones pendientes) se muestran solo en Mi OE; push y correo llegan en la fase 6 sobre la misma función. El reconocimiento se publica como anuncio de la cartelera del comité (`announcement.committeeId`), que no aparece en la cartelera general, y como insignia en las tarjetas; sin consentimiento de directorio queda registrado sin publicarse. Ver [ADR-036](ADR-036-permanencia-fase-4.md).

## Enmienda (2026-09-05, ADR-037)

Las solicitudes son tres: licencia, retiro voluntario y cambio de comité; el cambio de comité se pide siempre para el semestre siguiente y es una transferencia interna (`transferredIn`, umbral 70 %), así que `COMMITTEE_CHANGE` desaparece y queda `TRANSFER`. Aprobar ejecuta el comando de `people` en la misma transacción y la respuesta llega por correo (T-205), porque quien queda en licencia o se retira pierde el acceso a Mi OE; la bienvenida al dar de alta (T-200) también sale por correo en la fase 5. Las convocatorias llevan un formulario opcional y una inscripción propia (`InternalCallEntry`) con estados aplicada, aceptada, en lista de espera y rechazada; la pertenencia al grupo se crea por outbox. Ver [ADR-037](ADR-037-admision-aliados-y-contactos-fase-5.md).

## Enmienda (2026-09-05, ADR-038)

La encuesta tras la ocasión no usa `form_submission`: el formulario de miembros aporta las preguntas (`Occasion.surveyFormId`), pero al cerrar la ocasión `participation` crea una invitación con token por asistente aprobado (`occasion_survey_invite`) y la respuesta se guarda sin persona (`occasion_survey_response`, solo ocasión y comité); los textos libres se muestran solo con 3 o más respuestas. El push T-191 sale por el bus de notificaciones. Ver [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md).

## Enmienda (2026-10-29, ADR-150)

Inventario y reservas dejan el backlog y se implementan con permisos propios, operación CML y novedades. Ver ADR-150.
