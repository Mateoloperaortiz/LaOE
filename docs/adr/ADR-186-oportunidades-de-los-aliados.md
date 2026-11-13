# ADR-186: Oportunidades de los aliados

- Estado: Propuesta
- Fecha: 2026-11-13
- Relacionadas: ADR-033, ADR-184, plan maestro del rediseño §7 (ola 5)

## Contexto

La OE tiene aliados: empresas, unidades de EAFIT y otros grupos estudiantiles, que la casa ya guarda como organizaciones en `crm`. Esos aliados ofrecen prácticas, empleos, voluntariados y eventos, y hoy eso llega por WhatsApp y se pierde. La ola 5 pide que los miembros y los egresados las encuentren en la casa.

## Decisión

1. **Qué es.** Una oportunidad es de **una organización aliada**. Tiene:
   - un tipo: práctica, empleo, voluntariado, evento u otra;
   - un título y una descripción en Markdown, sin HTML embebido (ADR-033);
   - un enlace externo, opcional;
   - una fecha de cierre, opcional;
   - un público: miembros, egresados o los dos;
   - un estado: borrador o publicada.
2. **Quién la publica.** ADMIN, desde la Operación: `/admin/oportunidades`, un recurso del kit en el espacio de Admisión, junto a las organizaciones. No lleva datos personales.
3. **Quién la ve.** En Mi OE, `/app/oportunidades` muestra las publicadas que no han cerrado: la fecha de cierre es hoy o después, o no tiene. Las que cierran antes van primero y las que no tienen fecha, al final. Un miembro ve las de miembros y las de los dos; un egresado (ADR-184), las de egresados y las de los dos.
4. **Sin postulación en la casa.** El enlace lleva al aliado y la postulación es con él. La casa no guarda quién abrió qué ni quién se postuló: no hay datos personales nuevos.
5. **Dónde vive.** La tabla `opportunity` en `crm`, junto a `organization` (migración 0071). Borrar la organización borra sus oportunidades.

## Consecuencias

- **Migración 0071.** Los enums `opportunity_kind` y `opportunity_audience` y la tabla `opportunity`.
- **Sin aviso al publicar.** Una campaña o un aviso a miembros o a egresados se hace con lo que ya existe en Comunicaciones. Un aviso automático queda para cuando se mida cuántas oportunidades llegan.
