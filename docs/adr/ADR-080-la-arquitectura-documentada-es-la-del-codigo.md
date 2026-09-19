# ADR-080: La arquitectura documentada es la del código

- Estado: Aceptada
- Fecha: 2026-09-19
- Relacionadas: ADR-001, ADR-017, ADR-034, ADR-035, ADR-037, ADR-079
- Enmienda: ADR-001 (estructura de un módulo), ADR-017 (`defineResource`)

## Contexto

`AGENTS.md` obliga a leer [01-arquitectura.md](../01-arquitectura.md) antes de tocar código, y eso vale para cada sesión, humana o de agente. La [auditoría del 2026-09-19](../auditoria-codigo-2026-09-19.md) encontró que ese documento describe una estructura que el código no tiene. Comprobado sobre `0316c07`:

- Dice que cada módulo tiene `actions.ts` y `events.ts`. Solo `identity` y `system` tienen `actions.ts`, y ningún módulo tiene `events.ts`. Las server actions reales son 51 archivos en `src/app/**`.
- No menciona `admin.ts`, que existe en 11 de los 13 módulos y es el segundo punto de entrada más usado desde `src/app` (49 imports).
- Dice que `src/shared/ui` trae una «shadcn base» y que el admin kit ofrece `defineResource(...)`. `src/shared/ui` tiene `AreaSwitch`, `Markdown` e `icons/`, y `defineResource` no existe: los recursos son objetos tipados `ResourceDefinition`.
- La tabla de módulos declara dependencias en prosa, y el código tiene otras. `crm` importa además `events`, `identity` y `participation` (el documento y ADR-035 decían que no); `identity` importa `comms`, aunque el documento dice que a `comms` «nadie lo importa»; `system` importa `identity` desde sus actions; `forms` ya no importa `terms`; `finance` importa `terms` y no `events` (con `events` solo tiene claves foráneas).

Ninguna de esas diferencias es un defecto del código. Las actions viven en `src/app` por una razón que el propio código explica (`src/app/admin/personas/[id]/actions.ts`): una action compone los guards de `identity` con comandos de uno o varios módulos, y un módulo no puede importar las actions de otro. Lo que falla es el documento, y falla por la misma causa que la lista de índices de ADR-079: es una copia a mano de algo que tiene una fuente.

La auditoría proponía además tres mudanzas «mecánicas» entre módulos. Revisadas una por una, solo una lo era:

- `TeamParticipations.tsx` vivía en `src/shared/brand` y es interfaz de permanencia (usa el enum de evaluación y sus textos). Se muda.
- `aliasesResource` vive en `participation/admin.ts` y la auditoría lo daba por mal ubicado porque la tabla es de `system`. Está bien donde está: un alias apunta a una ocasión y el recurso lee ocasiones; en `system` crearía `system → participation`, que es peor.
- `participation.term-check` es un asunto de términos dentro de `participation/jobs.ts`. Moverlo bien implica renombrar un tipo de evento programado, y eso se decide con el catálogo de eventos (tramo R4), no en una limpieza.

## Decisión

1. **Estructura real de un módulo.** `src/modules/<módulo>/` tiene `schema.ts`, `domain/` (comandos, lecturas y `*-pure.ts` sin I/O), `index.ts` (API pública para otros módulos y para `src/app`), `admin.ts` cuando el módulo aporta recursos al admin kit, `jobs.ts` cuando escucha el outbox o corre programados, y `components/`. Los archivos que comparten navegador y servidor (motores y tipos de los juegos) van en la raíz del módulo, porque un componente no puede importar `domain/`.
2. **Las server actions viven en `src/app/**/actions.ts`**, junto a la ruta que las usa. Una action resuelve el actor con los guards de `identity`, parsea con Zod, llama a comandos `*As` de uno o varios módulos por su `index.ts`, y revalida o redirige. Solo `identity` y `system` tienen `actions.ts` propio, porque sus actions no componen otros módulos y se usan desde varias rutas. La unificación de sus helpers es el tramo R3.
3. **`admin.ts` es un punto de entrada público**, igual que `index.ts`: exporta los `ResourceDefinition` del módulo y las opciones y etiquetas que necesitan sus pantallas de administración. Lo consume `src/app/admin/_kit/registry.ts`. No existe `defineResource`.
4. **No hay `events.ts`.** Los eventos de dominio son hoy cadenas con payload sin tipo (`src/db/tx.ts`). El catálogo tipado por módulo productor es el tramo R4 y llegará con su ADR; hasta entonces el documento no promete lo que no existe.
5. **El grafo entre módulos se verifica, no se redacta.** `MODULE_DEPS` en `.dependency-cruiser.cjs` declara de qué módulos importa cada uno por `index.ts`, y una regla por módulo (`dependencias-de-<módulo>`) hace fallar `npm run deps:check` ante cualquier import fuera de esa tabla. La configuración falla también si un directorio de `src/modules` no está en la tabla o si la tabla nombra un módulo que ya no existe. Las claves foráneas entre `schema.ts` siguen aparte. 01-arquitectura deja de listar dependencias en prosa y remite a la tabla.
6. **La tabla nace con el grafo de hoy**, incluidas las dependencias que ningún documento había decidido (`crm → events, identity, participation`; `identity → comms`; `system → identity`). Registrarlas no es aprobarlas: es dejar de crecer a ciegas. Dos rasgos quedan anotados para R5, sin tocarlos ahora: `people ↔ events` y `identity → people → system → identity` son ciclos entre módulos que no lo son entre archivos, y por eso `sin-ciclos` no los ve.
7. **Una dependencia nueva entre módulos es una decisión**: se agrega a `MODULE_DEPS` en el mismo PR que la introduce, y si cambia una regla de alguna ADR, con su enmienda.

## Consecuencias

- 01-arquitectura y `AGENTS.md` describen lo que hay. Una sesión que los lea antes de codificar ya no busca `modules/<módulo>/actions.ts` ni intenta crear `events.ts`.
- Agregar un módulo exige declararlo en `MODULE_DEPS`; olvidarlo rompe `deps:check` con un mensaje que lo dice.
- La regla se comprobó en rojo: un import de `terms` desde `content` produce `dependencias-de-content`.
- `TeamParticipations` pasa a `src/modules/permanence/components/`. `src/shared/brand` queda sin piezas de negocio.
- No cambia comportamiento, esquema, textos ni pantallas.
