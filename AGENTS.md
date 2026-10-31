<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Casa digital de la OE

- Idioma: la interfaz, los docs y los commits van en español (tuteo paisa sutil en lo que ve un miembro: «tú» colombiano con el toque de [ADR-086](docs/adr/ADR-086-copy-paisa-y-parchado.md) según la enmienda [ADR-138](docs/adr/ADR-138-tu-paisa-sutil-sin-acentuacion-argentina.md), definida en [docs/14-copy-y-textos.md](docs/14-copy-y-textos.md) §1); los identificadores del código en inglés, según [docs/glosario.md](docs/glosario.md).
- Antes de tocar código leé [docs/01-arquitectura.md](docs/01-arquitectura.md) (módulos, capas, layout) y la ADR que aplique en [docs/adr/](docs/adr/README.md). Una decisión nueva es una ADR nueva; una regla vieja no se edita, se enmienda.
- El seguimiento vive en [docs/09-roadmap.md](docs/09-roadmap.md): al cerrar un tramo se marca la casilla y se agrega una fila al registro de avances.
- El código no inventa textos: todo copy sale de [docs/14-copy-y-textos.md](docs/14-copy-y-textos.md) por su código `T-…`. Lo que corre en el navegador (un archivo `"use client"` o un componente que se use desde uno) importa `t` y `tList` de `@/shared/copy/client` y después se corre `npm run copy:sync`; `@/shared/copy` es solo de servidor y el build falla si llega al cliente ([ADR-081](docs/adr/ADR-081-el-catalogo-de-textos-no-viaja-entero-al-navegador.md)). La etiqueta de un valor de un enum se lee por valor, con `tLabels(código, ENUM)[valor]`, nunca por la posición del valor en la lista ([ADR-126](docs/adr/ADR-126-reglas-de-las-etiquetas-por-valor-del-decimocuarto-ciclo.md)). Tampoco inventa fechas ni datos de la OE: lo que falte va a [docs/11-contenido-pendiente.md](docs/11-contenido-pendiente.md).
- Capa de datos: Drizzle con el esquema de cada módulo en `src/modules/<módulo>/schema.ts` (ADR-032); `src/app` no consulta la base ni entra al dominio de un módulo: usa su `index.ts` y su `admin.ts`. Las server actions viven en `src/app/**/actions.ts`, junto a su ruta ([ADR-080](docs/adr/ADR-080-la-arquitectura-documentada-es-la-del-codigo.md)), y usan el kit de `src/app/_lib/`: `formText`/`formRaw`/`formOptional`, `single`, `withQuery`, `safeBack`, y `actorContext(actor)` para armar el actor de un comando, que es lo que lleva la IP a la auditoría ([ADR-082](docs/adr/ADR-082-un-kit-para-las-server-actions-y-auditoria-con-ip.md)). Una dependencia nueva entre módulos se declara en `MODULE_DEPS` de `.dependency-cruiser.cjs`, que no admite ciclos entre módulos ([ADR-110](docs/adr/ADR-110-el-grafo-de-modulos-de-dominio-no-tiene-ciclos.md)). Un evento de dominio nuevo se declara en `src/domain-events/<productor>.ts` y se usa con `eventOf` y `onEvent`, nunca como cadena suelta ([ADR-084](docs/adr/ADR-084-catalogo-tipado-de-eventos-de-dominio.md)). `npm run deps:check` lo verifica.
- Nada de datos personales reales en seeds, pruebas ni fixtures.
- `npm run check` debe quedar en verde antes de cada commit de cierre de tramo; commits convencionales con alcance en español (`feat(identity): …`, `docs: …`).

## Agent skills

### Issue tracker

Los issues y las specs viven en GitHub Issues de `Mateoloperaortiz/LaOE`; el registro de lo entregado sigue en `docs/09-roadmap.md`. Mirá `docs/agents/issue-tracker.md`.

### Triage labels

Los cinco roles de triage usan las etiquetas por defecto (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Mirá `docs/agents/triage-labels.md`.

### Domain docs

Un solo contexto: el glosario es `docs/glosario.md` y las decisiones son las ADR de `docs/adr/`. Mirá `docs/agents/domain.md`.
