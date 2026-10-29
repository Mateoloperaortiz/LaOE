# Cómo colaborar en la casa digital

Los integrantes invitados necesitan aceptar la invitación de GitHub y activar la autenticación de dos factores en su cuenta. El permiso de escritura permite crear ramas y proponer cambios; los accesos a la aplicación y a Railway se gestionan por separado. El propietario agrega o retira colaboradores en Settings → Collaborators, con permiso de escritura para el trabajo habitual.

1. Lee `AGENTS.md`, `docs/glosario.md` y la documentación del área. Registra decisiones nuevas en una ADR y el avance en `docs/09-roadmap.md`.
2. Crea una rama desde `main`, por ejemplo `feat/descripcion-corta`. Para propuestas desde fuera del equipo, usa un fork y abre un PR.
3. Instala Node 24, uv, Python 3.12 y Docker. Ejecuta `npm ci`, crea `.env` desde `.env.example`, levanta los servicios sintéticos con `npm run db:up` y prepara el bucket con `npm run storage:init`. Usa exclusivamente datos de prueba. No conectes los tests a producción.
4. Ejecuta `npm run check` antes de cerrar el cambio. Para cambios de interfaz, ejecuta también los E2E pertinentes. El CI remoto comprueba las suites completas, la imagen y el respaldo.
5. Abre un PR hacia `main`, explica el resultado y adjunta la validación. Si corresponde a un issue, usa `Refs #N`; el ticket de implementación se cierra cuando el cambio está en producción.
6. Espera `CI` en verde, resuelve las conversaciones y consigue una aprobación de otra persona. Los cambios sensibles definidos en `.github/CODEOWNERS` necesitan revisión del propietario. Nuevos commits invalidan aprobaciones anteriores.

`main` valida los cambios y alimenta staging. La promoción de la imagen a producción es explícita, exige el SHA que staging ya sirve y aprobación del environment por el propietario; sigue `docs/15-runbook.md`. No intentes saltar el CI ni publicar desde un PR.

El repositorio, sus issues, PR, registros y artefactos son públicos. No subas `.env`, tokens, claves, respaldos, exportes, capturas con información privada ni datos personales reales, tampoco en comentarios. Los secretos de despliegue pertenecen a environments restringidos; no se comparten por chat ni se ponen como secretos generales del repo. Para reportar una credencial expuesta o una vulnerabilidad, sigue `SECURITY.md`.

El código visible públicamente no otorga por sí solo una licencia general de reutilización. La OE decidirá cualquier licencia por separado.
