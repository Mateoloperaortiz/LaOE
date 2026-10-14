import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { proposalReason } from "@/modules/permanence/domain/permanence-pure";
import { tList } from "@/shared/copy";
import {
  DOMAIN_REASONS,
  INDEX_PAIRS,
  INDEXED_BUT_NOT_LABELS,
  type IndexPair,
  type LabelPair,
  NAMED_READS,
  PAIRS,
  UNDONE_UNEVEN_PAIRS,
  UNEVEN_PAIRS,
  UNSEEN_PAIRS,
  UNZIPPED_FIELDS,
  ZIP_PAIRS,
} from "./enum-label-pairs.table";

// La red de la migración de las etiquetas por valor (DT-011, spec #242, ADR-126 regla 1). Hoy el
// código lee la etiqueta de un valor por su posición en una lista del catálogo de textos: el
// `indexOf` del valor en su enum va de subíndice de la lista. Esta prueba fija, par por par, qué
// posición literal le toca a cada valor, para que pasar a leer por valor no cambie ninguna
// etiqueta. Compara posiciones y no redacciones: lo que no puede ver es que alguien reordene las
// piezas de una lista en docs/14-copy-y-textos.md, porque la prueba y el código leen la misma
// lista (DT-365). La fila que una migración deja sin copia local pierde ese archivo de `copies`.
// Las constantes que guardan a mano la posición de cada valor no llevan `indexOf` y van en su
// propia tabla, `INDEX_PAIRS`: la migración de la spec no las toca (DT-366).

const ONE_TO_ONE = [...PAIRS, ...UNSEEN_PAIRS];
const JOBS = "src/modules/crm/jobs.ts";

/** Los valores de un par, en el orden de sus posiciones. */
function valuesOf(pair: { positions: Record<string, number> }): string[] {
  return Object.entries(pair.positions)
    .sort(([, a], [, b]) => a - b)
    .map(([value]) => value);
}

/** El texto sin espacios ni la coma final de un arreglo, para buscar un literal como esté partido. */
function squash(text: string): string {
  return text.replace(/\s+/g, "").replace(/,\]/g, "]");
}

function sourceOf(file: string): string {
  return squash(readFileSync(path.resolve(file), "utf8"));
}

function literal(values: readonly string[]): string {
  return squash(JSON.stringify(values));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".generated.ts") ? [file] : [];
  });
}

/** Cada arreglo literal de textos del archivo que trae justo esos valores, en el orden que sea. Un
 * archivo puede escribir el mismo orden más de una vez (`Setup.tsx` de The Games lo escribía dos:
 * una para el índice y otra para el recorrido), y basta una copia cruzada para cambiar una etiqueta. */
function copiesWritten(file: string, values: readonly string[]): string[] {
  const arrays = sourceOf(file).matchAll(/\[(?:"[^"\]\\]*",?)+\]/g);
  return [...arrays]
    .map(([text]) => text)
    .filter((text) => {
      const items: string[] = JSON.parse(text);
      return items.length === values.length && values.every((value) => items.includes(value));
    });
}

/** Las listas que un archivo lee con ese orden escrito en el subíndice (`lista[["A", "B"].indexOf(`):
 * el código de cada una, sea un `tList` en el sitio o una variable del archivo que sale de uno. Si
 * la variable no sale de un `tList` del archivo, queda su nombre. */
function listsReadInline(file: string, values: readonly string[]): string[] {
  const raw = readFileSync(path.resolve(file), "utf8");
  const quoted = values.map((value) => `"${value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")}"`);
  const order = `\\[\\s*${quoted.join("\\s*,\\s*")}\\s*,?\\s*\\]`;
  const reads = raw.matchAll(
    new RegExp(`(?:tList\\("(T-\\d+)"\\)|\\b([\\w$]+))\\s*\\[\\s*\\(?\\s*${order}`, "g"),
  );
  return [...reads].flatMap(([, code, name = ""]) => {
    if (code) {
      return [code];
    }
    const sources = raw.matchAll(new RegExp(`\\b${name}\\s*=\\s*tList\\("(T-\\d+)"\\)`, "g"));
    const codes = [...sources].map(([, source = ""]) => source);
    return codes.length > 0 ? codes : [name];
  });
}

/** El objeto de una constante de posiciones, leído del código, y si lo cierra un `as const`. */
function indexConstant(file: string, name: string) {
  const match = new RegExp(`const${name}(?::[^=]+)?=\\{([^{}]*)\\}(asconst)?;`).exec(
    sourceOf(file),
  );
  if (!match) {
    return null;
  }
  const entries = (match[1] ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => {
      const [value = "", position = ""] = entry.split(":");
      return [value, Number(position)] as const;
    });
  return { positions: Object.fromEntries(entries), literal: match[2] !== undefined };
}

function named(pair: IndexPair): string {
  return `${pair.code} × ${pair.order} de ${pair.file}`;
}

const withCanonical = ONE_TO_ONE.filter(
  (pair): pair is LabelPair & { canonical: readonly string[] } => pair.canonical !== undefined,
);
const withLabel = ONE_TO_ONE.filter(
  (pair): pair is LabelPair & { label: (value: string) => string } => pair.label !== undefined,
);
const copies = ONE_TO_ONE.flatMap((pair) =>
  (pair.copies ?? []).map((file) => ({ file, code: pair.code, order: pair.order, pair })),
);
/** Las copias que están escritas en el subíndice de la lectura, y no en una constante aparte. */
const inlineCopies = copies.filter(
  ({ file, pair }) => listsReadInline(file, valuesOf(pair)).length > 0,
);

describe("la tabla de los pares", () => {
  it("trae los 85 pares que salen de las expresiones de la spec y 19 que esas expresiones no ven", () => {
    expect(PAIRS).toHaveLength(81);
    expect(UNEVEN_PAIRS.filter((pair) => pair.seen)).toHaveLength(1);
    // Los que completan los 85 son el par de largo distinto de T-791, que la migración deshizo, el
    // de T-427, que dejó el `zip` por posiciones escritas, y el de T-801, que dejó de ser un par: la
    // pestaña de permanencia lee el número que le da el dominio.
    expect(UNDONE_UNEVEN_PAIRS.filter((pair) => pair.seen)).toHaveLength(1);
    expect(UNZIPPED_FIELDS.code).toBe("T-427");
    expect(DOMAIN_REASONS).toMatchObject({ code: "T-801", seen: true });
    // Dieciocho uno a uno y el de largo distinto de T-566, también deshecho; el de T-2174 entró
    // con DT-370.
    expect(UNSEEN_PAIRS).toHaveLength(18);
    expect(UNEVEN_PAIRS.filter((pair) => !pair.seen)).toHaveLength(0);
    expect(UNDONE_UNEVEN_PAIRS.filter((pair) => !pair.seen)).toHaveLength(1);
  });

  it("no repite un par", () => {
    const keys = [
      ...ONE_TO_ONE.map((pair) => `${pair.code} × ${valuesOf(pair).join(",")}`),
      ...UNEVEN_PAIRS.map((pair) => `${pair.code} × ${pair.tuple.join(",")}`),
    ];
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it("dice de dónde sale el orden de cada par: una tupla exportada o una copia escrita en un archivo", () => {
    expect(
      ONE_TO_ONE.filter((pair) => !pair.canonical && !pair.copies?.length).map((pair) => pair.code),
    ).toEqual([]);
  });
});

describe("cada valor lee una posición literal de su lista", () => {
  it.each(ONE_TO_ONE)("$code trae una pieza por cada valor de $order", (pair) => {
    const positions = Object.values(pair.positions).sort((a, b) => a - b);
    expect(positions).toEqual(positions.map((_, index) => index));
    expect(tList(pair.code)).toHaveLength(positions.length);
  });

  it.each(withCanonical)("$order sigue en el orden que $code lee por posición", (pair) => {
    expect(Object.fromEntries(pair.canonical.map((value, index) => [value, index]))).toEqual(
      pair.positions,
    );
  });

  it.each(copies)("$file escribe el orden de $order que $code lee por posición", ({
    file,
    pair,
  }) => {
    expect(sourceOf(file)).toContain(literal(valuesOf(pair)));
  });

  it.each(copies)("$file no escribe en otro orden ninguna de sus copias de $order ($code)", ({
    file,
    pair,
  }) => {
    const values = valuesOf(pair);
    const written = copiesWritten(file, values);
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter((text) => text !== literal(values))).toEqual([]);
  });

  // Donde el orden está escrito en el subíndice se puede fijar también el sitio: qué lista lee.
  it.each(
    inlineCopies,
  )("$file lee $code, y ninguna lista sin su par, con el orden de $order escrito en el subíndice", ({
    file,
    pair,
  }) => {
    const values = valuesOf(pair);
    const paired = ONE_TO_ONE.filter(
      (item) => item.copies?.includes(file) && valuesOf(item).join() === values.join(),
    ).map((item) => item.code);
    const read = listsReadInline(file, values);
    expect(read).toContain(pair.code);
    expect(read.filter((code) => !paired.includes(code as never))).toEqual([]);
  });

  it.each(
    withLabel,
  )("la etiqueta de cada valor de $order es la pieza de $code de su posición", (pair) => {
    const list: readonly string[] = tList(pair.code);
    const values = valuesOf(pair);
    expect(Object.fromEntries(values.map((value) => [value, pair.label(value)]))).toEqual(
      Object.fromEntries(values.map((value) => [value, list[pair.positions[value] ?? -1]])),
    );
  });

  // Lo que ve la persona cuando no hay etiqueta espera la decisión abierta 75: hasta entonces el
  // respaldo es el de hoy, el valor crudo. Un `Record` literal que herede de `Object.prototype`
  // devolvería una función para `constructor` o `toString` y el respaldo no entraría.
  it.each(
    withLabel,
  )("un valor que $order no trae sale tal cual, sin etiqueta de $code (decisión abierta 75)", (pair) => {
    const strangers = ["NO_EXISTE", "constructor", "toString", "hasOwnProperty", "__proto__"];
    expect(strangers.map((value) => pair.label(value))).toEqual(strangers);
  });
});

describe("los pares que no son uno a uno", () => {
  it.each(
    UNEVEN_PAIRS,
  )("$code trae $pieces piezas y $order de $file no tiene ese largo", (pair) => {
    expect(tList(pair.code)).toHaveLength(pair.pieces);
    expect(pair.tuple.length).not.toBe(pair.pieces);
    const source = sourceOf(pair.file);
    expect(source).toContain(literal(pair.tuple));
    expect(source).toContain(squash(pair.read));
    for (const [value, position] of Object.entries(pair.positions)) {
      expect(pair.tuple).toContain(value);
      expect(position).toBeLessThan(pair.pieces);
    }
  });

  it("donde la misma lista tiene un par uno a uno, cada valor lee la misma posición en los dos", () => {
    const shared = UNEVEN_PAIRS.flatMap((uneven) =>
      ONE_TO_ONE.filter((pair) => pair.code === uneven.code).map((pair) => ({ uneven, pair })),
    );
    expect(shared.map(({ uneven }) => `${uneven.code} × ${uneven.order}`)).toEqual([
      "T-597 × CONSOLE_STATUSES",
    ]);
    for (const { uneven, pair } of shared) {
      expect(pair.positions).toMatchObject(uneven.positions);
    }
  });
});

describe("el par de largo distinto de T-801 que armaba la pestaña de permanencia", () => {
  it("la pestaña ya no arma el subíndice con la posición de la decisión: lee el número que le da el dominio", () => {
    const source = sourceOf(DOMAIN_REASONS.file);
    for (const written of DOMAIN_REASONS.gone) {
      expect(source).not.toContain(squash(written));
    }
    expect(source).toContain(squash(DOMAIN_REASONS.read));
    expect(UNEVEN_PAIRS.map((pair) => pair.code)).not.toContain(DOMAIN_REASONS.code);
  });

  it("la lista sigue trayendo sus seis motivos, y la posición que leía cada decisión es el motivo que hoy le da el dominio", () => {
    expect(tList(DOMAIN_REASONS.code)).toHaveLength(DOMAIN_REASONS.pieces);
    const positions = Object.values(DOMAIN_REASONS.positions);
    expect(new Set(positions).size).toBe(positions.length);
    expect(Math.max(...positions)).toBeLessThan(DOMAIN_REASONS.pieces);
    // Continuar, la prueba y la salida de un comité llevan su motivo en la propuesta: el dominio no
    // lee el resultado para darlo, así que acá va vacío.
    // Tampoco hay motivo guardado: es el que el dominio le da a la propuesta de una decisión que no lo trae.
    const unread = {} as Parameters<typeof proposalReason>[1];
    for (const [decision, position] of Object.entries(DOMAIN_REASONS.positions)) {
      expect(
        proposalReason(null, unread, decision as Parameters<typeof proposalReason>[2]),
        decision,
      ).toBe(position);
    }
  });
});

describe("los pares de largo distinto que la migración deshizo", () => {
  it.each(
    UNDONE_UNEVEN_PAIRS,
  )("$file ya no lee $code por la posición de $order: cada valor lee por valor la pieza que leía", (pair) => {
    const source = sourceOf(pair.file);
    for (const written of pair.gone) {
      expect(source).not.toContain(squash(written));
    }
    expect(source).toContain(squash(pair.read));
    expect(NAMED_READS).toContainEqual({
      file: pair.file,
      order: pair.by,
      code: pair.code,
      own: false,
    });
    const twin = ONE_TO_ONE.find(
      (item) => item.code === pair.code && item.canonical === pair.canonical,
    );
    expect(twin?.positions).toMatchObject(pair.positions);
    expect(tList(pair.code)).toHaveLength(pair.canonical.length);
  });
});

describe("las constantes que guardan la posición de cada valor", () => {
  it("son diez en seis archivos, con once lecturas, y en siete la tupla de la lista no cuida el largo", () => {
    expect(INDEX_PAIRS).toHaveLength(10);
    expect(new Set(INDEX_PAIRS.map((pair) => pair.file)).size).toBe(6);
    expect(INDEX_PAIRS.flatMap((pair) => pair.reads)).toHaveLength(11);
    expect(INDEX_PAIRS.filter((pair) => !pair.literal)).toHaveLength(7);
  });

  it.each(
    INDEX_PAIRS,
  )("$order de $file le da a cada valor la posición de $code que dice la tabla", (pair) => {
    expect(indexConstant(pair.file, pair.order)).toEqual({
      positions: pair.positions,
      literal: pair.literal,
    });
    const positions = Object.values(pair.positions);
    expect(new Set(positions).size).toBe(positions.length);
    expect(tList(pair.code)).toHaveLength(pair.pieces);
    expect(Math.max(...positions)).toBeLessThan(pair.pieces);
  });

  it.each(
    INDEX_PAIRS,
  )("$file lee $code con $order donde dice la tabla, y en ningún otro sitio", (pair) => {
    const source = sourceOf(pair.file);
    for (const written of [...pair.reads, ...(pair.list ? [pair.list] : [])]) {
      expect(source).toContain(squash(written));
    }
    expect(source.split(`[${pair.order}[`)).toHaveLength(pair.reads.length + 1);
  });

  // El trinquete de la forma: una lectura nueva `lista[X_INDEX[valor]]` entra a la tabla o, si no
  // es una etiqueta, a la lista de lo ajeno con su razón. Una fila que sobra también cae.
  it("ninguna otra lectura de src lleva de subíndice una constante indexada por un valor", () => {
    const found = new Set<string>();
    for (const file of sourceFiles("src")) {
      const reads = readFileSync(file, "utf8").matchAll(/\[\s*([A-Z][A-Z0-9_]*)\[[^\]]+\]\s*\]/g);
      for (const [, order] of reads) {
        found.add(`${file} × ${order}`);
      }
    }
    expect([...found].sort()).toEqual(
      [...INDEX_PAIRS, ...INDEXED_BUT_NOT_LABELS]
        .map(({ file, order }) => `${file} × ${order}`)
        .sort(),
    );
  });

  it("donde la lista tiene un par uno a uno con esos valores, la constante les da la misma posición", () => {
    const twin = (index: IndexPair) =>
      ONE_TO_ONE.find(
        (pair) =>
          pair.code === index.code &&
          Object.keys(index.positions).every((value) => valuesOf(pair).includes(value)),
      );
    expect(INDEX_PAIRS.filter((index) => !twin(index)).map(named)).toEqual([
      "T-493 × STATUS_INDEX de src/app/admin/sistema/importaciones/page.tsx",
      "T-2511 × STATE_INDEX de src/app/admin/gamificacion/campanas/page.tsx",
      "T-3207 × MOTIVES de src/shared/lib/image-decoder.ts",
    ]);
    for (const index of INDEX_PAIRS) {
      expect(twin(index)?.positions ?? index.positions).toMatchObject(index.positions);
    }
  });

  it("dos tienen menos valores que piezas trae su lista: con ellas se cuentan los pares de largo distinto que quedan y los que la migración deshizo", () => {
    const uneven = INDEX_PAIRS.filter((pair) => Object.keys(pair.positions).length !== pair.pieces);
    expect(uneven.map(named)).toEqual([
      "T-2473 × FAMILY_INDEX de src/app/app/gh-points/coleccion/page.tsx",
      "T-2511 × STATE_INDEX de src/app/admin/gamificacion/campanas/page.tsx",
    ]);
    // Eran cuatro con el de T-801, que dejó la pestaña de permanencia (ADR-128 regla 1).
    expect(UNEVEN_PAIRS.length + uneven.length).toBe(3);
    expect(UNDONE_UNEVEN_PAIRS).toHaveLength(2);
  });
});

describe("las etiquetas de la línea de tiempo en crm/jobs.ts", () => {
  // Qué etiqueta le toca a cada valor lo fija tests/integration/crm-timeline-labels.test.ts, que pasa
  // por `labels()` y lee el resumen guardado. Acá queda lo que solo se ve en el texto: que el `zip`
  // ya no existe, qué posición escrita lee cada campo del par de largo distinto y que cada orden
  // propio sigue escrito como en la tabla.
  it("nueve de los diez pares se leen por valor y el de largo distinto ya no pasa por un zip", () => {
    const source = sourceOf(JOBS);
    expect(ZIP_PAIRS).toHaveLength(10);
    expect(ZIP_PAIRS.filter((pair) => pair.own)).toHaveLength(4);
    for (const { key, order, code } of ZIP_PAIRS) {
      expect(source).toContain(
        squash(
          code === UNZIPPED_FIELDS.code
            ? `${key}: fieldLabels()`
            : `${key}: tLabels("${code}", ${order})`,
        ),
      );
    }
    for (const written of UNZIPPED_FIELDS.gone) {
      expect(source).not.toContain(squash(written));
    }
  });

  it("cada campo de un evento de persona lee la posición escrita de T-427 que dice la tabla", () => {
    const fields = Object.entries(UNZIPPED_FIELDS.positions).sort(([, a], [, b]) => a - b);
    expect(fields.map(([, position]) => position)).toEqual(fields.map((_, index) => index));
    expect(tList(UNZIPPED_FIELDS.code)).toHaveLength(UNZIPPED_FIELDS.pieces);
    expect(fields.length).toBeLessThan(UNZIPPED_FIELDS.pieces);
    // La desestructuración le da a cada nombre la posición en la que está escrito.
    expect(sourceOf(JOBS)).toContain(
      `const[${fields.map(([field]) => field).join(",")}]=tList("${UNZIPPED_FIELDS.code}");`,
    );
  });

  it.each(
    ZIP_PAIRS.filter((pair) => pair.code !== UNZIPPED_FIELDS.code),
  )("$key lee $code con $order, en el orden de la tabla", ({ order, code, own }) => {
    const source = sourceOf(JOBS);
    const pair = ONE_TO_ONE.find((item) => item.code === code);
    const values = pair ? valuesOf(pair) : [];
    expect(values.length).toBeGreaterThan(0);
    if (own) {
      expect(source).toContain(`const${order}=${literal(values)}asconst;`);
    } else {
      // El orden es una tupla exportada, de `people` o del propio `crm`: la fila de la tabla lo
      // compara con ella.
      expect(pair?.canonical).toBeDefined();
      expect(source).not.toContain(`const${order}=`);
    }
  });
});

describe("los sitios que dejaron el orden del subíndice por una constante con nombre", () => {
  // Con el orden escrito en el subíndice, la prueba de arriba fijaba qué lista leía el archivo con
  // él. `tLabels` solo compara largos, así que `tLabels("T-750", ASSEMBLY_KINDS)` compila: acá
  // queda que cada archivo lee con ese orden la lista de su par, y que el orden es el de la tabla.
  it.each(NAMED_READS)("$file lee $code, y ninguna otra lista, por valor con $order", ({
    file,
    order,
    code,
    own,
  }) => {
    const source = sourceOf(file);
    const reads = [...source.matchAll(new RegExp(`tLabels\\("(T-\\d+)",${order}\\)`, "g"))];
    const pair = ONE_TO_ONE.find((item) => item.code === code);
    expect(reads.map(([, read]) => read)).toEqual([code]);
    expect(pair).toBeDefined();
    if (own) {
      expect(source).toContain(`const${order}=${literal(pair ? valuesOf(pair) : [])}asconst`);
    } else {
      // El orden es una tupla exportada: la fila de la tabla lo compara con ella.
      expect(pair?.canonical).toBeDefined();
      expect(source).not.toContain(`const${order}=`);
    }
  });
});
