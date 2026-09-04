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
| [ADR-001](ADR-001-monolito-modular-serverless.md) | Monolito modular con un solo Postgres | Aceptada (enmendada por ADR-021 y ADR-032) |
| [ADR-002](ADR-002-persona-como-eje.md) | La persona es el eje; la membresía es un ciclo de vida | Aceptada |
| [ADR-003](ADR-003-etapas-por-comando.md) | Etapas explícitas por comando | Aceptada |
| [ADR-004](ADR-004-termino-como-reloj.md) | El término académico es el reloj universal | Aceptada |
| [ADR-005](ADR-005-comites-por-termino.md) | Pertenencia a comité por término | Aceptada |
| [ADR-006](ADR-006-una-sola-asistencia.md) | Una sola mecánica de asistencia | Aceptada (enmendada por ADR-024 y ADR-035) |
| [ADR-007](ADR-007-ledger-append-only.md) | Ledger append-only por término | Aceptada |
| [ADR-008](ADR-008-tableros-derivados.md) | Tableros nuevos/veteranos derivados | Aceptada |
| [ADR-009](ADR-009-score-de-comite.md) | Score de comité por participación relativa | Aceptada (enmendada por ADR-024 y ADR-035) |
| [ADR-010](ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo del roster con OTP | Aceptada (enmendada por ADR-034) |
| [ADR-011](ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | Aceptada |
| [ADR-012](ADR-012-outbox-transaccional.md) | Outbox transaccional; efectos fuera del commit | Aceptada (enmendada por ADR-021) |
| [ADR-013](ADR-013-formularios-en-la-app.md) | Todo formulario vive en la app | Aceptada |
| [ADR-014](ADR-014-privacidad-por-diseno.md) | Privacidad por diseño (Ley 1581 de 2012) | Aceptada (enmendada por ADR-030) |
| [ADR-015](ADR-015-canales.md) | Canales de comunicación | Aceptada (enmendada por ADR-023) |
| [ADR-016](ADR-016-medios-en-r2.md) | Medios en un bucket privado sin cargar la app | Reemplazada por ADR-022 |
| [ADR-017](ADR-017-admin-kit.md) | Admin kit declarativo | Aceptada |
| [ADR-018](ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS por script sobre dump | Aceptada (enmendada por ADR-034) |
| [ADR-019](ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura: Vercel Pro + Neon + R2 + Resend | Reemplazada por ADR-021 |
| [ADR-020](ADR-020-zona-horaria.md) | UTC en base, America/Bogota en presentación | Aceptada |
| [ADR-021](ADR-021-infraestructura-railway.md) | Infraestructura: Railway en el workspace Pro existente | Aceptada (enmendada por ADR-022, ADR-023 y ADR-032) |
| [ADR-022](ADR-022-medios-prefirmados.md) | Medios: subida directa y entrega por URL prefirmada | Aceptada (enmendada por ADR-034) |
| [ADR-023](ADR-023-operacion-entornos-respaldo-correo.md) | Operación: entorno de pruebas, copia externa y correo con desbordamiento | Aceptada |
| [ADR-024](ADR-024-reglas-de-participacion.md) | Reglas de participación confirmadas por la OE | Aceptada (enmendada por ADR-027, ADR-028, ADR-030 y ADR-035) |
| [ADR-025](ADR-025-permanencia-scorecard.md) | Permanencia como tablero de criterios configurable por término | Aceptada (enmendada por ADR-026 y ADR-027) |
| [ADR-026](ADR-026-permanencia-por-comite.md) | Permanencia en dos niveles: la OE y el comité | Aceptada (enmendada por ADR-027) |
| [ADR-027](ADR-027-permanencia-reglas-de-gh.md) | Permanencia: reglas confirmadas por Gestión Humana | Aceptada (enmendada por ADR-028) |
| [ADR-028](ADR-028-permanencia-consecuencias.md) | Permanencia: consecuencias, asambleas obligatorias y evaluación al cierre | Aceptada |
| [ADR-029](ADR-029-cargos-de-comite-y-roster.md) | Cargos dentro del comité y formato del roster | Aceptada (enmendada por ADR-030) |
| [ADR-030](ADR-030-perfil-de-egresado.md) | Perfil de egresado (memorial) en lugar de anonimización por plazo | Aceptada |
| [ADR-031](ADR-031-autogestion-del-miembro.md) | Autogestión del miembro: solicitudes, convocatorias, datos propios, onboarding, reconocimientos, encuestas y panel de la junta | Aceptada |
| [ADR-032](ADR-032-drizzle-y-esquema-por-modulo.md) | Drizzle como capa de datos y esquema por módulo en TypeScript | Aceptada |
| [ADR-033](ADR-033-contenido-y-medios-fase-1.md) | Contenido editable y medios del portal público (fase 1) | Aceptada |
| [ADR-034](ADR-034-personas-y-mi-oe-fase-2.md) | Personas, CRM mínimo y Mi OE (fase 2) | Aceptada (enmendada por ADR-035) |
| [ADR-035](ADR-035-participacion-y-gh-points-fase-3.md) | Participación y GH Points (fase 3) | Aceptada |

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
