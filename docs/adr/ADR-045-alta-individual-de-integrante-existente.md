# ADR-045: Alta individual de un integrante existente con historial

- Estado: Aceptada; ejecución operativa verificada
- Fecha: 2026-09-08
- Enmienda: ADR-039, punto 4 y consecuencia sobre el único acceso inicial
- Relacionadas: ADR-003, ADR-005, ADR-011, ADR-012, ADR-014, ADR-020, ADR-029 y ADR-034

## Contexto

El ADMIN autorizó expresamente incorporar a un integrante que ya pertenecía a la OE, con su historial por semestre y cargos de junta, y concederle ADMIN global. También confirmó una excepción individual mientras la política permanece pendiente. La autorización y los datos exactos se conservan en el manifiesto operativo privado; no se incorporan datos personales al repositorio.

## Decisión

1. La excepción alcanza únicamente el integrante y el historial del manifiesto aprobado en esta operación. No habilita altas generales ni importaciones de roster, no cambia `privacy.policyVersion` ni publica la política. El bootstrap del primer ADMIN mantiene su bloqueo ante otro administrador.
2. La carga privada crea persona `STUDENT/MEMBER`, membresía `ACTIVE`, historial por semestre y cargos en una transacción con auditoría atribuida al ADMIN autorizante. No registra consentimientos, no emite `person.admitted`, no envía bienvenida ni crea datos de participación. La excepción queda identificada como `membership.existing-member-exception` y referenciada a esta ADR.
3. Los comités faltantes se crean activos con logos existentes y fichas públicas DRAFT. Las fechas de los términos faltantes siguen la convención enero–junio y julio–diciembre. Las pertenencias conservan `joinedAt = null`: conocer el semestre no equivale a conocer el día. La salida al final de un semestre se representa mediante el inicio exclusivo del siguiente, en America/Bogota. Salir de un comité no termina la membresía OE.
4. Los cargos `VP_GH` se registran por término y separados de las pertenencias. El permiso ADMIN global se concede después del commit mediante el comando existente de permisos, porque su búsqueda del miembro usa una conexión distinta. No se crea una sesión de producción en nombre del integrante: iniciará sesión mediante el OTP de su propio correo.
5. Antes de escribir se simula la transacción y se revierte íntegramente. La carga compara correo, comité/término y cargo/término; conserva identificadores y rechaza conflictos. Un lock excluye dos ejecuciones de la misma carga. Repetirla no duplica datos, auditoría ni eventos; una interrupción entre el alta y el permiso se reanuda concediendo únicamente el permiso faltante.
6. El ensayo usa únicamente identidad sintética en una base local aislada y eliminada al terminar. Se verifican historial, acceso administrativo, reanudación, repetición, conflictos, procesamiento del outbox y ausencia de consentimientos, mensajes, asistencias y puntos. La evidencia real permanece fuera del repositorio con acceso privado.

## Consecuencias

La incorporación manual queda trazable y limitada a la autorización recibida. No equivale a una aceptación de la política por parte del integrante. La publicación de la política y la habilitación normal del roster siguen pendientes y se verifican por separado. No se requieren APIs públicas, cambios de esquema ni despliegue de aplicación.

## Evidencia operativa · 2026-09-08

La carga, la repetición y la ficha administrativa se verificaron en producción: 19 pertenencias, dos cargos, ADMIN global y únicamente dos comités actuales. El ensayo sintético confirmó reanudación y ausencia de duplicados; la operación produjo 33 auditorías, 14 eventos de actualización y ocho recálculos derivados procesados. No generó consentimientos, mensajes, asistencias ni puntos. El [runbook](../15-runbook.md#alta-individual-de-integrante-existente-2026-09-08) conserva el cierre sin datos personales.
