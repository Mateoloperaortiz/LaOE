# ADR-148: CI en runners Linux locales del repositorio privado

- Estado: Reemplazada por ADR-151
- Fecha: 2026-10-28
- Relacionadas: ADR-054, ADR-139, ADR-140, ADR-141

## Contexto

El propietario dispone de un portátil para ejecutar CI sin consumir los minutos de los runners Linux hospedados. Hay un runner dedicado a este repositorio dentro de un Linux de CI separado de su sesión personal. La capacidad es menor que la del conjunto de runners paralelos descrito en ADR-139 y ADR-140.

## Decisión

El workflow `CI` conserva sus nombres, modos, inventarios, artefactos y compuerta final, y dirige sus jobs a `[self-hosted, Linux, X64, ci, build, local, linux-ci]`. Mantiene las tres particiones de integración y seis de E2E; la matriz tiene `max-parallel: 1` y un solo runner del repositorio atiende la cola. La suite unitaria usa un worker; integración conserva dos. No se modifican casos, aserciones, reintentos ni tiempos límite de cada prueba. Los límites de algunos jobs aumentan para permitir la ejecución con CPU acotada.

Solo se acepta el repositorio privado y, en un PR, código procedente del mismo repositorio. GitHub debe mantener deshabilitada la ejecución de workflows de PR de forks privados. La condición de cada job es una defensa adicional; un YAML modificable por el propio PR no sustituye esa política del servidor. Checkout no deja credenciales persistentes y los jobs no reciben secretos de producción.

Node 24, uv, Python 3.12, Docker, `gh` y las bibliotecas nativas de Chromium se aprovisionan fuera de los jobs. Playwright instala o verifica el navegador de su lockfile como usuario de CI, sin `sudo`. Los servicios sintéticos publican puertos dinámicos; Garage, la imagen y el contenedor web tienen nombres propios de la ejecución y limpieza específica. La prueba de imagen se conecta a PostgreSQL por la red desechable del job. Su contexto temporal privado proviene de `git archive` y restaura los permisos versionados; así el usuario no privilegiado de la imagen puede leer las migraciones y los archivos públicos sin relajar la umask restrictiva del runner.

Los workflows de despliegue y smoke conservan su ejecución y sus protecciones actuales. Esta decisión cambia el lugar donde se valida el código; no autoriza publicar una imagen ni desplegar desde un PR.

## Consecuencias

El CI completo tarda más por la cola. El portátil debe estar encendido y conectado; cuando el runner está desconectado los jobs esperan hasta su límite de cola. El arranque automático y la política energética son requisitos operativos pendientes de completar por el propietario.

Los usuarios de CI de ambos proyectos comparten un daemon Docker en el Linux dedicado y pertenecen al mismo dominio de confianza. Docker concede control de ese entorno Linux. El aislamiento respecto de los archivos personales se apoya en la cuenta Windows limitada, su distribución separada y la ausencia de montajes e interoperabilidad de Windows; no en la separación entre los dos usuarios Linux.

Una regresión se revierte restaurando el workflow anterior y sus `runs-on: ubuntu-latest`, sin cambiar la compuerta ni omitir suites. El procedimiento operativo está en `CI-RUNNER-SETUP.md`.

## Reemplazo (2026-10-29, ADR-151)

[ADR-151](ADR-151-repositorio-publico-y-colaboracion-protegida.md) cambia la visibilidad a pública, retira el runner del portátil y devuelve el CI a runners efímeros estándar de GitHub, conservando suites y puerta final.
