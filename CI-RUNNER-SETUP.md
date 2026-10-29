# Ejecutores de CI

El workflow `CI` usa runners hospedados `ubuntu-latest` para el repositorio público `Mateoloperaortiz/LaOE`, según [ADR-151](docs/adr/ADR-151-repositorio-publico-y-colaboracion-protegida.md). El portátil de [ADR-148](docs/adr/ADR-148-ci-en-runners-linux-locales.md) ya no es un requisito ni el destino de estos jobs.

## Ejecución

- Los nueve jobs conservan sus nombres y dependencias. Integración mantiene tres particiones y E2E seis, ahora paralelas, con reparto por duración y comprobación del inventario completo.
- Las unitarias usan un worker y un archivo a la vez (`--maxWorkers=1 --fileParallelism=false`), sin cambiar casos ni sus tiempos límite.
- Node 24 se instala con `actions/setup-node`; las unitarias aprovisionan Python 3.12 con `actions/setup-python` y uv con pip para el extractor. E2E instala o verifica Chromium y sus dependencias con Playwright. Cada runner parte de su propio entorno desechable.
- PostgreSQL y Garage contienen únicamente datos y claves sintéticas. Usan puertos dinámicos y nombres de recursos por ejecución. La limpieza solo retira recursos de su propio job.
- La prueba de imagen conserva un contexto temporal de `git archive` con los permisos versionados. Ejecuta el release, arranca el servidor y comprueba salud y SHA horneado, sin publicar la imagen.

## Alcance y evidencia

Los PR usan `pull_request`, token de lectura y datos sintéticos; los contribuidores externos requieren aprobación. Checkout no persiste credenciales y no se usa `pull_request_target`. Las ramas protegidas requieren revisión y CI al día según ADR-151.

La política de Actions exige SHA completos: los `uses` de CI, despliegue y smoke fijan commits oficiales de `actions/*` y `docker/*` y conservan el tag como comentario. Al actualizar una acción, resolver el SHA por la API del repositorio de su autor y revisar el cambio. No desactivar `sha_pinning_required` ni ampliar los proveedores permitidos para saltarse esta condición.

La puerta requerida sigue llamándose `CI`. Exige los mismos informes de unitarias, integración, E2E e inventario, el drenaje estricto del outbox y los jobs de calidad, respaldo e imagen aprobados. Los artefactos de evidencia se conservan 14 días; diagnósticos y capturas de fallos, siete. El resultado de un SHA anterior no acredita una ejecución nueva, salvo los modos de reutilización y promoción ya definidos por ADR-141 y comprobados por el gate.

Los pushes a `main` y `production` y los PR conservan sus eventos. Para revisar una rama antes de mezclarla, se puede ejecutar manualmente `CI` sobre su referencia y comprobar el SHA, los jobs y el artefacto `ci-result`. Una cola o una ejecución incompleta no confirma la validación. La primera corrida puede necesitar llenar cachés; el tiempo de operación se documenta después de observar la ejecución completa.

## Operación

Los jobs muestran un runner hospedado de GitHub y no esperan al listener del portátil. El runner local anterior no debe usarse para ejecutar código del repositorio público; su retirada o conservación para otro ámbito es una operación separada de este cambio del workflow.

Los despliegues usan tokens separados en environments restringidos a `main`; producción exige la aprobación del propietario. No se despliega desde un PR. La revisión manual de una rama de inventario en staging sigue exclusivamente [ADR-153](docs/adr/ADR-153-revision-temporal-de-rama-en-staging.md): el workflow de revisión publica la imagen sin environment ni token de Railway, y el propietario aplica el patch de staging desde su CLI autenticada. Cualquier retorno a infraestructura local requiere decidir y verificar un alcance compatible con la visibilidad pública antes de cambiar `runs-on`.
