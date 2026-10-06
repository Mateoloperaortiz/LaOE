# Documentación de dominio

Cómo deben consumir las skills de ingeniería la documentación de dominio de este repo cuando exploran el código.

Este repo es de **un solo contexto**, pero no usa los nombres que las skills traen por defecto. Donde una skill diga `GLOSSARY.md` o `CONTEXT.md` (el nombre cambia con la versión de las skills), leé y escribí `docs/glosario.md`; donde diga `docs/adr/0001-…`, es `docs/adr/ADR-NNN-…`. No crees `GLOSSARY.md`, `CONTEXT.md` ni sus variantes `-MAP.md`.

## Antes de explorar, leé esto

- **`docs/glosario.md`**: el glosario. Es una tabla de tres columnas: el nombre en la interfaz (español), el identificador en el código (inglés) y qué es.
- **`docs/adr/`**: las ADR que toquen el área donde vas a trabajar. Manda el archivo de cada ADR y su línea `Estado`. `docs/adr/README.md` (índice con estado) y `docs/04-decisiones.md` (una línea por ADR) sirven para ubicarlas rápido, pero pueden ir atrasados: listá `docs/adr/` para no saltarte ninguna.
- **`docs/01-arquitectura.md`**: módulos, capas y layout, como pide `AGENTS.md`.
- **`docs/decisiones-abiertas.md`**: las preguntas que siguen sin cerrar, con quién decide cada una.

## Estructura

```
/
├── docs/
│   ├── glosario.md               ← el glosario; en la raíz no hay GLOSSARY.md ni CONTEXT.md
│   ├── 04-decisiones.md          ← una línea por ADR; puede ir atrasado
│   ├── decisiones-abiertas.md    ← preguntas sin cerrar
│   └── adr/
│       ├── README.md             ← índice, plantilla y cómo agregar una
│       ├── ADR-001-monolito-modular-serverless.md
│       └── ADR-002-persona-como-eje.md
└── src/
```

## Usá el vocabulario del glosario

Cuando tu salida nombre un concepto del dominio, usá el término del glosario: el de la interfaz, en español, en el título de un issue, una propuesta, una hipótesis o el título de una prueba (los `it("…")` y `test("…")` de este repo son frases en español); el del código, en inglés, en un identificador. No te vayás a sinónimos.

Si el concepto que necesitás no está en el glosario, es una señal: o estás inventando un lenguaje que el proyecto no usa (reconsideralo) o hay un vacío real. En ese caso anotalo para `/domain-modeling`, que es quien lo agrega como una fila de `docs/glosario.md` cuando el término queda resuelto.

## Cómo se escribe una decisión

Seguí `docs/adr/README.md`, que trae la plantilla y los pasos. Lo que más se le escapa a una skill que viene con otros supuestos:

- El filtro de la skill («Offer ADRs sparingly»: solo si es difícil de revertir, sorprende y sale de un trade-off) no aplica aquí: una decisión nueva es una ADR nueva, como dice `AGENTS.md`.
- El archivo es `ADR-NNN-titulo-corto.md` con el siguiente número libre, en español.
- Una regla vieja no se edita. Si la decisión nueva solo le cambia una parte, es una ADR nueva que la **enmienda**: la vieja conserva su texto, cambia su estado a `Aceptada (enmendada por ADR-NNN)` y cierra con una sección «Enmienda». Si la reemplaza entera, la vieja conserva su texto y queda como `Reemplazada por ADR-NNN`.
- La ADR nueva lleva su fila en el índice de `docs/adr/README.md` y en `docs/04-decisiones.md`.
- Una pregunta que queda sin decidir va a `docs/decisiones-abiertas.md`, no a una ADR a medias.

## Marcá los conflictos con una ADR

Si tu salida contradice una ADR vigente, decilo de frente en vez de pasarle por encima:

> _Contradice la ADR-007 (ledger append-only), pero vale la pena reabrirla porque…_
