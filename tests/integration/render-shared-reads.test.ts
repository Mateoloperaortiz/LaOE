import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { getCurrentTerm } from "@/modules/terms";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Lo que se comparte dentro de un render de servidor (DT-226 incisos b y e, ADR-121 regla 11).
// `cache` de React solo guarda mientras el servidor de componentes pinta un request, y el `react` que
// carga Vitest no es el de servidor: ahí `cache` llama siempre a la función. Por eso la cuenta se hace
// en otro proceso, con la condición `react-server` que usa Next, que pinta componentes async con el
// servidor de componentes que Next trae adentro y cuenta lo que le llega a Postgres con el mismo
// contador de las demás pruebas. Los componentes son de prueba; lo que llaman es el dominio de verdad,
// por su `index.ts`, contra la base de la suite.

const root = fileURLToPath(new URL("../../", import.meta.url));
const MARK = "@@lecturas ";

const script = `
import { Writable } from "node:stream";
import flight from "next/dist/compiled/react-server-dom-webpack/server.node.js";
import { createElement } from "react";
import { closeDb, getDb } from "./src/db/client.ts";
import { getPerson360 } from "./src/modules/people/index.ts";
import { complianceSummary, listCompliance } from "./src/modules/permanence/index.ts";
import { getCurrentTerm } from "./src/modules/terms/index.ts";
import { countQueries } from "./tests/helpers/queries.ts";

const personId = process.env.RENDER_READS_PERSON_ID;
const at = Date.now();
const otherDay = new Date("2099-03-01T17:00:00.000Z");
const reads = (queries, table) =>
  queries.filter((query) => query.text.includes('from "' + table + '"')).length;

// Un request: el servidor de componentes pinta los componentes juntos y se espera a que termine.
function render(...components) {
  return new Promise((resolve, reject) => {
    const sink = new Writable({ write: (_chunk, _encoding, done) => done() });
    sink.on("finish", resolve);
    flight
      .renderToPipeableStream(
        components.map((component, key) => createElement(component, { key })),
        {},
        { onError: reject },
      )
      .pipe(sink);
  });
}
const component = (read) => async () => {
  await read();
  return null;
};

// Cada quien arma su propia fecha, como el layout, la página y el título de una pantalla.
const seen = [];
const today = async () => {
  seen.push((await getCurrentTerm(new Date(at)))?.id ?? null);
};
const screen = () =>
  render(
    component(today),
    component(today),
    component(async () => {
      seen.push((await getCurrentTerm(new Date(at), getDb()))?.id ?? null);
    }),
    component(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      await today();
    }),
    component(() => getCurrentTerm(otherDay)),
  );

const outside = await countQueries(async () => {
  await getCurrentTerm(new Date(at));
  await getCurrentTerm(new Date(at));
});
const first = await countQueries(screen);
const second = await countQueries(screen);
const withTransaction = await countQueries(() =>
  render(
    component(today),
    component(async () => {
      await today();
      await getDb().transaction((tx) => getCurrentTerm(new Date(at), tx));
    }),
  ),
);

const alone = await countQueries(() => getPerson360(personId));
const person = await countQueries(() =>
  render(
    component(() => getPerson360(personId)),
    component(() => getPerson360(personId)),
  ),
);

const termId = seen[0];
const lists = await countQueries(async () => {
  await listCompliance(termId);
  await complianceSummary(termId);
});
const compliance = await countQueries(() =>
  render(
    component(() => listCompliance(termId)),
    component(() => complianceSummary(termId)),
  ),
);

console.log(
  "${MARK}" +
    JSON.stringify({
      term: {
        seen: [...new Set(seen)],
        outside: reads(outside.queries, "term"),
        render: reads(first.queries, "term"),
        nextRender: reads(second.queries, "term"),
        withTransaction: reads(withTransaction.queries, "term"),
      },
      person: {
        found: alone.result?.person.id === personId,
        alone: alone.queries.length,
        render: person.queries.length,
      },
      snapshots: {
        outside: reads(lists.queries, "permanence_snapshot"),
        render: reads(compliance.queries, "permanence_snapshot"),
      },
    }),
);
await closeDb();
`;

interface RenderReads {
  term: {
    /** Los términos distintos que recibieron los componentes que preguntaron por hoy. */
    seen: Array<string | null>;
    outside: number;
    render: number;
    nextRender: number;
    withTransaction: number;
  };
  person: { found: boolean; alone: number; render: number };
  snapshots: { outside: number; render: number };
}

function countInServerRender(personId: string): RenderReads {
  const result = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", script],
    {
      cwd: root,
      env: { ...process.env, RENDER_READS_PERSON_ID: personId },
      encoding: "utf8",
      timeout: 60_000,
      killSignal: "SIGKILL",
    },
  );
  const line = result.stdout.split("\n").find((item) => item.startsWith(MARK));
  if (result.status !== 0 || !line) {
    throw new Error(
      `el render de prueba no terminó (salida ${result.status}): ${result.error?.message ?? result.stderr}`,
    );
  }
  return JSON.parse(line.slice(MARK.length)) as RenderReads;
}

let counted: RenderReads;
let currentTermId: string | null = null;

beforeAll(async () => {
  await truncateAll();
  const personId = await seedMember("persona.render@eafit.edu.co");
  currentTermId = (await getCurrentTerm())?.id ?? null;
  counted = countInServerRender(personId);
}, 90_000);

describe("el término de hoy dentro de un render de servidor", () => {
  it("se lee una vez aunque lo pidan cuatro componentes, uno con el pool dicho a mano, y otro día se lee aparte", () => {
    expect(currentTermId).not.toBeNull();
    expect(counted.term.seen).toEqual([currentTermId]);
    expect(counted.term.render).toBe(2);
  });

  it("no pasa de un request al siguiente: el render que sigue vuelve a leer", () => {
    expect(counted.term.nextRender).toBe(2);
  });

  it("una transacción lo lee por su conexión aunque el render ya lo tenga", () => {
    expect(counted.term.withTransaction).toBe(2);
  });

  it("fuera de un render cada llamada consulta, también con el react de servidor", () => {
    expect(counted.term.outside).toBe(2);
  });
});

describe("la Persona 360 dentro de un render de servidor", () => {
  it("se lee una vez para el título y para la pantalla", () => {
    expect(counted.person.found).toBe(true);
    expect(counted.person.alone).toBeGreaterThan(0);
    expect(counted.person.render).toBe(counted.person.alone);
  });
});

describe("los snapshots de Cumplimiento dentro de un render de servidor", () => {
  it("se leen una vez para las filas y para el resumen, y fuera de un render una vez cada uno", () => {
    expect(counted.snapshots.render).toBe(1);
    expect(counted.snapshots.outside).toBe(2);
  });
});
