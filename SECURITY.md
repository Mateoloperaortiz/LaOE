# Reportar una vulnerabilidad

Reporta problemas de seguridad o credenciales expuestas desde [Report a vulnerability](https://github.com/Mateoloperaortiz/LaOE/security/advisories/new). El reporte es privado y lo revisa el propietario del repositorio. No abras un issue público con credenciales, datos personales, instrucciones de explotación ni registros de usuarios reales.

Incluye el componente o SHA afectado, una explicación del impacto y pasos mínimos de reproducción con datos sintéticos. Evita adjuntar tokens activos; basta indicar el proveedor, la ubicación y el tipo de credencial. No se fija un plazo de respuesta que el equipo no pueda garantizar.

Si una credencial se publicó, debe revocarse o rotarse en su proveedor y retirarse de los archivos, registros o artefactos afectados. Borrar la última versión de un archivo no elimina la credencial del historial ni invalida copias anteriores.

El mantenimiento de seguridad se concentra en `main` y en la versión desplegada en producción. Las ramas históricas no reciben correcciones independientes. Dependabot, CodeQL y el escaneo de secretos ayudan a detectar problemas; sus resultados requieren revisión del equipo.
