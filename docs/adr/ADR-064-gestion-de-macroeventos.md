# ADR-064: Gestión de macroeventos y sus equipos

- Estado: Aceptada por Mateo e implementada el 2026-09-14 (enmendada por ADR-089)
- Enmienda: ADR-060, regla 9; ADR-036, regla 6

## Decisión

Inventiva, EnFemenino y Días EAFIT se administran desde una sección Macroeventos. Se reutilizan las identidades `event`, las ediciones y los cargos `appointment`: no se crean pertenencias a comités ni tablas de permanencia adicionales.

Los seis cargos comunes son General, Logística, Finanzas, Relaciones Públicas, Mercadeo y Gestión Humana. EnFemenino agrega Agenda Académica; Días EAFIT agrega Seguridad, Carnival y The Games. El catálogo se filtra por macroevento y el dominio rechaza cargos que no correspondan. Publicidad se conserva como etiqueta histórica, sin ofrecerse en nuevos nombramientos.

La mesa conserva titulares y codirecciones por edición. Las ediciones requieren fechas reales; mientras no se conozcan, la ficha permite consultar los cargos y organizar el GT del semestre sin crear fechas ficticias. Los nombramientos conservan las restricciones existentes y ADMIN registra el resultado de la elección.

Cada macroevento tiene un GT por término, con edición opcional. Se reutilizan integrantes y evaluaciones existentes, se evita duplicar el GT al prepararlo de nuevo y se distingue cada macroevento al contar los niveles 4/6/8 de permanencia. Un cargo no acredita automáticamente buen desempeño. El estado inicial de una participación es pendiente; GH evalúa mediante las herramientas existentes y ADMIN puede hacerlo desde la ficha.

La nueva ficha administrativa reúne mesa, equipo, evaluadores y edición. Los líderes y evaluadores mantienen sus accesos existentes a grupos y evaluaciones; esta entrega no asigna personas reales ni amplía permisos por el solo nombre de un cargo. El historial de cargos continúa en Persona 360 y las evaluaciones conservan auditoría, observaciones y recálculo de permanencia.

## Verificación requerida

Catálogos 6/7/9, rechazo de especialidades cruzadas, conservación de cargos históricos, reutilización y unicidad de GT, aislamiento entre eventos y términos, cálculos sin duplicar un macroevento, autorización de acciones y flujo completo en escritorio y móvil.

## Enmienda (2026-09-23, ADR-089)

Esta entrega no ampliaba permisos por el nombre de un cargo. Desde ADR-089, el cargo The Games de la mesa de una edición de Días EAFIT sí habilita, por datos, la operación de la competencia de esa edición y solo de ella. Quitar el nombramiento quita el acceso. Los demás cargos de la mesa no cambian. Ver [ADR-089](ADR-089-the-games-competencia-por-equipos.md).
