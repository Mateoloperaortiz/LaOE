# ADR-108: Los issues de GitHub son la cola de trabajo de las skills de ingeniería

- Estado: Aceptada
- Fecha: 2026-10-06
- Relacionadas: ADR-085

## Contexto

Los agentes que trabajan en este repo usan un juego de skills de ingeniería (`to-spec`, `to-tickets`, `triage`, `wayfinder`, `domain-modeling` y otras). Esas skills dan por hechas tres cosas que el repo no decía en ninguna parte: dónde viven los issues, qué etiquetas marcan el estado de triage y dónde está la documentación de dominio. Sin esa respuesta, cada skill pregunta o usa sus nombres de fábrica: un `GLOSSARY.md` en la raíz (`CONTEXT.md` en otras versiones) y ADR numeradas `0001-…`.

El repo ya tenía resueltas dos de las tres. El glosario es `docs/glosario.md`, las decisiones son las ADR de esta carpeta y el seguimiento vive en `docs/09-roadmap.md`. Lo que no existía era una cola de trabajo fuera de los documentos: `Mateoloperaortiz/LaOE` nunca había tenido un issue.

## Decisión

1. **Los issues de GitHub son la cola de trabajo.** Las specs y los tickets que escriben las skills son issues de `Mateoloperaortiz/LaOE`, manejados con `gh`. No reemplazan nada: una decisión nueva sigue siendo una ADR y el registro de lo entregado sigue en `docs/09-roadmap.md`.
2. **Etiquetas de triage por defecto.** `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` y `wontfix`, más las dos de categoría, `bug` y `enhancement`.
3. **La documentación de dominio no cambia de nombre.** Las skills leen y escriben `docs/glosario.md` y `docs/adr/ADR-NNN-…`, con la regla de enmendar. No se crea `GLOSSARY.md` ni `CONTEXT.md`.
4. **La configuración vive en `docs/agents/`**: `issue-tracker.md`, `triage-labels.md` y `domain.md`, con un bloque `## Agent skills` al final de `AGENTS.md` que apunta a los tres. Los encabezados de ese bloque y las frases que las skills buscan por nombre se quedan en inglés.
5. **Un issue no lleva datos personales reales**, igual que los seeds, las pruebas y los fixtures.
6. **Un ticket de implementación se cierra cuando su cambio está en producción**, no al mezclar el PR a `main`. El PR nombra el ticket con `Refs #N`, sin `Closes`, `Fixes` ni `Resolves`, y el ticket se cierra a mano cuando producción ya sirve el SHA promovido. Lo que no lleva código, como un ticket de decisión o un `wontfix`, se cierra de una.

## Consecuencias

- El trabajo queda anotado en dos lugares y cada uno tiene su papel: el issue dice qué falta y el roadmap dice qué se entregó. Al cerrar un tramo se sigue marcando la casilla y agregando la fila.
- Entre la mezcla y la promoción, un ticket sigue abierto aunque su PR ya esté mezclado. Un ticket abierto no siempre es trabajo sin hacer: puede ser trabajo sin publicar.
- Las etiquetas hay que crearlas en GitHub, porque `gh` no las crea al usarlas. Las de triage quedaron creadas el 2026-10-06; las cinco `wayfinder:*` se crean antes del primer mapa.
- La configuración es un archivo más que puede quedarse atrás. Si una versión nueva de las skills espera otra cosa, se vuelve a correr `/setup-matt-pocock-skills` o se edita `docs/agents/` a mano.
- El sitio de DÍAS lleva la misma configuración en su repo, con su propio tracker (D-051 de `dias`).
