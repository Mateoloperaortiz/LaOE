# ADR-174: Las encuestas pendientes se abren desde «Te toca»

- Estado: Propuesta
- Fecha: 2026-11-13
- Enmienda: [ADR-038](ADR-038-comunicaciones-y-pwa-fase-6.md) (regla 13, la encuesta de una ocasión)
- Relacionadas: ADR-082, ADR-160, ADR-166

## Contexto

ADR-038 regla 13 manda la encuesta de una ocasión cerrada con un push que lleva un enlace con un token (`/app/encuesta/<token>`). La casa guarda solo el hash del token, así que no puede volver a armar ese enlace. Por eso «Te toca» (ADR-160 regla 2, tramo M2) dejó fuera las encuestas: quien no tocó el push no tenía cómo llegar a la suya desde Mi OE.

Pero el enlace con token no es lo que protege la encuesta. La página ya exige la sesión, y la invitación solo se abre si es de quien tiene la sesión: el token nunca reemplaza a la persona. Lo que hace anónima la encuesta es otra cosa: la respuesta se guarda sin persona y la invitación solo dice que respondió.

## Decisión

1. **La invitación también se abre por su id, con la sesión.** `/app/encuestas/<invitación>` muestra la misma encuesta que el enlace con token, con las mismas condiciones: la invitación es de quien tiene la sesión, la persona puede participar, no la respondió y sigue dentro de la ventana de `survey.windowDays`. Si no es suya, la pantalla dice lo mismo que una invitación que no existe.
2. **«Te toca» lista las encuestas pendientes**, de la que vence primero a la última, con su fecha límite: la ocasión, «Responder la encuesta» y el enlace por id.
3. **El anonimato no cambia.** La respuesta se sigue guardando sin persona, la auditoría dice que respondió y nunca qué (ADR-038 regla 13), y la respuesta va sin IP (ADR-082 regla 7). El enlace del push con token sigue funcionando igual.

## Consecuencias

- **Sin migración.** La invitación ya tiene su id.
- **Pruebas.** Integración de abrir y responder por id, de la invitación ajena, de la respondida y de la vencida. E2E de la encuesta en «Te toca» hasta responderla.
