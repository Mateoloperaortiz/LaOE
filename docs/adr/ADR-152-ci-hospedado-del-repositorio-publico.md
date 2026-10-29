# ADR-152: CI hospedado del repositorio público

- Estado: Reemplazada por ADR-151
- Fecha: 2026-10-29
- Relacionadas: ADR-054, ADR-139, ADR-140, ADR-141, ADR-148, ADR-151, ADR-153
- Enmienda: ADR-148 (destino, paralelismo y aprovisionamiento del CI tras publicar el repositorio)

## Contexto

El propietario convirtió `Mateoloperaortiz/LaOE` en un repositorio público y pidió usar los runners hospedados de GitHub. El workflow de ADR-148 exige un repositorio privado y selecciona el portátil: esa condición deja de corresponder al estado y a la operación elegida. La revisión funcional de inventario necesita CI completo del SHA exacto de su rama antes de publicar su imagen de revisión.

## Decisión

1. Todos los jobs de `CI` usan `ubuntu-latest`. Se conserva la condición del repositorio `Mateoloperaortiz/LaOE` y, para un PR, que su rama proceda del mismo repositorio. Se retira únicamente la condición de visibilidad privada. No se habilitan PR de forks ni `pull_request_target`.
2. Se recupera el paralelismo hospedado: tres particiones de integración y seis de E2E, con `max-parallel` de tres y seis; calidad conserva los jobs separados. La suite unitaria vuelve al paralelismo normal y cada partición de integración conserva dos workers con base propia. Se retiran el heap y los límites de contenedores específicos del portátil.
3. Los jobs aprovisionan Node 24, Python 3.12 mediante `actions/setup-python` y uv mediante pip. Playwright verifica o instala Chromium con `--with-deps`; ninguna herramienta requiere `/opt/laptop-ci/python` ni preparación del portátil.
4. Se conservan las mejoras portables de aislamiento: checkout sin credenciales persistentes, PostgreSQL y Garage sintéticos con puertos dinámicos, recursos identificados por ejecución, red desechable para probar la imagen y limpieza específica. El contexto de imagen sigue procediendo de `git archive`, con los modos versionados y sin archivos ajenos al commit.
5. No cambian los modos, el clasificador, los archivos o casos ejecutados, el reparto balanceado, la validación de inventarios, el drenaje estricto del outbox ni los artefactos y su retención. El check requerido sigue siendo `CI` y exige los mismos jobs. Una ejecución manual valida el SHA de la rama; el resultado anterior del portátil no acredita el nuevo cambio.
6. Despliegue y smoke conservan sus workflows, secretos, entornos y gates. Este cambio de ejecutor no promueve `main`, no publica una imagen por sí solo y no habilita desplegar un PR.
7. La política de Actions del repositorio público exige SHA completos. Todos los `uses` de CI, despliegue y smoke quedan fijados al commit de su versión oficial, con el tag como comentario. Los SHA se resuelven mediante la API de GitHub de cada repositorio de `actions/*` y `docker/*`; no se desactiva la política ni se amplía la lista de acciones permitidas. Una actualización posterior vuelve a resolver y revisar el commit antes de cambiarlo.

## Consecuencias

La validación deja de depender de que el portátil esté encendido. Las matrices pueden ejecutarse en paralelo dentro de la disponibilidad y los límites de concurrencia de GitHub. Una primera corrida puede tardar más al llenar cachés; se informa el tiempo realmente observado cuando termine, sin considerar una ejecución en cola como una validación aprobada.

El YAML se valida localmente con `actionlint` y las pruebas de política, reportes, particiones, promoción y compuerta de CI. La aceptación remota requiere la puerta `CI` aprobada y el artefacto `ci-result` del SHA exacto. `CI-RUNNER-SETUP.md` describe el ejecutor vigente; volver a un runner local requeriría otra decisión compatible con la visibilidad pública y no se hace como reversión automática.

## Enmienda y reemplazo (2026-10-29, ADR-151)

Esta decisión conserva el planteamiento inicial de la rama de inventario como antecedente. Al integrar `main` `73b23952` se adopta [ADR-151](ADR-151-repositorio-publico-y-colaboracion-protegida.md) como decisión vigente del repositorio público, colaboración y CI protegido. El workflow integrado conserva un worker para las unitarias y desactiva el paralelismo entre archivos (`--maxWorkers=1 --fileParallelism=false`), en lugar del paralelismo normal descrito en la regla 2 de esta ADR; no se elevan los límites de las pruebas ni se omiten casos. Los PR externos requieren aprobación, las actions conservan SHA completos y los tokens de despliegue pertenecen a environments restringidos a `main`. La revisión manual excepcional de staging se limita a [ADR-153](ADR-153-revision-temporal-de-rama-en-staging.md).
