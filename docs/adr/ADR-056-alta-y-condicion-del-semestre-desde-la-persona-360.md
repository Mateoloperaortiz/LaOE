# ADR-056: Alta y condición del semestre desde la Persona 360

- Estado: Aceptada; verificada en producción el 2026-09-11
- Fecha: 2026-09-11
- Enmienda: ADR-036 (regla 9: quién fija la condición de prueba), ADR-037 (regla 8: desde dónde se llega a "dar de alta"), 02-crm (acciones de la cabecera, ciclo de vida y pestaña Membresía), 03-modelo (`MembershipTerm`), 12-permanencia (umbral por condición) y 14-copy (T-832, T-2142 y T-2143)
- Relacionadas: ADR-002, ADR-003, ADR-012, ADR-025, ADR-034, ADR-043, ADR-045, ADR-046

## Contexto

Con el roster real cargado ([ADR-046](ADR-046-integracion-roster-y-acceso-en-licencia.md)) aparecieron dos situaciones que la Persona 360 no resolvía:

1. Una persona que no venía en el roster se crea a mano desde Personas y nace como prospecto sin membresía (ADR-002). El único camino a miembro es "dar de alta" (ADR-003, ADR-037 regla 8), pero la cabecera no lo ofrece: para un prospecto el menú "Más acciones" solo muestra Etiquetas y Permisos, "Cambiar estado" y el editor de comités aparecen solo con membresía, y el bloque "Comités del semestre" dice "Sin comité este semestre" sin decir qué hacer. El botón existe únicamente dentro de la pestaña Membresía, donde nadie lo busca.
2. El roster trae "Prueba" o "Período de prueba" en ESTADO, y el importador lo convierte en `ACTIVE` con `MembershipTerm.probation` en el término del archivo (ADR-046 regla 3). La ficha lo muestra en "Condición del semestre", pero ninguna acción del admin lo cambia: "Cambiar estado" solo mueve entre activo, licencia y honorario, y el comando `setProbation` de `people` solo lo ejecutan el cierre de permanencia (ADR-036 regla 9) y el importador. Corregir una condición mal cargada, o levantarla cuando GH lo decide fuera del cierre, obligaba a reimportar filas con step-up.

Además, `membership-term.changed` se emitía sin que ningún módulo lo escuchara: el poller lo descartaba con un aviso, así que ni la línea de tiempo ni el recálculo de permanencia se enteraban de un cambio de condición.

## Decisión

1. **Dar de alta desde la cabecera.** Para una persona `STUDENT` sin membresía y sin anonimizar, la cabecera de la Persona 360 muestra "Dar de alta" (T-983) como primera acción, con el mismo panel de la pestaña Membresía y el mismo comando `admitPerson`; el bloque "Comités del semestre" dice "Sin membresía: podés darla de alta." (T-1053) en lugar de "Sin comité este semestre". No cambian el comando, sus validaciones (estudiante, correo institucional, sin membresía, política activa) ni la ausencia de step-up.
2. **Condición del semestre desde la ficha.** La pestaña Membresía gana "Cambiar condición" (T-2142) sobre cualquier membresía que no esté retirada: un panel con el término (por defecto el vigente), la casilla "En periodo de prueba" (T-449) y un motivo obligatorio de 2 a 500 caracteres, que ejecuta `people.setProbationAs`. El comando sigue siendo uno solo: upsert idempotente de `MembershipTerm`, auditoría `membership-term.set` con antes y después y `decidedById` con quien lo hizo. Exige ADMIN y no exige step-up, como el resto de acciones de una persona por vez. La validación de la entrada vive en `probationInputSchema`, en `people`.
3. **El evento deja de descartarse.** `membership-term.changed` lleva ahora `reason` y tiene dos handlers: `permanence` encola el recálculo de la persona en ese término, para que Cumplimiento y la vista propia apliquen el umbral nuevo sin esperar al programado diario; `crm` lo escribe en la línea de tiempo como interacción `PERMANENCE` con los textos octavo y noveno de T-832 ("En periodo de prueba en {término}: {motivo}" y "Sin periodo de prueba en {término}: {motivo}"). Aplica también a lo que ya emitía el cierre (ADR-036 regla 9); el importador del roster sigue escribiendo la condición sin evento, porque su recálculo y su interacción salen de `person.imported`.
4. **Lo que no cambia.** La condición no es un estado de membresía: no toca `Membership.status`, no cierra sesiones ni credenciales y no altera el ciclo de vida de ADR-003. Los umbrales siguen siendo configuración (`permanence.threshold.*`) y el cierre sigue proponiendo la prueba del término siguiente a partir del snapshot.

## Consecuencias

- Un prospecto cargado a mano queda miembro activo con sus comités desde la misma pantalla donde se lo ve, y el texto del panel (T-984) recuerda que falta emitirle el enlace de acceso.
- GH corrige una condición de prueba sin reimportar; cada cambio queda auditado, en la línea de tiempo y reflejado en permanencia.
- Los e2e de Personas cubren los dos caminos; una prueba de integración cubre el comando con su validación, su idempotencia, su auditoría y los dos handlers; una unitaria, los textos de la línea de tiempo.
