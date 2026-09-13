# Registro de decisiones de arquitectura (ADR)

Cada archivo es una decisión: qué se decidió, por qué y qué consecuencias acepta. Formato MADR reducido: estado, fecha, relacionadas, contexto, decisión, consecuencias y, cuando aplica, qué cambia frente a GHPOINTS.

## Cómo agregar una

1. Copiar la plantilla de abajo a `ADR-0NN-titulo-corto.md` con el siguiente número libre.
2. Estado `Propuesta` mientras se discute; `Aceptada` con fecha al cerrarla.
3. Si reemplaza a otra, marcar la vieja como `Reemplazada por ADR-0NN` sin borrar su texto. Si solo cambia una parte, la nueva ADR **enmienda** a la vieja: la vieja conserva su texto, cambia su estado a `Aceptada (enmendada por ADR-0NN)` y cierra con una sección "Enmienda".
4. Agregar la fila en [../04-decisiones.md](../04-decisiones.md).

## Índice

| ADR | Título | Estado |
| --- | --- | --- |
| [ADR-060](ADR-060-alineacion-con-la-normativa-2026.md) | Alineación de la casa digital con los Estatutos y el Reglamento Interno 2026 | Aceptada; en curso por tramos |
| [ADR-059](ADR-059-presupuesto-del-comite.md) | Presupuesto del comité por rubros, gastos y traslados | Propuesta; enmendada por ADR-060 |
| [ADR-058](ADR-058-direccion-del-comite-por-areas.md) | La dirección del comité por áreas: capacidades por cargo, cargos múltiples y codirección | Aceptada; promovida a producción, verificación con la dirección real pendiente |
| [ADR-057](ADR-057-vicepresidencia-de-comunicaciones-y-publicidad.md) | Vicepresidencia de Comunicaciones y Publicidad como cargo de junta | Aceptada; en producción |
| [ADR-056](ADR-056-alta-y-condicion-del-semestre-desde-la-persona-360.md) | Alta y condición del semestre desde la Persona 360 | Aceptada; verificada en producción |
| [ADR-055](ADR-055-cuatro-particiones-e2e-integracion-en-dos-runners-y-lista-documental.md) | Cuatro particiones E2E, integración en dos runners y lista documental ampliada | Aceptada; validada en remoto |
| [ADR-054](ADR-054-reutilizacion-del-ci-en-promocion-y-particiones-e2e-balanceadas.md) | Reutilización del CI en la promoción y particiones E2E balanceadas | Aceptada (enmendada por ADR-055); validada en remoto |
| [ADR-052](ADR-052-aislamiento-y-fallos-de-las-pruebas-e2e.md) | Aislamiento, calendario y fallos de las pruebas E2E | Aceptada |
| [ADR-053](ADR-053-ci-en-paralelo-y-verificacion-del-despliegue.md) | CI en paralelo, inventario obligatorio y smoke posterior | Aceptada (enmendada por ADR-054 y ADR-055) |
| [ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md) | Acceso con contraseña propia y enlace de un solo uso de la junta | Aceptada |
| [ADR-050](ADR-050-correo-transaccional-del-codigo.md) | Forma del correo transaccional del código de acceso | Aceptada (enmendada por ADR-051) |
| [ADR-049](ADR-049-navegacion-entre-mi-oe-y-administracion.md) | Navegación entre Mi OE y Administración | Aceptada |
| [ADR-048](ADR-048-autorizacion-en-el-primer-ingreso.md) | La autorización de membresía se da en el primer ingreso | Aceptada; implementada y verificada en local |
| [ADR-047](ADR-047-politica-de-datos-y-habilitacion.md) | Política de datos, su versión y el respaldo de las autorizaciones | Aceptada; borrador entregado, publicación pendiente |
| [ADR-046](ADR-046-integracion-roster-y-acceso-en-licencia.md) | Integración del roster y acceso de consulta en licencia | Implementada y verificada; carga pendiente por política (enmendada por ADR-047) |
| [ADR-001](ADR-001-monolito-modular-serverless.md) | Monolito modular con un solo Postgres | Aceptada (enmendada por ADR-021 y ADR-032) |
| [ADR-002](ADR-002-persona-como-eje.md) | La persona es el eje; la membresía es un ciclo de vida | Aceptada |
| [ADR-003](ADR-003-etapas-por-comando.md) | Etapas explícitas por comando | Aceptada (enmendada por ADR-039) |
| [ADR-004](ADR-004-termino-como-reloj.md) | El término académico es el reloj universal | Aceptada |
| [ADR-005](ADR-005-comites-por-termino.md) | Pertenencia a comité por término | Aceptada (enmendada por ADR-039) |
| [ADR-006](ADR-006-una-sola-asistencia.md) | Una sola mecánica de asistencia | Aceptada (enmendada por ADR-024 y ADR-035) |
| [ADR-007](ADR-007-ledger-append-only.md) | Ledger append-only por término | Aceptada (enmendada por ADR-041) |
| [ADR-008](ADR-008-tableros-derivados.md) | Tableros nuevos/veteranos derivados | Aceptada |
| [ADR-009](ADR-009-score-de-comite.md) | Score de comité por participación relativa | Aceptada (enmendada por ADR-024 y ADR-035) |
| [ADR-010](ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo del roster con OTP | Aceptada (enmendada por ADR-034, ADR-039, ADR-050, ADR-051) |
| [ADR-011](ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | Aceptada (enmendada por ADR-051 y ADR-058) |
| [ADR-012](ADR-012-outbox-transaccional.md) | Outbox transaccional; efectos fuera del commit | Aceptada (enmendada por ADR-021 y ADR-038, ADR-040) |
| [ADR-013](ADR-013-formularios-en-la-app.md) | Todo formulario vive en la app | Aceptada (enmendada por ADR-037) |
| [ADR-014](ADR-014-privacidad-por-diseno.md) | Privacidad por diseño (Ley 1581 de 2012) | Aceptada (enmendada por ADR-030, ADR-039, ADR-040, ADR-047 y ADR-048) |
| [ADR-015](ADR-015-canales.md) | Canales de comunicación | Aceptada (enmendada por ADR-023 y ADR-038) |
| [ADR-016](ADR-016-medios-en-r2.md) | Medios en un bucket privado sin cargar la app | Reemplazada por ADR-022 |
| [ADR-017](ADR-017-admin-kit.md) | Admin kit declarativo | Aceptada |
| [ADR-018](ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS por script sobre dump | Aceptada (enmendada por ADR-034, ADR-039, ADR-050) |
| [ADR-019](ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura: Vercel Pro + Neon + R2 + Resend | Reemplazada por ADR-021 |
| [ADR-020](ADR-020-zona-horaria.md) | UTC en base, America/Bogota en presentación | Aceptada |
| [ADR-021](ADR-021-infraestructura-railway.md) | Infraestructura: Railway en el workspace Pro existente | Aceptada (enmendada por ADR-022, ADR-023 y ADR-032, ADR-039, ADR-040) |
| [ADR-022](ADR-022-medios-prefirmados.md) | Medios: subida directa y entrega por URL prefirmada | Aceptada (enmendada por ADR-034, ADR-039, ADR-050) |
| [ADR-023](ADR-023-operacion-entornos-respaldo-correo.md) | Operación: entorno de pruebas, copia externa y correo con desbordamiento | Aceptada (enmendada por ADR-038, ADR-039, ADR-050) |
| [ADR-024](ADR-024-reglas-de-participacion.md) | Reglas de participación confirmadas por la OE | Aceptada (enmendada por ADR-027, ADR-028, ADR-030 y ADR-035) |
| [ADR-025](ADR-025-permanencia-scorecard.md) | Permanencia como tablero de criterios configurable por término | Aceptada (enmendada por ADR-026, ADR-027 y ADR-036) |
| [ADR-026](ADR-026-permanencia-por-comite.md) | Permanencia en dos niveles: la OE y el comité | Aceptada (enmendada por ADR-027 y ADR-036) |
| [ADR-027](ADR-027-permanencia-reglas-de-gh.md) | Permanencia: reglas confirmadas por Gestión Humana | Aceptada (enmendada por ADR-028) |
| [ADR-028](ADR-028-permanencia-consecuencias.md) | Permanencia: consecuencias, asambleas obligatorias y evaluación al cierre | Aceptada (enmendada por ADR-036) |
| [ADR-029](ADR-029-cargos-de-comite-y-roster.md) | Cargos dentro del comité y formato del roster | Aceptada (enmendada por ADR-030 y ADR-058) |
| [ADR-030](ADR-030-perfil-de-egresado.md) | Perfil de egresado (memorial) en lugar de anonimización por plazo | Aceptada |
| [ADR-031](ADR-031-autogestion-del-miembro.md) | Autogestión del miembro: solicitudes, convocatorias, datos propios, onboarding, reconocimientos, encuestas y panel de la junta | Aceptada (enmendada por ADR-036, ADR-037 y ADR-038) |
| [ADR-032](ADR-032-drizzle-y-esquema-por-modulo.md) | Drizzle como capa de datos y esquema por módulo en TypeScript | Aceptada |
| [ADR-033](ADR-033-contenido-y-medios-fase-1.md) | Contenido editable y medios del portal público (fase 1) | Aceptada (enmendada por ADR-036, ADR-037 y ADR-038, ADR-039) |
| [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md) | Personas, CRM mínimo y Mi OE (fase 2) | Aceptada (enmendada por ADR-035, ADR-037 y ADR-038, ADR-039, ADR-040, ADR-057, ADR-058) |
| [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md) | Participación y GH Points (fase 3) | Aceptada (enmendada por ADR-036, ADR-038, ADR-041 y ADR-058) |
| [ADR-036](ADR-036-permanencia-fase-4.md) | Permanencia (fase 4) | Aceptada (enmendada por ADR-037, ADR-038, ADR-056 y ADR-058) |
| [ADR-037](ADR-037-admision-aliados-y-contactos-fase-5.md) | Admisión, aliados y contactos (fase 5) | Aceptada (enmendada por ADR-038, ADR-039, ADR-046, ADR-050 y ADR-056) |
| [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md) | Comunicaciones y PWA (fase 6) | Aceptada (enmendada por ADR-039) |
| [ADR-039](ADR-039-arranque-limpio-fase-7.md) | Arranque limpio en Railway y retiro de GHPOINTS (fase 7) | Aceptada; operación pendiente |
| [ADR-040](ADR-040-carnet-en-billeteras-fase-8.md) | Carnet en Apple Wallet y Google Wallet (fase 8) | Aceptada; implementación y activación pendientes de verificación |
| [ADR-041](ADR-041-wordle-diario-y-cierre-de-puntos.md) | Wordle diario y cierre transaccional de puntos | Aceptada |
| [ADR-043](ADR-043-experiencia-administrativa.md) | Experiencia administrativa adaptable | Aceptada (enmendada por ADR-049) |
| [ADR-044](ADR-044-experiencia-del-portal-y-mi-oe.md) | Experiencia del portal y Mi OE | Aceptada; implementación verificada (enmendada por ADR-049) |

| [ADR-045](ADR-045-alta-individual-de-integrante-existente.md) | Alta individual de un integrante existente con historial | Aceptada; operación verificada |

## Plantilla

```markdown
# ADR-0NN: Título

- Estado: Propuesta | Aceptada | Aceptada (enmendada por ADR-0MM) | Reemplazada por ADR-0MM
- Fecha: AAAA-MM-DD
- Relacionadas: ADR-0XX

## Contexto

## Decisión

## Consecuencias

## Frente a GHPOINTS (opcional)

## Enmienda (fecha, ADR-0MM) (solo si aplica)
```
