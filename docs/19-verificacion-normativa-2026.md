# Verificación de normativa 2026 · 2026-09-14

Contraste del texto entregado por Mateo y de [18-revision-normativa-2026](18-revision-normativa-2026.md) con las reglas aceptadas en [ADR-060](adr/ADR-060-alineacion-con-la-normativa-2026.md). Las correcciones de esta revisión están en [ADR-061](adr/ADR-061-verificacion-y-correcciones-de-normativa-2026.md), dentro de la [PR #23](https://github.com/Mateoloperaortiz/LaOE/pull/23).

## Cobertura funcional

| Punto | Comportamiento comprobado | Evidencia principal |
| --- | --- | --- |
| C1 | Activo 40–59 % pasa a prueba; menos de 40 % sale. | `tests/unit/permanence-pure.test.ts` |
| C2–C3 | Nuevo/prueba bajo 80 % y transferencia bajo 70 % salen del comité; si no queda otro, de la OE, según la decisión explícita de ADR-060. | `permanence-pure.test.ts`, `tests/integration/permanence-closing.test.ts` |
| C4 | La prueba general y la de cada comité se evalúan por separado. | `permanence-pure.test.ts`, `permanence-closing.test.ts` |
| C5 | Seis cargos de comité, Publicidad retirado y traducido a Mercadeo en importación; catálogo de macroeventos separado. | Migración 0017, `tests/integration/roster.test.ts`, `macroevent-board.test.ts` |
| C6 | Etiqueta «Vicepresidencia de Comunicaciones y Mercadeo», código estable. | T-444 y pruebas de cargos |
| C7 | La expulsión aparece como propuesta del cierre o comando de ADMIN con motivo. | `permanence-closing.test.ts`, `people-membership.test.ts` |
| C8 del documento del repositorio | Logística tiene Personas y Actividades; las demás áreas respetan sus capacidades. | `tests/e2e/comite-areas.spec.ts`, `committee-direction.test.ts` |
| V1 | Solicitud con causal, nota, soporte opcional y plazo; decisión con alcance y excepción tardía reservada a ADMIN con motivo; EXCUSED no da puntos, satisface obligatorias y sale del denominador de reuniones. | `requests-excuse.test.ts`, `tests/unit/participation-pure.test.ts`, `permanence-pure.test.ts` |
| V2 | Tipos, fechas, revocación, suspensión de beneficios, inhabilidad y grave acumulada; prueba bloquea beneficios y avales. | `sanctions.test.ts`, `normativa-regressions.test.ts`, `sanction-pure.test.ts` |
| V3 | Causales EXPULSION y STUDENT_STATUS_LOST; el expulsado no reingresa. | Migración 0016, `people-membership.test.ts`, `roster.test.ts` |
| V4 | Titular/suplente activos y asistencia de mesa; representación al cierre; escalera de faltas y máximo de excusas. | `committee-assembly.test.ts`, pruebas puras de participación |
| V5 | Prueba de 6–12 meses, motivo de ampliación, reactivación tras dos meses; alertas por mesa, miembros, evento y asistencia; excepción de condición por comité. | `committee-lifecycle-pure.test.ts`, `normativa-regressions.test.ts`, `permanence-pure.test.ts`, `committee-viability-pure.ts` |
| V6 | Diez cargos por edición, titular/codirección, Persona 360 y carnet, guardas cruzadas. | `macroevent-board.test.ts`, `inhabilities.test.ts` |
| V7 | Licencia hasta un año, tarea por vencimiento, conserva condición de salida —nuevo, prueba, transferencia o activo—; capacidades del cargo en licencia. | `leave-expiry.test.ts`, `leave-access.test.ts`, `people-membership.test.ts`, `normativa-regressions.test.ts` |
| V8 | Máximo dos cargos, restricciones de General/Financiero/macroevento, junta excluyente, aval para nuevos, inhabilidad y máximo dos comités de trabajo. | `inhabilities-pure.test.ts`, `inhabilities.test.ts`, `comite-areas.spec.ts` |
| V9 | Presupuestos ordinario/extraordinario, dos aprobaciones, rubros, presolicitud mensual, disponible, sanción y aval; traslado exige aval previo y del presupuesto correcto. | `finance.test.ts`, `tests/e2e/finanzas-normativa.spec.ts`, `budget-pure.test.ts` |
| V10 | Verificación académica con fecha y responsable, sin notas ni materias. | `menores.test.ts` |
| V11 | Cuatro de cinco requisitos derivados, con impedimento por prueba/suspensión; decisión humana. | `honorary-pure.test.ts`, `menores.test.ts`, `normativa-regressions.test.ts` |
| V12 | Inducción obligatoria para nuevos; pendiente si no está programada; excusa aceptada satisface. | `permanence-pure.test.ts` |
| V13 | La elección es obligatoria si existe la ocasión, en cualquier semestre. | `participation-pure.test.ts`, `permanence-pure.test.ts` |
| V14 | Máximo seis personas de mesa por comité, exclusión de beneficios suspendidos, 16 premios y aviso de citación corta. | `menores.test.ts`, `normativa-regressions.test.ts`, `participation-pure.test.ts` |
| V15 | Año de junta derivado de ambos semestres del mismo año. | `honorary-pure.test.ts` |

Los nombres de pruebas sin carpeta corresponden a `tests/integration` o `tests/unit`, según el tipo. La comprobación incluye comandos reales, restricciones de base, interfaz y los cálculos puros; no consiste solo en buscar textos.

## Límites aceptados

- Las decisiones y datos de la OE —representantes, nombramientos, avales, descargos y verificación académica— los registra la persona autorizada. No se inventan ni se cargan fixtures en producción.
- El check-in es puntual: no acredita por sí solo el 75 % del tiempo de una asamblea. La estimación de cargos completos para honorario es la aproximación documentada en T-2315 y requiere revisión humana.
- Votación, quórum, actas, contratos, inventario y subsidios mantienen el alcance decidido en ADR-031 y ADR-060.
- La normativa publicada ya corresponde a los PDF de la reforma del 2026-05-08; esta entrega modifica el modelo y sus flujos.

## Verificación de entrega

`npm run check` pasó el 2026-09-14: 527 unitarias, 352 de integración y 11 de Python, más lint, tipos, dependencias, código no usado y build. Los tres escenarios E2E que fallaban en la PR #23 se reprodujeron y pasan corregidos. El recorrido financiero nuevo también pasa en Playwright, incluida la comprobación de accesibilidad. El CI remoto completo y el humo por SHA quedan enlazados desde la PR y el historial de Actions. La promoción sigue [15-runbook](15-runbook.md): CI completo de `main`, despliegue exitoso de staging y humo con el mismo SHA, promoción de ese SHA y verificación de producción.
