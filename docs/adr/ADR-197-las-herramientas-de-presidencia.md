# ADR-197: Las herramientas de Presidencia

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-195](ADR-195-los-avales-de-la-junta.md) regla 1 (el aval de evento se puede devolver con comentarios); [ADR-169](ADR-169-calendario-panoramas-y-ficha-de-la-persona.md) regla 1 (la capa de la junta); la separación entre GH Points y puntos de juego (los pronósticos del Athletic se juegan con GH Points)
- Relacionadas: ADR-036, ADR-051, ADR-091, ADR-166, ADR-194, ADR-196

## Contexto

La junta 2027 ya fue elegida. La Presidencia propuso en su plan de trabajo varias herramientas que tocan la casa. El análisis está en `LaOE/informes/plan-propuestas-presidencia-2027.md`, con lo que queda fuera de la app y por qué.

Mateo decidió el 2026-11-13 cada punto. Esta ADR fija esas decisiones y los tramos para construirlas en `feat/rediseno`.

## Decisión

1. **Avales con ida y vuelta (P1).** El aval de evento se arma en la casa con los campos del formato de la Presidencia y se puede exportar a PDF.
   - La Presidencia puede devolverlo con comentarios. El comité lo corrige y lo envía otra vez como una versión nueva.
   - Devolver no decide: el aval queda abierto. Se guarda la historia de versiones y comentarios.
   - Aprobar o rechazar sigue siendo una sola vez (ADR-195 regla 1).
2. **Semáforo de riesgo reputacional.**
   - El comité declara el nivel (verde, amarillo o rojo) y lo justifica.
   - La Presidencia puede cambiarlo; el cambio queda en la auditoría.
   - En «Avales» la lista se ordena por riesgo.
   - El rojo enlaza el protocolo de crisis, publicado como documento.
3. **Directorio institucional (P2).** Las personas de la universidad con las que trabaja la OE: nombre, cargo, dependencia, funciones y qué solicitudes atiende.
   - Lo ve toda la Organización Estudiantil, en Mi OE, y lo edita la Presidencia.
   - Solo lleva datos de trabajo. La foto va solo con la autorización de esa persona.
   - Se arma sobre las organizaciones de tipo «Unidad EAFIT» del CRM.
4. **Bitácora del CAP (P3).** Cada comité del semestre tiene un acompañante del CAP.
   - La bitácora del comité guarda el plan del mes (objetivos, eventos, responsables, fechas y dificultades previstas) y una nota por reunión (avances, qué reconocer, qué mejorar y observaciones por dirección).
   - La leen la Presidencia y el CAP.
   - Las preguntas salen de plantillas que se editan sin código.
5. **Seguimiento de macroeventos y empalme (P4).** La misma bitácora, atada a la edición del macroevento: el plan mensual con las direcciones generales y las reuniones con Desarrollo Estudiantil.
   - El empalme es obligatorio. Cada dirección de la mesa lo entrega, con preguntas generales y de su dirección.
   - La edición no se cierra sin todos los empalmes.
   - La mesa de la edición siguiente lo encuentra al empezar (Regl. art. 66).
6. **Calendario de la junta (P5).**
   - Una capa «Junta» en el Calendario de la Operación, con las reuniones de la junta y las fechas clave que registra cada cargo, por colores de área.
   - Se sincroniza en los dos sentidos con un Google Calendar de la junta, por la API de Google. Lo que se crea en la casa se escribe allá al instante, y lo que se crea allá se lee cada pocos minutos.
   - Cada evento se edita donde nació: si se cambia del otro lado, gana el lado donde nació en la siguiente sincronización.
   - El aviso de cruces es el tramo A8 de ADR-195.
7. **Pronósticos del Athletic (P6).**
   - La dirección de Gestión Humana del Athletic crea los pronósticos de cada partido (resultado y otros acontecimientos) y registra el resultado.
   - Solo pronostica quien registró su asistencia a ese partido, y hasta que empiece.
   - Se juega con los GH Points que la persona tiene, con un tope por partido que fija Gestión Humana.
   - El parley combina pronósticos del mismo partido.
   - Lo que se apuesta y lo que se gana entran al libro de puntos como movimientos propios, auditados y visibles en el historial de la persona.
8. **Avisos.** Por push y el centro de avisos de Mi OE ([ADR-166](ADR-166-el-centro-de-avisos-de-mi-oe.md)), no por correo: el correo a EAFIT no es confiable ([ADR-051](ADR-051-acceso-con-contrasena-y-enlace-de-la-junta.md)).
9. **Por tramos**, en este orden, cada uno con su check, su E2E y su commit local en `feat/rediseno`:
   - **P1:** avales con ida y vuelta, semáforo y PDF.
   - **P5:** calendario de la junta y sincronización con Google, junto con A8.
   - **P3:** bitácora del CAP.
   - **P4:** seguimiento de macroeventos y empalme.
   - **P2:** directorio institucional.
   - **P6:** pronósticos del Athletic.

## Consecuencias

- **P5 necesita a Mateo.** Hay que habilitar la API de Google Calendar en el proyecto de Google que ya usa Wallet, crear o elegir el Google Calendar de la junta en una cuenta de la OE y compartirlo con la cuenta de servicio. Las credenciales van a Railway. Sin eso, P5 funciona solo dentro de la casa.
- **P6 cambia una política.** Hasta hoy los juegos dan puntos de juego y no GH Points. Con los pronósticos, alguien puede perder GH Points ganados por participar, y eso mueve niveles y ranking: por eso el tope por partido y la condición de asistir. Gestión Humana fija el tope antes de abrir el primer partido.
- **P2 publica datos de funcionarios.** Solo datos de trabajo, y la foto con autorización. Entra en la política de datos que revisa la junta.
- **El empalme obligatorio puede trabar el cierre de una edición.** Si a una dirección le falta el suyo, la Presidencia lo ve en la Mesa.
