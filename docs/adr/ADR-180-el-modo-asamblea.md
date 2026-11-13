# ADR-180: El modo asamblea

- Estado: Aceptada (2026-11-13)
- Fecha: 2026-11-13
- Relacionadas: ADR-035, ADR-060, ADR-082, ADR-179, ADR-181

## Contexto

El plan maestro (§7 y anexo C) pide un **modo asamblea** al estilo de Slido y Kahoot: primero consultivo (preguntas con opciones que la asamblea responde desde el celular) y después con elecciones. Las asambleas ya son ocasiones de la casa (tipo `ASSEMBLY`, con su clase: ordinaria, elección de junta o segunda vuelta) y la asistencia ya se registra con el QR. Hoy se vota a mano alzada o en papel.

Una votación no es un aplauso: si es secreta, la casa no puede saber quién votó qué, ni siquiera ADMIN.

## Decisión

1. **Una consulta** es una pregunta con dos a ocho opciones dentro de una asamblea. La crea quien opera la asamblea (ADR-035), la abre y la cierra. Una sola consulta abierta a la vez por asamblea.
2. **Quién vota.** Quien tiene la asistencia aprobada en esa asamblea y puede participar. Un voto por persona y consulta, que no se cambia.
3. **Consultiva o secreta.**
   - **Consultiva:** el padrón guarda la opción de cada persona y el conteo la suma; los resultados se ven en vivo.
   - **Secreta:** la casa guarda que la persona votó (el padrón, sin la opción) y suma su voto al conteo de la opción, en la misma transacción. No hay papeletas sueltas: no queda ninguna fila con la opción de una persona, ni una hora ni un orden que permitan cruzar el padrón con el conteo. Los resultados se ven solo al cerrar. Así funcionan las elecciones de junta.
4. **Dónde.** Quien opera la consola de la asamblea maneja las consultas; los miembros presentes votan en `/app/asamblea/<asamblea>`, a donde llegan desde «Te toca» y desde la confirmación de su asistencia; la pantalla de presentación (ADR-181) muestra la consulta y sus resultados en vivo (ADR-179).
5. **Las elecciones** son consultas secretas en una asamblea de elección de junta o de segunda vuelta. Las reglas de quién puede postularse y del quórum siguen siendo las de la normativa (ADR-060); la casa cuenta los votos, no decide quién gana.

## Consecuencias

- **Migración aditiva.** Tres tablas nuevas en `participation`: `assembly_poll`, `assembly_voter` (el padrón) y `assembly_tally` (el conteo por opción).
- **Auditoría.** Crear, abrir y cerrar una consulta quedan auditados. Votar deja en la auditoría que la persona votó; en una secreta, nunca qué.
- **Pruebas.** Integración de quién vota, un voto por persona, la consulta cerrada, y de que en una secreta no hay forma de unir papeleta y persona. E2E de crear, votar desde el celular y ver los resultados.
