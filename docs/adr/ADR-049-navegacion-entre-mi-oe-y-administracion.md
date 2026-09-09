# ADR-049: Navegación entre Mi OE y Administración

- Estado: Aceptada
- Fecha: 2026-09-09
- Relacionadas: ADR-011, ADR-036, ADR-043, ADR-044, ADR-046, ADR-048

## Contexto

Administración ofrece un enlace a Mi OE dentro de Tu cuenta, pero Mi OE no tiene un acceso general para volver. El usuario señala que falta una forma de pasar entre las dos áreas.

## Decisión

1. Ambas cabeceras muestran un enlace a la otra área: «Mi OE» en Administración y «Administración» en Mi OE. Permanecen visibles en computador y celular y permiten navegación por teclado. El enlace existente en Tu cuenta se conserva.
2. Mi OE consulta la misma composición `adminAreaRoles` que usa el guard administrativo. El acceso aparece para ADMIN, junta, líderes de comité y líderes o evaluadores de grupos vigentes que puedan operar. `/admin` conserva la redirección al destino permitido de cada persona.
3. El cambio es navegación con la misma sesión. No modifica permisos, membresía, identidad ni consentimientos. Se mantienen los guards de servidor, incluido el acceso de consulta en licencia y la autorización previa de Mi OE.

## Consecuencias

Se amplía la navegación de las cabeceras de ADR-043 y ADR-044 sin modificar sus destinos cotidianos. El componente visual recibe el destino; la decisión de acceso se calcula en el servidor mediante APIs públicas de módulos. No se requieren migraciones ni dependencias.

Las pruebas cubren ida y vuelta, usuarios sin permisos, líderes y evaluadores, teclado, tamaños móviles y escritorio, temas claro/oscuro y texto al 200 %. Los resultados efectivos se registran en el roadmap. La entrega es local; el despliegue se verifica por separado.
