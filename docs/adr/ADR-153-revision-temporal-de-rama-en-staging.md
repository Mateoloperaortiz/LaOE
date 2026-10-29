# ADR-153: Revisión temporal de una rama funcional en staging

- Estado: Aceptada; preparación en curso
- Fecha: 2026-10-29
- Relacionadas: ADR-117, ADR-141, ADR-150, ADR-151
- Enmienda: ADR-141 (revisión temporal de una rama) y ADR-151 regla 6 (excepción de operación manual del propietario limitada a esta revisión de staging)

## Contexto

La VP administrativa revisará una primera versión funcional de inventario en el staging compartido antes de mezclar su rama, según el plan expresamente autorizado por el propietario. El despliegue habitual publica `main` por canal de imagen. Las migraciones de la rama no deben contaminar el diario de la base habitual de staging: volver a una imagen anterior no revierte ese diario y puede bloquear migraciones posteriores según ADR-117.

## Decisión

1. Revisar un SHA exacto validado de `feat/inventario-vp-administrativa`, con PR borrador y datos sintéticos, en el servicio `web` existente de staging. No se crea otro proyecto, servicio o entorno.
2. Conservar privadamente la referencia original de base, fuente de imagen, SHA/digest servido y estado de `IMAGE_DEPLOY_STAGING`. Desactivar únicamente el despliegue automático de staging y esperar trabajos ya iniciados. El workflow de producción continúa disponible bajo sus protecciones de environment y aprobación del propietario.
3. Crear una base temporal dentro del PostgreSQL de staging, migrarla y sembrar exclusivamente datos ficticios. Publicar la imagen inmutable del SHA de la rama sin mover `canal-staging`. La opción manual `destino=revision` del workflow de despliegue publica solamente esa imagen, exige una ejecución CI completa y aprobada del SHA exacto y deja un artefacto con su digest; no declara un environment, no lee sus secretos ni recibe un token de Railway y no promueve ni despliega. `destino=production` conserva el camino habitual. El propietario aplica el patch desde su CLI de Railway autenticada con su cuenta, bajo la autorización previa de esta revisión: el ID explícito de staging fija `web` al digest y a la conexión temporal, preservando credenciales de registro y demás configuración. No usar una mutación de configuración con alcance implícito entre entornos.
4. Esta excepción enmienda solo la regla 6 de ADR-151 para la revisión manual de staging descrita aquí. No modifica las restricciones de los environments a `main`, no usa sus tokens fuera de esa rama, no ejecuta despliegues desde PR y no habilita producción.
5. Verificar el SHA de salud, smoke y recorridos de VP, dirección, delegado, CML y miembro. La revisión conserva su enlace durante la ventana acordada; sus cuentas de demostración se entregan por el mecanismo de acceso existente.
6. Al cerrar la ventana, restaurar referencia original de base y fuente, recuperar el valor previo del flag y servir un `main` publicado y aprobado. Comprobar salud/smoke antes de retirar la base temporal desconectada. La restauración se ejecuta a petición del cierre de revisión, no mientras la VP la necesita.

## Consecuencias

Los pushes a `main` pueden seguir publicando su canal mientras staging permanece fijado al digest de la rama. Esta excepción no habilita promover la rama a producción. El registro de avance distinguirá preparación, despliegue comprobado, observaciones pendientes y restauración final.
