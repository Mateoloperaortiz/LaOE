import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  unguardedConcurrencyTests,
  unguardedConcurrencyTitles,
} from "../../scripts/lib/test-suite-metrics";
import { driftByKey, expectReasonedOnce, presence, sourceFiles } from "../helpers/ratchet";

// Una prueba de solicitudes simultáneas puede pasar sin el candado que nombra (DT-166): con una sola
// conexión abierta en el pool, la segunda solicitud gasta su arranque abriendo la suya, la primera
// confirma antes y la carrera no llega a darse. Los ciclos 10 y 11 dejaron a cada una forzando su
// cruce, con `warmPool` o con los ayudantes de `tests/helpers/locks.ts`. Una prueba nueva que no lo
// haga funcionaría igual y nada lo notaría: por eso esta prueba lee el código (ADR-124 regla 4).
//
// Es un trinquete, no una demostración. Mira el archivo entero y, de cada prueba, solo el título: ni
// condena ni absuelve. Un archivo que llama a `warmPool` puede traer una prueba que no lo hace, y una
// carrera puede no decirlo en su título («mientras…», «otro escritor»). Lo que demuestra que una
// prueba ve su candado sigue siendo quitarlo y verla en rojo.

const INTEGRATION = "tests/integration";

interface Exception {
  path: string;
  title: string;
  /** Por qué esta prueba no necesita los ayudantes, en una frase. */
  reason: string;
}

// Las únicas pruebas que nombran una simultaneidad en un archivo sin los ayudantes. Antes de sumar una
// acá, forzá su cruce: `warmPool` antes de lanzar, o `firstThenSecond` si el orden importa, y
// comprobá que cae al quitar su candado. La lista es por título: una prueba nueva en uno de estos
// archivos también cae.
const EXCEPTIONS: Exception[] = [
  {
    path: "tests/integration/bucket-cors.test.ts",
    title: "ocho lanzadores a la vez dejan los ocho orígenes",
    reason:
      "Cada lanzador abre su propia conexión, fuera del pool que `warmPool` calienta, y sin el candado consultivo del CORS la prueba cae (3 de 3 corridas el 2026-10-11).",
  },
  {
    path: "tests/integration/helpers-count-queries.test.ts",
    title: "cuenta por separado las consultas que salen a la vez",
    reason:
      "Prueba el contador `countQueries` y no un candado: las tres consultas no compiten por nada y lo que afirma no depende del orden en que lleguen.",
  },
  {
    path: "tests/integration/participation-checkin-decision-concurrency.test.ts",
    title:
      "aprobar y rechazar a la vez desde la fila, veinte veces: gana la primera, la otra recibe el error de transición y nunca quedan puntos vivos sin aprobación",
    reason:
      "Retiene la fila del término con el `holdRows` de su archivo y no la suelta hasta que PostgreSQL ve a las dos decisiones en cola: es la copia local de los ayudantes que anota DT-193 (14).",
  },
  {
    path: "tests/integration/participation-checkin-decision-concurrency.test.ts",
    title:
      "el registro propio y el del organizador a la vez dejan una sola asistencia y un solo crédito",
    reason:
      "Retiene la fila del término con el `holdRows` de su archivo y no la suelta hasta que PostgreSQL ve a los dos registros en cola: es la copia local de los ayudantes que anota DT-193 (14).",
  },
  {
    path: "tests/integration/participation-closing-concurrency.test.ts",
    title: "permite dos escritores del mismo término a la vez",
    reason:
      "Deja un crédito sin confirmar con el `holdCommand` de su archivo y le da 2 s de `lock_timeout` al segundo: afirma que no hace cola, con la copia local que anota DT-193 (14).",
  },
  {
    path: "tests/integration/participation-closing-concurrency.test.ts",
    title: "ve la apertura concurrente de una ocasión sin puntos y revierte íntegramente el cierre",
    reason:
      "Deja la apertura sin confirmar con el `holdCommand` de su archivo y no la suelta hasta que PostgreSQL ve al cierre detrás de ella (`pg_blocking_pids`), con la copia local que anota DT-193 (14).",
  },
  {
    path: "tests/integration/wallet-google.test.ts",
    title: "recupera carreras 409 de clase y objeto mediante PATCH y PUT",
    reason:
      "La carrera es contra Google y la pone el servidor falso, que responde 409 a una sola emisión: no hay dos llamadas de la casa que cruzar.",
  },
];

/** Los archivos de prueba de un directorio, los mismos que lee la fila de `npm run audit:metrics`. */
const testFiles = (dir: string) => sourceFiles(dir, /\.test\.ts$/);

const named = (test: { path: string; title: string }) => `${test.path} › ${test.title}`;

/** Lo que nombra una simultaneidad sin los ayudantes en `dir`, comparado con la lista, por prueba. */
const listDrift = (dir: string) =>
  driftByKey(
    presence(unguardedConcurrencyTitles(testFiles(dir)).map(named)),
    presence(EXCEPTIONS.map(named)),
  );

/** Las que el trinquete no deja pasar: nombran una simultaneidad sin los ayudantes y no están en la lista. */
const unlisted = (dir: string): string[] => listDrift(dir).unlisted;

// Dice «a la vez», lanza sus dos llamadas juntas y no abre las conexiones ni retiene nada: con una
// sola conexión abierta en el pool pasa aunque `creditAs` no tome ningún candado. `helperImport` y
// `crossing` le suman el import de un ayudante y la línea que lo llama antes de lanzar.
const plantedTest = (helperImport = "", crossing = "") =>
  [
    'import { expect, it } from "vitest";',
    'import { creditAs } from "@/modules/participation";',
    ...(helperImport ? [helperImport] : []),
    'import { truncateAll } from "./db";',
    "",
    'it("dos créditos a la vez dejan uno solo", async () => {',
    "  await truncateAll();",
    ...(crossing ? [`  ${crossing}`] : []),
    "  const settled = await Promise.allSettled([creditAs(actor, input), creditAs(actor, input)]);",
    '  expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);',
    "});",
  ].join("\n");

describe("las pruebas de integración que nombran una simultaneidad", () => {
  it("viven en un archivo que llama a warmPool o a un ayudante de candados, o están en la lista de excepciones", () => {
    expect(unlisted(INTEGRATION)).toEqual([]);
  });

  it("una excepción que ya no hace falta sale de la lista: ninguna sobra", () => {
    expect(listDrift(INTEGRATION).stale).toEqual([]);
  });

  it("cada excepción está una vez y trae su razón en una frase", () => {
    expectReasonedOnce(EXCEPTIONS, named);
  });

  it("la fila de audit:metrics marca lo mismo que la lista de excepciones", () => {
    expect(unguardedConcurrencyTests(testFiles(INTEGRATION))).toEqual({
      tests: EXCEPTIONS.length,
      files: new Set(EXCEPTIONS.map((exception) => exception.path)).size,
    });
  });

  it("un archivo sembrado que dice «a la vez» y lanza dos llamadas sin forzar el cruce cae, también si importa warmPool sin llamarlo, y deja de caer cuando llama a warmPool o a un ayudante de candados", () => {
    const dir = mkdtempSync(join(tmpdir(), "casa-simultaneidad-"));
    const planted = join(dir, "sembrado.test.ts");
    const caught = [`${dir}/sembrado.test.ts › dos créditos a la vez dejan uno solo`];
    try {
      writeFileSync(planted, plantedTest());
      expect(unlisted(dir)).toEqual(caught);

      // Lo que no es un archivo de prueba no cuenta, como en la suite.
      writeFileSync(join(dir, "fixtures.ts"), plantedTest());
      expect(unlisted(dir)).toEqual(caught);

      // Importar el ayudante no fuerza nada: hay que llamarlo.
      writeFileSync(planted, plantedTest('import { warmPool } from "../helpers/pool";'));
      expect(unlisted(dir)).toEqual(caught);

      writeFileSync(
        planted,
        plantedTest('import { warmPool } from "../helpers/pool";', "await warmPool();"),
      );
      expect(unlisted(dir)).toEqual([]);

      writeFileSync(
        planted,
        plantedTest(
          'import { holdCommand } from "../helpers/locks";',
          "const held = await holdCommand(actor, (ctx) => credit(ctx, input));",
        ),
      );
      expect(unlisted(dir)).toEqual([]);

      // Nombrar el ayudante sin importarlo tampoco alcanza.
      writeFileSync(planted, `// Falta warmPool, de ../helpers/pool\n${plantedTest()}`);
      expect(unlisted(dir)).toEqual(caught);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
