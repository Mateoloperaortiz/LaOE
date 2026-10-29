# ADR-151: Revisión temporal de una rama funcional en staging

- Estado: Aceptada; preparación en curso
- Fecha: 2026-10-29
- Relacionadas: ADR-117, ADR-141, ADR-150
- Enmienda: ADR-141 (excepción explícita de revisión temporal de una rama)

## Contexto

La VP administrativa revisará una primera versión funcional de inventario en el staging compartido antes de mezclar su rama. El despliegue habitual publica `main` por canal de imagen. Las migraciones de la rama no deben contaminar el diario de la base habitual de staging: volver a una imagen anterior no revierte ese diario y puede bloquear migraciones posteriores según ADR-117.

## Decisión

1. Revisar un SHA exacto validado de `feat/inventario-vp-administrativa`, con PR borrador y datos sintéticos, en el servicio `web` existente de staging. No se crea otro proyecto, servicio o entorno.
2. Conservar privadamente la referencia original de base, fuente de imagen, SHA/digest servido y estado de `IMAGE_DEPLOY_STAGING`. Desactivar únicamente el despliegue automático de staging y esperar trabajos ya iniciados. El workflow de producción continúa disponible.
3. Crear una base temporal dentro del PostgreSQL de staging, migrarla y sembrar exclusivamente datos ficticios. Publicar la imagen inmutable del SHA de la rama sin mover `canal-staging`. La opción manual `destino=revision` del workflow de despliegue publica solamente esa imagen, exige una ejecución CI completa y aprobada del SHA exacto y deja un artefacto con su digest; no promueve ni despliega. `destino=production` conserva el camino habitual. Aplicar un patch con el ID explícito de staging que fije `web` al digest y a la conexión temporal; preservar credenciales de registro y demás configuración. No usar una mutación de configuración con alcance implícito entre entornos.
4. Verificar el SHA de salud, smoke y recorridos de VP, dirección, delegado, CML y miembro. La revisión conserva su enlace durante la ventana acordada; sus cuentas de demostración se entregan por el mecanismo de acceso existente.
5. Al cerrar la ventana, restaurar referencia original de base y fuente, recuperar el valor previo del flag y servir un `main` publicado y aprobado. Comprobar salud/smoke antes de retirar la base temporal desconectada. La restauración se ejecuta a petición del cierre de revisión, no mientras la VP la necesita.

## Consecuencias

Los pushes a `main` pueden seguir publicando su canal mientras staging permanece fijado al digest de la rama. Esta excepción no habilita promover la rama a producción. El registro de avance distinguirá preparación, despliegue comprobado, observaciones pendientes y restauración final.
