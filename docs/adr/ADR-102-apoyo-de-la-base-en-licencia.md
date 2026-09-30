# ADR-102: El apoyo de la base puede estar en licencia

- Estado: Aceptada
- Fecha: 2026-09-29
- Relacionadas: ADR-051, ADR-065, ADR-089, ADR-101
- Enmienda: ADR-101, regla 3 (Persona): el calificador, los veedores y el VAR pueden ser miembros en licencia; el líder no.

## Contexto

Al cargar el jueves en `the-games-2026`, dos personas de la hoja del GAP no aparecieron. Las dos son apoyo: una calificadora y una veedora. Están en licencia (`ON_LEAVE`), y la carga solo buscaba miembros activos u honorarios (ADR-101, regla 3).

Mateo decidió el 2026-09-29 que la licencia no importa: esas personas hacen parte del GAP y ese día participan.

## Decisión

1. **Apoyo.** El calificador, los veedores y el VAR pueden ser miembros activos, honorarios o en licencia. El apoyo no da acceso a nada (ADR-101, regla 2), así que la licencia no cambia lo que pueden hacer.
2. **Líder.** Sigue exigiendo un miembro activo u honorario. Un miembro en licencia entra a Mi OE, pero no opera (ADR-051), así que como líder no podría registrar en su base. La carga lo dice en su línea: puede ser apoyo, pero no líder.
3. **Búsqueda.** Los nombres y los correos se buscan también entre los miembros en licencia. Una persona que ya no es miembro sigue siendo un error.
4. **Pendiente: el GAP de permanencia** (ADR-101, regla 10). Mateo quiere que estas personas también queden en el GAP de Días EAFIT. Hoy un grupo de trabajo solo admite miembros activos (T-752), así que ese paso, que va después del evento, necesita definir con GH cómo se cuenta a alguien en licencia.

## Consecuencias

- **Sin migración.** Hay un texto nuevo (T-3162) y ajustes a T-3125, T-3147 y T-3151.
- **`people`** expone la lectura de miembros por estado que usa la carga.
- **Al guardar**, la carga vuelve a mirar la membresía de cada persona con la regla de su función: activo u honorario para el líder, y además en licencia para el apoyo.

## Verificación requerida

- **Unitarias:**
  - apoyo en licencia, por nombre y por correo;
  - líder en licencia, rechazado;
  - el correo de alguien que ya no es miembro, rechazado.
- **Integración:** la carga guarda el apoyo en licencia sin darle acceso y rechaza a un líder en licencia.
