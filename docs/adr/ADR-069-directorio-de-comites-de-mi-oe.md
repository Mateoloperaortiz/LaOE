# ADR-069: Directorio de comités de Mi OE

- Estado: Implementada en local; publicación pendiente
- Fecha: 2026-09-15
- Relacionadas: ADR-005, ADR-014, ADR-044

## Contexto

El usuario pidió rediseñar la sección interna de comités a partir de una captura y eligió una apariencia más limpia y fácil de explorar. Los carteles de color completo daban demasiado peso a los párrafos y generaban alturas distintas cuando faltaba presentación.

## Decisión

1. `/app/comites` usa fichas locales con logos oficiales, nombre, tres líneas de presentación y una acción explícita «Ver comité». Los acentos institucionales quedan en el área del logo. La sigla determina un acento estable al filtrar; el color no representa categorías ni estados.
2. Los comités propios conservan prioridad y muestran todos los cargos vigentes con el rótulo existente. Su acceso permanece visible mientras se buscan los demás comités.
3. El buscador filtra los demás comités por nombre o sigla sin distinguir tildes ni mayúsculas. El recuento se anuncia, el estado sin resultados explica cómo recuperar la lista y «Limpiar búsqueda» devuelve el foco al campo. El filtro es local y no se guarda en la URL.
4. La autenticación y las lecturas siguen en el servidor mediante las APIs públicas de identity y people. El cliente recibe solamente identificador, sigla, nombre, logo y resumen de las fichas que ya podía consultar.
5. CSS Modules limita el cambio a este directorio. Se heredan fuentes, colores semánticos, navegación, temas y reglas de foco de Mi OE. La cuadrícula pasa de tres a dos y una columna; los cargos y nombres pueden envolver y no se recortan.

## Consecuencias

No hay migraciones, dependencias nuevas ni cambios de permisos. El portal público y las fichas de detalle conservan su presentación actual. Los textos funcionales nuevos se registran como T-2595 a T-2599; las presentaciones siguen saliendo de los datos editoriales, sin reemplazar su contenido.

## Verificación

`comites-directory.spec.ts` cubre búsqueda, sigla, normalización de tildes, limpieza y foco, permanencia de los comités propios, enlace al detalle, estados sin presentación, contenido extenso y adaptación a escritorio/móvil. La matriz visual comprueba 1440, 390 y 1979 px, ambos temas y texto al 200 %, con axe WCAG A/AA.
