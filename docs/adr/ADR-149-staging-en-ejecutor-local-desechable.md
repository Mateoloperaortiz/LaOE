# ADR-149: Staging en un ejecutor local desechable

- Estado: Propuesta
- Fecha: 2026-10-29
- Relacionadas: ADR-141, ADR-148
- Enmienda: ADR-148, alcance del ejecutor de staging

## Contexto

El CI de `main` ya puede terminar en el portátil, pero el job que publica su imagen y despliega staging sigue solicitando un runner hospedado. Un bloqueo de facturación de GitHub impide que ese job comience. El entorno de CI tiene Docker y ejecuta código de los PR del repositorio privado; reutilizarlo para despliegues dejaría los secretos de staging expuestos a cambios persistentes de trabajos anteriores.

## Decisión

Solo `publicar` de `deploy.yml` pasa a las etiquetas `[self-hosted, Linux, X64, staging-deploy, local, disposable]`. Conserva el evento `workflow_run`, la conclusión satisfactoria del CI de un push a `main`, la evidencia del SHA, la imagen por SHA, la comprobación del digest del canal, el alcance del token Railway, la espera de salud y el smoke. Producción conserva su dispatch, ejecutor y comprobaciones actuales.

El host crea una cuenta Windows limitada y una distribución de despliegue independientes de la cuenta y el Docker usados por CI. Cada trabajo parte de una copia de un disco base inmutable sin registro de runner ni credenciales. Registra un runner oficial con `--ephemeral`, ejecuta un solo job y elimina la distribución y su disco escribible al terminar, fallar o agotar su tiempo. Un fallo en esa eliminación bloquea el siguiente trabajo hasta recuperar el entorno. No se conservan directorios de trabajo, cuentas Linux, configuración Docker ni cachés privadas entre trabajos.

Las etiquetas seleccionan capacidad; no autorizan un workflow. Un controlador privilegiado de Windows admite únicamente el workflow y job previstos, con repositorio privado, versión de workflow, ejecución y fuente CI identificadas. Un hook del runner comprueba ese contexto antes de inicializar contenedores o acciones. La copia limpia por trabajo impide además que un job anterior modifique el entorno de un despliegue futuro.

El token de control de GitHub queda cifrado con DPAPI y con ACL para SYSTEM y administradores en Windows. El usuario limitado del ejecutor y el guest no lo reciben. Dentro del guest solo entran el token temporal de registro y las credenciales que Actions entregue al job autorizado. Los secretos Railway existentes siguen con su alcance de repositorio: esta migración no cambia sus valores ni los convierte en secretos protegidos por Environment.

El guest no monta unidades Windows ni habilita su interoperabilidad. Tiene un máximo de 4 GiB, dos CPU y 2 GiB de swap; su Docker tiene presupuesto propio. El controlador espera si falta margen de memoria o disco. Esos límites y la serialización de staging preservan la capacidad del portátil; no implican disponibilidad cuando el equipo o internet están apagados.

## Verificación y reversión

Antes de activar la ruta deben pasar la verificación de aislamiento, el build sintético, la admisión y rechazo de contextos, la destrucción del disco entre trabajos, un job real en GitHub y el despliegue con salud y smoke del SHA esperado. La propuesta y las pruebas estáticas no acreditan por sí solas esas pruebas vivas.

Se revierte el `runs-on` de `publicar` al anterior y se deshabilita el controlador, después de dejar terminar cualquier job activo. La compuerta de CI y los checks no se omiten. Los minutos hospedados volverán a depender del estado de facturación de GitHub. La imagen base solo se renueva fuera de los jobs, desde fuentes oficiales verificadas, manteniendo las actualizaciones del runner habilitadas.
