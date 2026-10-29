# ADR-151: Repositorio público y colaboración protegida

- Estado: Aceptada (enmendada por ADR-153)
- Fecha: 2026-10-29
- Relacionadas: ADR-054, ADR-139, ADR-140, ADR-141, ADR-145
- Reemplaza: ADR-148

## Contexto

La OE quiere colaborar en GitHub y ejecutar el CI sin consumir la cuota de runners estándar de repositorios privados. Publicar hace visibles también el historial, los issues, los PR y los registros de Actions. El runner del portátil previsto para el repositorio privado no es apropiado para ejecutar contribuciones externas.

## Decisión

1. El repositorio `Mateoloperaortiz/LaOE` pasa a público después de revisar el historial remoto y las superficies de colaboración en busca de credenciales. La publicación del código no cambia los permisos de la aplicación, PostgreSQL ni los medios privados. No se agrega una licencia de reutilización sin una decisión expresa de la OE.
2. Todo el CI usa runners efímeros estándar `ubuntu-latest` de GitHub. Conserva las suites, las tres particiones de integración, las seis E2E, los modos y la puerta final `CI`; desaparecen las condiciones que exigían un repositorio privado y las matrices vuelven a correr en paralelo. El runner local se desvincula del repositorio antes de publicar. Node, Python, uv y las dependencias de Chromium se preparan en cada ejecución.
3. Los PR externos usan `pull_request`, token de lectura y datos sintéticos; nunca `pull_request_target`. Las ejecuciones de contribuidores externos requieren aprobación. Los checkouts no conservan credenciales. Las actions se fijan por SHA completo, con actualización semanal por Dependabot y una lista de proveedores permitidos.
4. `main` y `production` exigen PR, una aprobación, resolución de conversaciones y el check `CI` de GitHub Actions con la rama al día. Se bloquean borrados y pushes forzados. `CODEOWNERS` exige revisión del propietario en workflows, configuración de infraestructura, migraciones y mecanismos de autorización. El rol administrador puede omitir reglas exclusivamente mediante PR, para permitir el arranque del equipo y la recuperación; ese permiso no se concede a colaboradores.
5. Los integrantes invitados reciben escritura para crear ramas y PR, sin administración. El permiso de GitHub no concede roles de la aplicación ni acceso a Railway o a datos personales. Los cambios ordinarios se revisan entre colaboradores; los archivos de `CODEOWNERS` requieren al propietario.
6. Los tokens de despliegue se guardan en los environments de GitHub, separados por entorno y acotados en Railway al mismo proyecto/entorno. Ambos environments aceptan solamente la rama `main`. Producción exige aprobación del propietario y no permite saltarla como administrador; se permite aprobar una ejecución propia porque el equipo todavía está arrancando. El job declara su environment antes de acceder al token. Se retiran los secretos de despliegue del alcance general del repositorio. No se despliega desde PR.
7. Se habilitan escaneo de secretos, protección de pushes, reporte privado de vulnerabilidades y CodeQL, junto a las alertas y actualizaciones de seguridad de Dependabot. Se aplican actualizaciones de seguridad compatibles en npm y las versiones corregidas de pypdf/Pillow con regresión del extractor, conforme a ADR-145. Los avisos y resultados se revisan: habilitar herramientas no acredita que la aplicación carezca de vulnerabilidades.

## Consecuencias

Cualquiera puede leer y bifurcar el código; escribir en las ramas protegidas sigue requiriendo revisión y CI. La publicación no puede deshacer copias que terceros ya hayan obtenido. Los runners estándar de GitHub son gratuitos para repositorios públicos; eso no implica gratuidad de runners grandes, Railway ni cualquier consumo de almacenamiento o paquetes.

La colaboración documentada en `CONTRIBUTING.md` y los reportes privados de `SECURITY.md` forman parte del mantenimiento. Las protecciones alojadas se verifican en GitHub: el YAML y `CODEOWNERS` por sí solos no las activan. Los tokens de despliegue y los permisos de colaboradores deben revisarse al entrar o salir alguien del equipo.

## Enmienda (2026-10-29, ADR-153)

La regla 6 conserva los environments restringidos a `main`, sus tokens separados y la aprobación de producción. [ADR-153](ADR-153-revision-temporal-de-rama-en-staging.md) permite exclusivamente la revisión previamente autorizada de la rama funcional de inventario en el staging compartido: un workflow manual publica la imagen de su SHA con CI completo, sin environment, secretos de environment ni token de Railway; después el propietario aplica el patch de staging desde la CLI autenticada con su cuenta. No hay despliegues desde PR ni excepción para producción. La imagen y la base habituales se restauran al cerrar esa revisión.
