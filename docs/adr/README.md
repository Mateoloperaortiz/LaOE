# Registro de decisiones de arquitectura (ADR)

Cada archivo es una decisión: qué se decidió, por qué y qué consecuencias acepta. Formato MADR reducido: estado, fecha, relacionadas, contexto, decisión, consecuencias y, cuando aplica, qué cambia frente a GHPOINTS.

## Cómo agregar una

1. Copiar la plantilla de abajo a `ADR-0NN-titulo-corto.md` con el siguiente número libre.
2. Estado `Propuesta` mientras se discute; `Aceptada` con fecha al cerrarla.
3. Si reemplaza a otra, marcar la vieja como `Reemplazada por ADR-0NN` sin borrar su texto.
4. Agregar la fila en [../04-decisiones.md](../04-decisiones.md).

## Índice

| ADR | Título | Estado |
| --- | --- | --- |
| [ADR-001](ADR-001-monolito-modular-serverless.md) | Monolito modular sobre serverless con un solo Postgres | Aceptada |
| [ADR-002](ADR-002-persona-como-eje.md) | La persona es el eje; la membresía es un ciclo de vida | Aceptada |
| [ADR-003](ADR-003-etapas-por-comando.md) | Etapas explícitas por comando | Aceptada |
| [ADR-004](ADR-004-termino-como-reloj.md) | El término académico es el reloj universal | Aceptada |
| [ADR-005](ADR-005-comites-por-termino.md) | Pertenencia a comité por término | Aceptada |
| [ADR-006](ADR-006-una-sola-asistencia.md) | Una sola mecánica de asistencia | Aceptada |
| [ADR-007](ADR-007-ledger-append-only.md) | Ledger append-only por término | Aceptada |
| [ADR-008](ADR-008-tableros-derivados.md) | Tableros nuevos/veteranos derivados | Aceptada |
| [ADR-009](ADR-009-score-de-comite.md) | Score de comité por participación relativa | Aceptada |
| [ADR-010](ADR-010-identidad-por-correo-y-otp.md) | Identidad por correo del roster con OTP | Aceptada |
| [ADR-011](ADR-011-autorizacion-en-servidor.md) | Autorización en servidor | Aceptada |
| [ADR-012](ADR-012-outbox-transaccional.md) | Outbox transaccional; efectos fuera del commit | Aceptada |
| [ADR-013](ADR-013-formularios-en-la-app.md) | Todo formulario vive en la app | Aceptada |
| [ADR-014](ADR-014-privacidad-por-diseno.md) | Privacidad por diseño (Ley 1581 de 2012) | Aceptada |
| [ADR-015](ADR-015-canales.md) | Canales de comunicación | Aceptada |
| [ADR-016](ADR-016-medios-en-r2.md) | Medios en R2 sin pasar por funciones | Aceptada |
| [ADR-017](ADR-017-admin-kit.md) | Admin kit declarativo | Aceptada |
| [ADR-018](ADR-018-migracion-desde-ghpoints.md) | Migración desde GHPOINTS por script sobre dump | Aceptada |
| [ADR-019](ADR-019-infraestructura-vercel-neon-r2.md) | Infraestructura: Vercel Pro + Neon + R2 + Resend | Aceptada |
| [ADR-020](ADR-020-zona-horaria.md) | UTC en base, America/Bogota en presentación | Aceptada |

## Plantilla

```markdown
# ADR-0NN: Título

- Estado: Propuesta | Aceptada | Reemplazada por ADR-0MM
- Fecha: AAAA-MM-DD
- Relacionadas: ADR-0XX

## Contexto

## Decisión

## Consecuencias

## Frente a GHPOINTS (opcional)
```
