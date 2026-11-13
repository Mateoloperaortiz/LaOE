# ADR-175: La capa social y su política de datos

- Estado: Aceptada (2026-11-13); la junta aprobó la política de datos que nombra la capa social el mismo día
- Fecha: 2026-11-13
- Enmienda: [ADR-047](ADR-047-politica-de-datos-y-habilitacion.md) (lo que la política tiene que decir antes de que salga la capa social)
- Relacionadas: ADR-014, ADR-160, ADR-164, ADR-166

## Contexto

La ola 3 del rediseño (plan maestro §8) es la capa social: aplausos entre miembros, el muro del comité, metas colectivas, ligas y recompensas por umbral. Todas muestran a una persona lo que hacen otras. El plan pide la política de datos primero, con la actividad visible como algo que cada persona elige y que aprueba la junta.

Hoy la casa ya muestra algunas cosas de una persona a otras: el directorio de miembros (sin correos), los reconocimientos que publica la dirección y los rankings de GH Points. Lo nuevo es la actividad del día a día: a quién aplaudió, en qué liga va, qué hizo esta semana.

## Decisión

1. **La actividad social es opcional y empieza apagada.** Cada persona decide en sus ajustes, junto a sus notificaciones, si su actividad se ve en la comunidad («Mostrar mi actividad en la comunidad»). Mientras no la prenda:
   - no aparece en el muro de su comité ni en las ligas;
   - los aplausos que recibe le llegan solo a ella;
   - sus números cuentan en las metas colectivas, que son sumas sin nombres.
2. **Qué se ve con la actividad prendida.** Los aplausos que da y recibe dentro de su comité, su liga de la semana con sus GH Points de esa semana, y nada más. Nunca su correo, su celular, su asistencia una por una ni su permanencia.
3. **Quién lo ve.** El muro de un comité lo ven sus miembros del semestre. Una liga la ven quienes están en ella. Nada de la capa social es público ni sale de la casa.
4. **Apagarla vuelve todo a privado.** Al apagarla, su actividad deja de verse desde ese momento, también lo que ya había salido. Al anonimizar a la persona se borra lo suyo de la capa social (ADR-014).
5. **La junta aprueba antes de la salida.** La capa social se construye en `feat/rediseno` (ADR-164), pero no sale hasta que la junta apruebe la versión de la política de datos (ADR-047) que la nombra. Es un bloqueo de salida, igual que la prueba en staging.

## Consecuencias

- **Migración aditiva.** Una columna en `person` para la preferencia, apagada por defecto.
- **Contenido pendiente.** El texto de la política lo redacta y aprueba la junta; queda en [11-contenido-pendiente](../11-contenido-pendiente.md) y como bloqueo en el roadmap.
- **Pruebas.** Integración de que nada de una persona con la actividad apagada sale en el muro ni en las ligas, y de que apagarla lo esconde todo.
