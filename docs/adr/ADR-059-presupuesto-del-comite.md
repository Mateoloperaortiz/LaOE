# ADR-059: Presupuesto del comité por rubros, gastos y traslados

- Estado: Propuesta
- Fecha: 2026-09-12
- Enmienda: 01-arquitectura (módulo `finance`), 03-modelo (`CommitteeBudget`, `BudgetLine`, `BudgetExpense`, `BudgetTransfer`), 06-mapa (`/admin/presupuestos` y el área Finanzas del comité), glosario y 14-copy (T-2190 a T-2205)
- Relacionadas: ADR-004, ADR-011, ADR-012, ADR-014, ADR-017, ADR-032, ADR-058

## Contexto

El Financiero de cada comité lleva el presupuesto que la OE le asigna, registra los gastos y, cuando un rubro va a sobrar, traslada lo que queda a otro rubro: lo que no se ejecuta en el año se pierde para el año siguiente. Hoy eso vive fuera de la casa digital. La [ADR-058](ADR-058-direccion-del-comite-por-areas.md) le da al Financiero la capacidad `FINANCE` sobre su comité y deja el área Finanzas lista para llenarse; esta ADR define con qué.

## Decisión

1. **Módulo `finance`.** Nuevo módulo con su esquema (ADR-032): `committee_budget` (comité, `year`, estado `DRAFT`, `OPEN` o `CLOSED`, notas; único por comité y año), `budget_line` (rubro: nombre, monto asignado, orden), `budget_expense` (fecha, rubro, monto, descripción, quién lo registró) y `budget_transfer` (rubro origen, rubro destino, monto, motivo, quién lo registró). Montos en pesos colombianos con `numeric(12,2)`, presentados con `formatMoney`. Importa `people`, `terms` y `system`; nadie lo importa.
2. **Quién hace qué.** ADMIN (la junta) crea el presupuesto de cada comité y año con sus rubros, lo abre y lo cierra desde `/admin/presupuestos` (recurso del kit) y exporta el CSV sin step-up: no hay datos personales. Con la capacidad `FINANCE` del comité (el Financiero, el General o el líder técnico), el área Finanzas de `/admin/comites/[slug]` muestra el resumen por rubro (asignado, gastado, trasladado y disponible) y permite registrar un gasto y trasladar entre rubros. Solo ADMIN edita rubros y montos asignados.
3. **Reglas.** Disponible de un rubro = asignado + traslados recibidos − traslados salientes − gastos. Un gasto o un traslado no supera el disponible del rubro de origen (T-2196) y solo se registra sobre un presupuesto `OPEN` (T-2204). Nada se edita ni se borra: un error se corrige con un movimiento contrario, con motivo. Cada comando corre en `runCommand` con auditoría `budget.*`; no emite eventos de outbox ni interacciones, porque el sujeto es el comité y no una persona.
4. **Presupuesto anual.** El presupuesto se asigna por año calendario, porque así lo maneja la OE ("lo que sobra se lo quitan para el otro año"); si Finanzas confirma que es por semestre, `year` cambia por el término sin rehacer tablas.

## Consecuencias

- El Financiero ve en un solo lugar cuánto le queda por rubro y traslada a tiempo; la junta ve todos los presupuestos y exporta el consolidado.
- Preguntas para Finanzas y la junta, anotadas en [11-contenido-pendiente](../11-contenido-pendiente.md) y en [decisiones-abiertas](../decisiones-abiertas.md): rubros estándar de la OE, año calendario o por semestres, si un traslado exige aprobación de la Vicepresidencia Financiera, si se adjuntan soportes (facturas) y si hay topes por rubro. La ADR pasa a Aceptada al implementarse el tramo 8 de la [ADR-058](ADR-058-direccion-del-comite-por-areas.md) en el roadmap.
- Pruebas: unitaria del cálculo de disponible; integración de los comandos con sus guardas y auditoría; e2e `presupuesto.spec.ts` (ADMIN crea presupuesto y rubros; el Financiero registra un gasto y un traslado, ve el disponible y no puede exceder).

## Pendiente de la revisión normativa (2026-09-13)

Antes de implementar el tramo, resolver lo que el Reglamento y los Estatutos exigen y esta propuesta no recoge ([18-revision-normativa-2026.md](../18-revision-normativa-2026.md), V9):

- Tipo de presupuesto: ordinario anual, presentado al final del año anterior, y extraordinarios durante el año para actividades no previstas (Regl. art. 50.1 y 50.2); ambos aprobados por Desarrollo Estudiantil y la Vicepresidencia Financiera (par. 1) y de base cero (par. 2).
- Presolicitud del Financiero dentro del plazo para acceder a los recursos; sin ella el comité no tiene acceso ese mes (Est. art. 38.3 y par. 1).
- Aval de evento aprobado por la Presidencia antes de ejecutar, difundir o comprar (Regl. art. 35 par. 1; Est. art. 23.11 y 36.3); las reasignaciones se presentan con el aval y antes del evento (Est. art. 38 par. 2). Un gasto o un traslado debería ligarse al aval del evento que lo justifica.
- Sanción del 10 % sobre el siguiente presupuesto aprobado por no presentar el presupuesto a tiempo sin aplazamiento (Regl. art. 66).
- Compras solo a proveedores de la lista de la Universidad y alineadas con la Política de Compras Sostenibles (Regl. art. 51); cabe como dato del gasto, no como validación.

Estos puntos se suman a las preguntas ya anotadas para Finanzas y la junta; la ADR pasa a Aceptada con ellos resueltos o explícitamente aplazados.
