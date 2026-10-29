# Runner local de CI de Casa Digital

El workflow `CI` usa el runner `laptop-ci-casa-digital`, registrado solo en este repositorio privado. Los nueve jobs conservan sus nombres y dependencias; las matrices mantienen tres particiones de integración y seis de E2E, en cola sobre un runner. La puerta requerida sigue llamándose `CI` y exige los informes completos. [ADR-148](docs/adr/ADR-148-ci-en-runners-linux-locales.md) documenta la propuesta.

## Requisitos del entorno

- Linux x64 con systemd y runner oficial como `ci-laoe`, separado del usuario personal; etiquetas `self-hosted`, `Linux`, `X64`, `ci`, `build`, `local`, `linux-ci`.
- Node 24, npm, uv 0.12.19, Python 3.12 en `/opt/laptop-ci/python`, `gh`, Git, Docker con Buildx y bibliotecas nativas de Chromium para Ubuntu 24.04. El lockfile determina la versión de Playwright y el job verifica su navegador sin instalar paquetes del sistema.
- Guest limitado a cuatro CPU, 8 GiB de RAM y 4 GiB de swap; servicio del runner con CPU 150 %, memoria máxima 3 GiB y heap Node 2 GiB. Los contenedores comparten un límite de 3 GiB y CPU 100 %; BuildKit tiene límite individual 3 GiB, compartiendo el presupuesto con sus servicios.
- Cuenta Windows de CI sin administración, distribución WSL separada y sin discos Windows montados ni interoperabilidad. Los usuarios Docker controlan el Linux de CI y comparten confianza con NewLIS.

Las herramientas y dependencias del sistema las mantiene el administrador fuera del workflow. Los jobs no usan `sudo` ni credenciales personales. Los datos y claves de PostgreSQL/Garage son sintéticos y desechables. El contexto de la imagen se extrae de `git archive` a un directorio temporal privado, conservando los modos versionados 644/755. Esto permite que `USER node` lea los archivos copiados sin relajar la umask del runner ni incluir archivos sin versionar.

Los contenedores usan nombres por ejecución y puertos dinámicos; la limpieza no ejecuta `docker system prune` ni borra recursos de otros jobs.

## Operación y seguridad

En Settings → Actions → General, mantener deshabilitado **Run workflows from fork pull requests** para repositorios privados. Los guards del YAML además exigen repo privado y PR del mismo repo. No convertir el workflow a `pull_request_target` para ejecutar código de un fork. No registrar este runner para repositorios públicos.

En Settings → Actions → Runners debe figurar `laptop-ci-casa-digital` con estado **Idle** u **Active**. Un PR del mismo repo dispara `CI`; sus jobs muestran ese nombre de runner. Los jobs esperan si el portátil está apagado, suspendido o sin conexión. Los logs y los artefactos del run son la evidencia de esa ejecución; una prueba piloto previa no acredita un commit nuevo.

El arranque automático de Windows y la configuración energética están pendientes de completar presencialmente por el propietario. Mientras tanto el entorno se mantiene iniciado temporalmente; no se ha demostrado recuperación después de reiniciar Windows o cerrar sesión.

Los workflows de despliegue y smoke siguen con sus runners, secretos, entornos y gates originales. El PR de esta configuración debe revisarse y fusionarse para que los PR posteriores hereden el enrutamiento local.

## Recuperación y reversión

Systemd reinicia el listener ante un fallo y reintenta la conexión. Con el runner sin jobs, comprobar el servicio `actions.runner.Mateoloperaortiz-LaOE.laptop-ci-casa-digital.service` y su journal dentro del Linux de CI. No imprimir archivos de credenciales del runner.

Para volver al entorno hospedado, revertir el commit de migración del workflow. Eso restaura las herramientas y `runs-on` anteriores conservando las mismas pruebas y el check requerido `CI`. Dejar que terminen los jobs antes de detener o retirar el runner. No se necesitan cambios de producción ni de protección de ramas para revertirlo.
