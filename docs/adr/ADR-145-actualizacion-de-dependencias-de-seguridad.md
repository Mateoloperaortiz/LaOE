# ADR-145: Actualización de dependencias de seguridad

- Estado: Aceptada
- Fecha: 2026-10-24
- Relacionadas: ADR-001, ADR-085

## Contexto

La revisión de seguridad encontró `next@16.3.8` en el manifiesto, el lockfile y la instalación de la casa, y `next@16.3.6` en los tres lugares de DÍAS. Se contrastaron los avisos con el mantenedor, la publicación de la release y el registro público de npm antes de instalar:

- [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): denegación de servicio en App Router con Server Actions. La casa tiene esas acciones; `16.4.1` es la primera versión corregida de la rama 16.
- [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): posible ejecución remota al optimizar SVG en Linux con glibc. El aviso indica como mitigación `sharp >=0.35.5`; ambos checkouts ya resolvían `sharp@0.35.5`. No se presenta ese vector como una exposición confirmada.
- [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): ejecución remota con Cache Components y funciones `use cache` que devuelven múltiples arrays tipados. La casa no habilita Cache Components ni declara esas funciones, pero el mantenedor pide actualizar incluso sin ellas.

El [anuncio de seguridad](https://nextjs.org/blog/nextjs-security-update-october-14-2026), la [release `v16.4.1`](https://github.com/vercel/next.js/releases/tag/v16.4.1) y los [metadatos de npm](https://registry.npmjs.org/next/16.4.1) coinciden en la versión corregida. npm publica el tarball con integridad `sha512-uc657V62E34fOI6W5NtG9IzwsPcms0Z60grz2MJGtglgD+pTFnNt4Yw2PzaU622tfX4vhrDgLZzicE2YlhI20Q==` y exige `sharp ^0.35.5`.

La casa también declara `zod ^4.5.4`, resuelto e instalado como `4.5.4`. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identifica `4.6.6` como parche, pero el [CNA de CVE-2023-54404](https://www.vulncheck.com/advisories/zod-uncontrolled-resource-consumption-via-array-validation) aclara que **ninguna release publicada corrige las colecciones sin un límite explícito**, incluidas `4.6.6` y `4.6.7`. El [PR del mantenedor #6652](https://github.com/colinhacks/zod/pull/6652), incluido en la [release `v4.6.6`](https://github.com/colinhacks/zod/releases/tag/v4.6.6), adelanta `.max()`, `.length()` y `.size()` de arrays, sets y maps antes de recorrer los elementos. Solo participan los límites anteriores a otros checks. Se contrastaron el código del tag con el tarball publicado y su integridad de [npm](https://registry.npmjs.org/zod/4.6.6): `sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==`.

## Decisión

1. **Actualizar las dependencias afectadas aunque no se identifique un vector activo en la aplicación.** La ausencia de un uso vulnerable describe la exposición actual; no sustituye el parche disponible. En este tramo se fija Next en `16.4.1`, la menor release corregida disponible de la rama 16, conservando el pin exacto que ya usaba la casa. DÍAS registra su actualización preventiva en D-053.
2. **Actualizar con alcance acotado.** El lockfile se genera mediante npm contra el registro público, con scripts de instalación y auditoría automática desactivados. Se revisan los paquetes realmente modificados y la concordancia entre manifiesto, lockfile e instalación. No se ejecuta una actualización general a `latest` ni `npm audit fix`.
3. **Conservar el modelo de ejecución.** Se leen las guías incluidas en `node_modules/next/dist/docs/` antes y después de actualizar. La publicación de [Next 16.4](https://nextjs.org/blog/next-16-4) recomienda Cache Components para nuevas aplicaciones; adoptarlos en una aplicación existente es otra decisión. Este parche conserva la configuración de la casa y los peers React/React DOM `19.2.8`, admitidos por `next@16.4.1`.
4. **Elevar el piso de Zod a `^4.6.6` y resolver el lock a `4.6.6`.** Se conserva la política de rango existente y se instala la menor versión que incorpora el rechazo temprano de colecciones acotadas. La actualización no se registra como cierre completo de CVE-2023-54404: las entradas no confiables siguen necesitando límites de tamaño antes de validar los elementos.

## Consecuencias

Se actualizan también `@next/env` y los paquetes opcionales `@next/swc-*` de la misma release. `sharp@0.35.5` ya cumple el piso y no necesita actualizarse. El salto menor incorpora cambios internos de compilación y de React empaquetado por Next: se comprueba la instalación y se ejecutan pruebas enfocadas; el cierre del tramo requiere las comprobaciones completas del integrador.

Zod no exige migrar la API general, pero cambia el resultado de errores para una colección sobredimensionada: omite los errores por elemento y los refinamientos posteriores. Una unión que antes devolvía `too_big` puede devolver `invalid_union`; el [PR #6662](https://github.com/colinhacks/zod/pull/6662) corrige ese caso, pero no está en los tarballs de `4.6.6` ni `4.6.7`. El [anuncio de Zod 4.6](https://zod.dev/blog/zod-4-6) también describe errores construidos al acceder a `.error`, cambios del patrón de correo y de la introspección de enums numéricos. La verificación enfocada cubre los contratos y formularios existentes; revisar y acotar entradas de la aplicación es un trabajo distinto del cambio de dependencias.

El cambio del checkout no acredita por sí mismo una actualización de producción. Esta decisión no requiere tocar servicios, credenciales ni la infraestructura.
