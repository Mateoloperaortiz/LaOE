# ADR-083: Lo compartido no vive en la carpeta de una pantalla

- Estado: Aceptada
- Fecha: 2026-09-19
- Relacionadas: ADR-011, ADR-017, ADR-020, ADR-058, ADR-080, ADR-082
- Enmienda: ADR-017 (registro de recursos y navegación del admin)

## Contexto

Cinco piezas que usa medio código vivían en un lugar que no les correspondía, y cada una arrastraba una consecuencia. Salen de la [auditoría del 2026-09-19](../auditoria-codigo-2026-09-19.md), tramo R3-B; todo lo que sigue se comprobó sobre `6c9aedb`.

**`DomainError` vivía en el admin kit.** Es el error de regla de negocio que lanza el dominio de todos los módulos: 144 archivos lo importaban desde `src/shared/admin-kit/`, y 43 de ellos por el barrel, que también exporta componentes cliente. El dominio de `people` o de `participation` no tiene por qué conocer la interfaz del admin. Dos pruebas unitarias simulaban ese barrel entero solo para esquivarlo.

**`dates.ts` importaba el entorno en su primera línea.** Mezclaba funciones que leen `APP_TIMEZONE` con otras que reciben la zona por parámetro. Tres archivos `*-pure.ts` usaban las segundas y, con ellas, cargaban `src/env.ts`; y dos componentes cliente, que no pueden importarlo, escribían `"America/Bogota"` a mano. La zona estaba escrita así en seis archivos.

**El registro de recursos del admin borraba el tipo 34 veces.** `registry.ts` tenía una línea `recurso as unknown as AnyResource` por recurso: el compilador no comprobaba nada de lo que entraba, y eran 34 de los 37 `as unknown as` de todo `src`. Si dos recursos declaraban la misma clave, el segundo tapaba al primero en silencio.

**Cada destino del admin estaba escrito dos veces en el layout.** Una en `enlaces`, con su etiqueta, y otra en `groupDefs`, con su grupo. Un destino que faltara en la segunda lista desaparecía del menú sin aviso: al desarrollar la jornada de activación (ADR-051) el enlace no apareció hasta registrarlo también ahí. `admin/layout.tsx` era además el tercer archivo con más cambios del repo (31 commits): un punto de conflicto entre sesiones en paralelo.

**La autorización compuesta estaba en cuatro archivos con cuatro nombres**, dentro de carpetas de pantallas: `admin/_kit/acceso.ts`, `admin/comites/_kit/capacidades.ts`, `admin/ocasiones/[id]/authz.ts` y `admin/permanencia/authz.ts`. Un handler del API y el layout de Mi OE importaban desde la carpeta de una página del admin.

## Decisión

1. **`DomainError` vive en `src/shared/lib/errors.ts`.** El barrel del admin kit deja de exportarlo. La regla `dominio-sin-admin-kit` de dependency-cruiser impide que `domain/`, `jobs.ts` o `schema.ts` de un módulo vuelvan a importar el kit; lo siguen usando `admin.ts` y `components/`, que es lo correcto.
2. **Las fechas sin entorno viven en `src/shared/lib/dates-pure.ts`**: todo lo que recibe la zona por parámetro, más `APP_TIME_ZONE`, la única constante con el nombre de la zona para el código que no puede leer el entorno. `dates.ts` las reexporta y conserva las envolturas que leen `APP_TIMEZONE`, así que ningún import existente cambia. Los `*-pure.ts` y los componentes cliente importan de `dates-pure`.
3. **Un `*-pure.ts` no alcanza el entorno ni la base, ni de forma transitiva.** Lo verifica una segunda configuración de dependency-cruiser, `.dependency-cruiser.runtime.cjs`, sobre el grafo de ejecución: ahí los `import type` no cuentan, porque lo que se vigila es qué código carga de verdad un archivo. `npm run deps:check` corre las dos. Cumplen 41 de 43. Los otros dos (`crm/domain/timeline-pure.ts` y `forms/domain/pure.ts`) importan un ayudante puro de `people` por su `index.ts`, que carga el módulo entero; quedan como excepciones nombradas hasta que el rediseño de índices del tramo R5 dé a cada módulo una entrada pública pura. La lista no debe crecer.
4. **El registro borra el tipo en un solo lugar.** Cada recurso entra por `erased<Row, Input>(recurso)`, que exige un `ResourceDefinition` bien formado y concentra el único cast que la variancia obliga a tener. `indexResources` arma el mapa y **rechaza una clave repetida** al cargar.
5. **La navegación del admin es una sola tabla**, `adminNavGroups()` en `src/app/admin/_kit/nav.ts`: cada destino una vez, dentro de su grupo y con su etiqueta. El layout la pinta para ADMIN y la usa para ubicar en su grupo los destinos propios de los demás roles. Una prueba unitaria exige que cada destino tenga su `page.tsx`, que no haya repetidos ni etiquetas vacías, y que los destinos de líderes, evaluadores y junta caigan en algún grupo.
6. **La autorización compuesta vive en `src/app/_authz/`**: `admin-area.ts`, `committee.ts`, `occasion.ts` y `group.ts`, con imports absolutos. Sigue en `src/app` y no en `identity` por la razón de siempre: compone `identity` con `people`, `permanence` y `participation`, que `identity` no puede importar (ADR-058).
7. **Convención que queda fijada para `src/app`**: lo que usa una sola ruta vive junto a ella; lo que comparten varias vive en `src/app/_lib/` (sin JSX ni reglas) o en `src/app/_authz/` (autorización compuesta); nunca se importa desde la carpeta de otra pantalla.

## Consecuencias

- `as unknown as` en `src`: de 37 a 4. `admin/layout.tsx`: de 251 a 104 líneas.
- Agregar un destino al admin es una línea en `nav.ts`; olvidar su página rompe una prueba, no el menú en producción.
- Agregar un recurso es una línea `erased(recurso)`; si está mal formado no compila, y si repite clave la app no arranca.
- Las dos pruebas que simulaban el barrel del kit se simplifican: una ya no lo necesita.
- Quedan sin tocar, a propósito, tres desfases `-05:00` escritos a mano (`people/domain/honorary.ts`, `participation/domain/occasions.ts` y `Wordle.tsx`): cambiarlos es tocar cómo se calcula el fin de un término, y eso no entra en una mudanza.
- Los documentos de ADR anteriores que nombran las rutas viejas de la autorización (ADR-011, ADR-036, ADR-058) no se editan: esta ADR dice dónde quedaron. `05-acceso.md`, que es documento vivo, sí se actualiza.
- No cambia comportamiento, pantallas ni textos.
