# ADR-013: Todo formulario vive en la app

- Estado: Aceptada
- Fecha: 2026-09-02
- Relacionadas: ADR-002, ADR-014

## Contexto

Hoy las postulaciones, inscripciones y encuestas viven en Microsoft Forms y llegan a la app por CSV o Power Automate. Cada importación es un riesgo de duplicados y una pérdida de contexto.

## Decisión

`Form` con campos tipados en JSON (texto, área, correo, teléfono, selección, multiselección, casilla, fecha), audiencia pública o de miembros, ventana, tope de respuestas y consentimiento obligatorio cuando es público. Una `Submission` crea o vincula `Person` por correo normalizado, registra `Consent` y ejecuta solo las acciones declaradas en el formulario: crear prospecto, entrar a un pipeline, inscribir a una edición, etiquetar. Nunca crea puntos ni check-ins. Formularios públicos llevan honeypot y rate limit por IP. Las ediciones pueden seguir usando un enlace externo (`registrationUrl`) cuando la OE lo necesite.

## Consecuencias

- El pipeline de admisión se alimenta solo; las inscripciones aparecen en la persona.
- Los archivos adjuntos quedan fuera de los formularios públicos en v1.
