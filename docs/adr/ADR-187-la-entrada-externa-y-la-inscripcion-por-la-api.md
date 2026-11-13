# ADR-187: La entrada externa y la inscripción por la API

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: ADR-090 (regla 7: la primera escritura pública de la API v1)
- Relacionadas: ADR-013, ADR-037, ADR-085 (reglas 6 a 8 y 12, P2 y P3), ADR-183, ADR-184

## Contexto

ADR-085 decide que la casa es el único backend y que DÍAS, Inventiva, Enfemenino y Subsidios-OE son frontends delgados. Su P2 pide cinco capacidades en la casa, en este orden:

1. la API y su cliente;
2. los temas;
3. los bloques;
4. la entrada externa;
5. la autenticación entre aplicaciones.

Su regla 8 dice que un asistente de afuera recibe una entrada con su propio código, que lee un operador con sesión. P3 es el piloto con DÍAS, y le faltan la fecha de la edición y el alcance mínimo.

Hoy la API v1 solo lee (ADR-090, la vitrina de The Games) y deja las escrituras para su propia ADR. Las inscripciones a una edición entran por el formulario propio (`/f/<slug>`, ADR-037), que crea la persona, registra el consentimiento e inscribe con la acción `editionId`. Quien se inscribe no se lleva nada para la puerta.

## Decisión

1. **Cada inscripción lleva su entrada.** Cuando una respuesta inscribe a una edición, la casa genera un código al azar de 24 caracteres y guarda solo su hash (`edition_registration.ticket_hash`). El código vive en el enlace `/entrada/<código>`, que la persona recibe una sola vez:
   - en el formulario propio, la confirmación muestra «Tu entrada»;
   - por la API, la respuesta trae `ticketUrl`.

   La página de la entrada muestra la edición, el nombre, la fecha, el lugar y un QR con el mismo enlace, y no se indexa.
2. **La puerta.** Quien opera la edición, ADMIN por ahora, abre `/admin/eventos/<evento>/ediciones/<edición>/entrada` con su sesión y escanea con el mismo lector del modo anfitrión. La primera lectura marca la llegada (`checked_in_at` y quién) y dice «Adelante». La segunda dice a qué hora entró. Una entrada de otra edición, o de una inscripción cancelada, no pasa. La página cuenta cuántos inscritos ya entraron.
3. **La inscripción por la API.** `POST /api/v1/ediciones/<id>/inscripciones` es la primera escritura pública de la API v1:
   - recibe JSON con nombre, apellido, correo, respuestas, consentimiento y el campo trampa;
   - pasa por el mismo `submitFormAs` del formulario propio: tope por IP, consentimiento, política de datos pendiente, una respuesta por correo y cupo;
   - no lee la sesión;
   - responde 201 con `ticketUrl`, o el código del error con su estado HTTP (404, 409, 422, 429 o 503).

   Solo vale para el formulario **público** abierto de una edición **publicada**.
4. **La lectura de la edición.** `GET /api/v1/ediciones/<id>` responde lo público de una edición publicada y, si tiene un formulario público abierto, sus campos y si pide consentimiento. Sin datos personales.
5. **CORS.** La lectura usa el CORS de solo lectura de ADR-090. La escritura usa uno propio: solo el origen exacto de `PUBLIC_API_ORIGINS`, sin credenciales, con `POST` y `content-type`, y siempre `Vary: Origin`. Una llamada de servidor a servidor no manda `Origin` y no lo necesita.
6. **Lo que queda de P2 y P3.** Los temas, los bloques y la autenticación entre aplicaciones siguen pendientes, y dependen del monorepo de P1 y de lo que DÍAS pida. El piloto con DÍAS (P3) se arma en `dias` cuando la OE dé la fecha y el alcance de la edición: con esta ADR, `dias` ya puede leer una edición, inscribir y mostrar la entrada sin que la casa cambie.

## Consecuencias

- **Migración 0072.** `ticket_hash`, `checked_in_at` y `checked_in_by_id` en `edition_registration`, con un índice único parcial sobre el hash.
- **Las inscripciones de antes no tienen entrada.** La puerta no las encuentra; se registran por la lista de inscritos, como hasta hoy.
- **La medición.** Antes de que DÍAS inscriba en la casa se corre la medición de ADR-183 con las inscripciones por minuto de una apertura.
- **Pendiente con la junta.** Que la política de datos mencione la entrada y la hora de llegada (contenido pendiente).
