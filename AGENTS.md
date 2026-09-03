<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Casa digital de la OE

- Idioma: la interfaz, los docs y los commits van en español (voseo en lo que ve un miembro); los identificadores del código en inglés, según [docs/glosario.md](docs/glosario.md).
- Antes de tocar código leé [docs/01-arquitectura.md](docs/01-arquitectura.md) (módulos, capas, layout) y la ADR que aplique en [docs/adr/](docs/adr/README.md). Una decisión nueva es una ADR nueva; una regla vieja no se edita, se enmienda.
- El seguimiento vive en [docs/09-roadmap.md](docs/09-roadmap.md): al cerrar un tramo se marca la casilla y se agrega una fila al registro de avances.
- El código no inventa textos: todo copy sale de [docs/14-copy-y-textos.md](docs/14-copy-y-textos.md) por su código `T-…`. Tampoco inventa fechas ni datos de la OE: lo que falte va a [docs/11-contenido-pendiente.md](docs/11-contenido-pendiente.md).
- Capa de datos: Drizzle con el esquema de cada módulo en `src/modules/<módulo>/schema.ts` (ADR-032); `src/app` no consulta la base ni entra al dominio de un módulo: usa su `index.ts` y sus `actions.ts`. `npm run deps:check` lo verifica.
- Nada de datos personales reales en seeds, pruebas ni fixtures.
- `npm run check` debe quedar en verde antes de cada commit de cierre de tramo; commits convencionales con alcance en español (`feat(identity): …`, `docs: …`).

