# ADR-008: Tableros nuevos/veteranos derivados

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-004

## Contexto

GHPOINTS separa los tableros con una bandera manual `memberType` (`NEW`/`ACTIVE`) que hay que cambiar a mano cada semestre.

## Decisión

"Nuevo" es quien tiene `Membership.firstTermId` igual al término actual; "veterano", quien entró antes. Sin bandera manual. Solo participan integrantes con `status = ACTIVE`. Los empates comparten puesto (1, 2, 2, 4) y se ordenan visualmente por nombre; el tablero de comités usa la misma regla ordenando por slug.

## Consecuencias

- Al cambiar de término, todos los nuevos pasan a veteranos sin intervención.
- `firstTermId` es obligatorio: viene del CSV de la OE (semestre de ingreso) o de la evidencia más antigua en la migración.
