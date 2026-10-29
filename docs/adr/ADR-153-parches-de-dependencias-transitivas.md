# ADR-153: Parches acotados de dependencias transitivas

- Estado: Aceptada
- Fecha: 2026-10-29
- Relacionadas: ADR-145, ADR-151

## Contexto

Después de publicar el repositorio quedan dos alertas de Dependabot: [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) en `esbuild <=0.24.2` y [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) en `uuid <11.1.1`. npm las presenta como seis paquetes afectados al incluir sus consumidores.

El cargador de Drizzle Kit incorpora `@esbuild-kit/core-utils@3.3.2 → esbuild@0.18.20`; ExcelJS incorpora `uuid@8.3.2`. Las releases estables comprobadas en el registro de npm (`drizzle-kit@0.31.11` y `exceljs@4.4.0`) todavía declaran esas dependencias. Bajar sus versiones principales o adoptar una prerelease modifica APIs ajenas al arreglo.

Los fallos se reprodujeron sobre las copias que cargan esos consumidores: el servidor de esbuild permite lectura desde un origen ajeno y UUID v5 escribe parcialmente en un buffer insuficiente sin rechazarlo. Las pruebas tardan menos de un segundo y no reciben datos reales ni abren una conexión externa.

## Decisión

1. Usar [overrides de npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides) limitados al consumidor: `@esbuild-kit/core-utils → esbuild@0.25.12` y `exceljs → uuid@11.1.1`. Conservar las versiones y APIs de Drizzle Kit, Drizzle ORM y ExcelJS.
2. Fijar versiones exactas y el lockfile generado por npm. `esbuild@0.25.12` pertenece a la rama que Drizzle Kit ya consume directamente y requiere Node 18 o superior; la casa exige Node 24. `uuid@11.1.1` es la primera versión corregida de su rama y conserva la entrada CommonJS que ExcelJS utiliza mediante `require('uuid').v4`.
3. Declarar `esbuild@0.28.2` como dependencia directa de desarrollo: el Dockerfile ya usa su ejecutable para empaquetar el release de base. Así no depende de qué copia transitiva quede en la raíz y se satisface también el peer de Vite (`^0.27.0 || ^0.28.0`). Drizzle Kit y su cargador conservan su propia rama 0.25.
4. No aplicar overrides globales de esbuild ni reemplazar los paquetes por forks. Mantener independientes las ramas de esbuild que necesitan los demás consumidores. No ejecutar `npm audit fix --force` ni ocultar las alertas por aceptación de riesgo.
5. Mantener regresiones de los dos comportamientos vulnerables en `tests/unit/dependency-security.test.ts`, resueltas desde los consumidores reales. Verificar además lectura/escritura de Excel, generación de SQL desde todos los esquemas sin modificar el repositorio ni conectarse a una base, `npm audit`, las comprobaciones completas y el CI remoto.

## Consecuencias

Los overrides cruzan los rangos declarados por consumidores que siguen usando dependencias antiguas; por eso su compatibilidad se acredita con comportamiento real y generación de migraciones, además de la auditoría. El esbuild del cargador deja de anunciar CORS abierto y UUID rechaza el buffer antes de escribir. No se altera un servidor de desarrollo en ejecución ni una base de datos.

Cuando una release estable del consumidor declare dependencias corregidas, se retira su override en un cambio validado. La ausencia de un vector activo en el uso actual de ExcelJS no reemplaza el parche disponible, como establece ADR-145.
