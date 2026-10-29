# Ejecutores de CI

El workflow `CI` usa runners hospedados `ubuntu-latest` para el repositorio público `Mateoloperaortiz/LaOE`, según [ADR-152](docs/adr/ADR-152-ci-hospedado-del-repositorio-publico.md). El portátil de [ADR-148](docs/adr/ADR-148-ci-en-runners-linux-locales.md) ya no es un requisito ni el destino de estos jobs.

## Ejecución

- Los nueve jobs conservan sus nombres y dependencias. Integración mantiene tres particiones y E2E seis, ahora paralelas, con reparto por duración y comprobación del inventario completo.
- Node 24 se instala con `actions/setup-node`; las unitarias aprovisionan Python 3.12 con `actions/setup-python` y uv con pip para el extractor. E2E instala o verifica Chromium y sus dependencias con Playwright. Cada runner parte de su propio entorno desechable.
- PostgreSQL y Garage contienen únicamente datos y claves sintéticas. Usan puertos dinámicos y nombres de recursos por ejecución. La limpieza solo retira recursos de su propio job.
- La prueba de imagen conserva un contexto temporal de `git archive` con los permisos versionados. Ejecuta el release, arranca el servidor y comprueba salud y SHA horneado, sin publicar la imagen.

## Alcance y evidencia

Cada job exige el repositorio de la OE y, para un PR, una rama del mismo repositorio. Checkout no persiste credenciales. No se usa `pull_request_target` ni se ejecutan ramas de forks mediante este workflow.

La política de Actions exige SHA completos: los `uses` de CI, despliegue y smoke fijan commits oficiales de `actions/*` y `docker/*` y conservan el tag como comentario. Al actualizar una acción, resolver el SHA por la API del repositorio de su autor y revisar el cambio. No desactivar `sha_pinning_required` ni ampliar los proveedores permitidos para saltarse esta condición.

La puerta requerida sigue llamándose `CI`. Exige los mismos informes de unitarias, integración, E2E e inventario, el drenaje estricto del outbox y los jobs de calidad, respaldo e imagen aprobados. Los artefactos de evidencia se conservan 14 días; diagnósticos y capturas de fallos, siete. El resultado de un SHA anterior no acredita una ejecución nueva, salvo los modos de reutilización y promoción ya definidos por ADR-141 y comprobados por el gate.

Los pushes a `main` y `production` y los PR propios conservan sus eventos. Para revisar una rama antes de mezclarla, se puede ejecutar manualmente `CI` sobre su referencia y comprobar el SHA, los jobs y el artefacto `ci-result`. Una cola o una ejecución incompleta no confirma la validación. La primera corrida puede necesitar llenar cachés; el tiempo de operación se documenta después de observar la ejecución completa.

## Operación

Los jobs muestran un runner hospedado de GitHub y no esperan al listener del portátil. El runner local anterior no debe usarse para ejecutar código del repositorio público; su retirada o conservación para otro ámbito es una operación separada de este cambio del workflow.

Los workflows de despliegue y smoke conservan sus propios runners, secretos, entornos y gates. Esta configuración no cambia `main`, `production` ni las protecciones de ramas, y no despliega desde un PR. Cualquier retorno a infraestructura local requiere decidir y verificar un alcance compatible con la visibilidad pública antes de cambiar `runs-on`.
