import { describe, expect, it } from "vitest";
import { textos } from "@/shared/copy/textos.generated";
import { apiErrorTexts, type ErrorSource, errorTextKey } from "../helpers/api-error-texts";
import {
  countByKey,
  driftByKey,
  expectReasonedOnce,
  sourceFiles,
  type TextFile,
} from "../helpers/ratchet";
import { API_ERROR_TEXTS, type ErrorTextRow } from "./api-error-texts.table";

// DT-345: las rutas de API responden errores con el texto escrito en la ruta, y varios llegan a una
// pantalla sin haber pasado por `docs/14-copy-y-textos.md`: el que ve quien sube un archivo, y el
// que pinta el navegador cuando a la ruta se llega por un enlace. Esta prueba no cambia ninguno: lee
// `src/app/api` con el compilador de TypeScript, saca cada texto con que una ruta responde un error
// y lo compara con la tabla de al lado, que le pone clase a cada uno (ADR-129 regla 13). Un texto
// nuevo cae hasta que entre a la tabla, que es donde alguien tiene que decir quién lo lee; y pasar
// uno al catálogo, o borrarlo, cae hasta que salga su fila.
//
// Es un trinquete: qué mira y qué no ve está escrito en `tests/helpers/api-error-texts.ts`. No
// decide qué lee la persona. Eso es la decisión abierta 82, y hasta que se tome los textos de clase
// `shown` se quedan como están.

const API = "src/app/api";

type Table = Record<string, readonly ErrorTextRow[]>;

function sourceOf(row: ErrorTextRow): ErrorSource {
  if (row.class === "catalog") return { kind: "catalog", code: row.code };
  if (row.class === "passed") return { kind: "passed", expression: row.expression };
  return { kind: "literal", text: row.text };
}

/** Cada fila de una tabla con la clave del texto que clasifica. */
const rowsOf = (table: Table) =>
  Object.entries(table).flatMap(([file, rows]) =>
    rows.map((row) => ({
      row,
      key: errorTextKey({
        file: `${API}/${file}`,
        status: row.status,
        via: row.via,
        source: sourceOf(row),
      }),
    })),
  );

/** Lo que hay en esos archivos comparado con una tabla, por texto y con su cuenta. */
const drift = (files: readonly TextFile[], table: Table = API_ERROR_TEXTS) =>
  driftByKey(
    countByKey(apiErrorTexts(files), errorTextKey),
    Object.fromEntries(rowsOf(table).map(({ row, key }) => [key, row.count ?? 1])),
  );

const routes = sourceFiles(API);
const rows = rowsOf(API_ERROR_TEXTS);

/** Cuántos textos suman las filas de una clase. */
const total = (wanted: ErrorTextRow["class"]) =>
  rows
    .filter(({ row }) => row.class === wanted)
    .reduce((sum, { row }) => sum + (row.count ?? 1), 0);

const PLANTED = `${API}/sembrado/route.ts`;

/** Lo que el lector saca de una ruta sembrada, sin el nombre del archivo. */
const read = (text: string, ...others: TextFile[]): string[] =>
  apiErrorTexts([...others, { path: PLANTED, text }])
    .map(errorTextKey)
    .map((key) => key.replace(`${PLANTED} › `, ""));

/** Una función de otro archivo de la carpeta que arma la respuesta con el cuerpo que le pasan, como `hubJson`. */
const SHARED: TextFile = {
  path: `${API}/sembrado/shared.ts`,
  text: [
    "export function reply(request: Request, body: unknown, status = 200): Response {",
    "  return NextResponse.json(body, { status, headers: corsOf(request) });",
    "}",
  ].join("\n"),
};

describe("los textos con que las rutas de API responden un error", () => {
  it("están todos en la tabla, cada uno con su clase", () => {
    expect(drift(routes).unlisted).toEqual([]);
  });

  it("una fila que ya no corresponde a ningún texto sale de la tabla: ninguna sobra", () => {
    expect(drift(routes).stale).toEqual([]);
  });

  it("cada fila está una vez, y la de un texto escrito en la ruta dice en una frase quién lo recibe", () => {
    expect(new Set(rows.map(({ key }) => key)).size).toBe(rows.length);
    expectReasonedOnce(
      rows.flatMap(({ row, key }) => ("reader" in row ? [{ key, reason: row.reader }] : [])),
      ({ key }) => key,
    );
  });

  it("el código de una fila del catálogo existe en el inventario", () => {
    const codes = rows.flatMap(({ row }) => (row.class === "catalog" ? [row.code] : []));
    expect(codes.filter((code) => !(code in textos))).toEqual([]);
  });

  it("hoy son 50 escritos en 20 archivos, y 32 los puede leer una persona sin que hayan pasado por el catálogo: qué lee espera la decisión abierta 82", () => {
    const written = rows.filter(({ row }) => row.class === "shown" || row.class === "unread");
    expect({
      shown: total("shown"),
      unread: total("unread"),
      files: new Set(written.map(({ key }) => key.split(" › ")[0])).size,
      catalog: total("catalog"),
      passed: total("passed"),
    }).toEqual({ shown: 32, unread: 18, files: 20, catalog: 11, passed: 11 });
  });
});

describe("un texto sembrado en una ruta de API", () => {
  it.each([
    {
      form: "en la clave error de Response.json",
      code: 'return Response.json({ error: "Texto nuevo" }, { status: 400 });',
      found: ['400 › error › "Texto nuevo"'],
    },
    {
      form: "en la clave error de NextResponse.json",
      code: 'return NextResponse.json({ error: "Texto nuevo" }, { status: 422, headers });',
      found: ['422 › error › "Texto nuevo"'],
    },
    {
      form: "como el cuerpo de new Response",
      code: 'return new Response("Texto nuevo", { status: 404 });',
      found: ['404 › body › "Texto nuevo"'],
    },
    {
      form: "como el cuerpo de new NextResponse",
      code: 'return new NextResponse("Texto nuevo", { status: 404 });',
      found: ['404 › body › "Texto nuevo"'],
    },
    {
      form: "en una rama de un ternario, con el status de su rama y sin el texto de la rama que sale bien",
      code: 'return new Response(ok ? "OK" : "Texto nuevo", { status: ok ? 200 : 404 });',
      found: ['404 › body › "Texto nuevo"'],
    },
    {
      form: "detrás de un ?? que lo deja de respaldo",
      code: 'return new Response(reason ?? "Texto nuevo", { status: 400 });',
      found: ["400 › body › reason", '400 › body › "Texto nuevo"'],
    },
    {
      form: "entre comillas invertidas",
      code: "return Response.json({ error: `Texto nuevo` }, { status: 400 });",
      found: ['400 › error › "Texto nuevo"'],
    },
    {
      form: "con un status que no está escrito ahí",
      code: 'return Response.json({ error: "Texto nuevo" }, { status });',
      found: ['? › error › "Texto nuevo"'],
    },
    {
      form: "en un cuerpo armado en una variable",
      code: 'const body = { error: "Texto nuevo" };\nreturn Response.json(body, { status: 400 });',
      found: ['? › error › "Texto nuevo"'],
    },
    {
      form: "en una clave que no es error",
      code: 'return Response.json({ message: "Texto nuevo", code: reason }, { status: 400 });',
      found: ['400 › message › "Texto nuevo"'],
    },
    {
      form: "en una lista del cuerpo",
      code: 'return Response.json({ errors: ["Texto nuevo", reason] }, { status: 400 });',
      found: ['400 › errors › "Texto nuevo"'],
    },
    {
      form: "en un objeto de adentro del cuerpo",
      code: 'return Response.json({ error: { message: "Texto nuevo", code } }, { status: 400 });',
      found: ['400 › message › "Texto nuevo"'],
    },
    {
      form: "en una variable: cae con el nombre de la variable",
      code: 'const message = "Texto nuevo";\nreturn Response.json({ error: message }, { status: 400 });',
      found: ["400 › error › message"],
    },
    {
      form: "que sale del catálogo: cae con su código",
      code: 'return Response.json({ error: t("T-051") }, { status: 401 });',
      found: ["401 › error › t(T-051)"],
    },
    {
      form: "pasado a una función de la misma ruta que lo saca en la clave error",
      code: [
        "function refuse(text: string, status = 400) {",
        "  return Response.json({ error: text }, { status });",
        "}",
        'const first = refuse("Texto nuevo");',
        'const second = refuse("Otro texto", 409);',
      ].join("\n"),
      found: ['400 › error › "Texto nuevo"', '409 › error › "Otro texto"'],
    },
    {
      form: "pasado a una función flecha que lo saca como cuerpo con un status fijo",
      code: [
        "const forbid = (text: string) => new Response(text, { status: 403 });",
        'return forbid("Texto nuevo");',
      ].join("\n"),
      found: ['403 › body › "Texto nuevo"'],
    },
  ])("$form", ({ code, found }) => {
    expect(read(code)).toEqual(found);
  });

  it("en el cuerpo que se le pasa a una función de otro archivo de la carpeta cae con el status de la llamada, y sin status no cuenta", () => {
    const refused = 'return reply(request, { error: "Texto nuevo" }, 403);';
    expect(read(refused, SHARED)).toEqual(['403 › error › "Texto nuevo"']);
    // Sin el archivo que la declara, la llamada no es una respuesta y el status no se sabe.
    expect(read(refused)).toEqual(['? › error › "Texto nuevo"']);
    expect(read('return reply(request, { note: "Texto nuevo" });', SHARED)).toEqual([]);
  });

  it("no cuenta lo que no es un error ni lo que no trae texto", () => {
    const fine = [
      "return Response.json({ ok: true });",
      'return Response.json({ note: "Listo" }, { status: 201 });',
      'return new Response("OK");',
      "return new Response(null, { status: 404 });",
      "return Response.json({ results: [] }, { status: 401 });",
      "return Response.json({ terms: result.version }, { status: 409 });",
      "return Response.json({ item: { error: item.error, note: `Listo` } });",
      'return new Response(toCsv(headers, rows), { headers: { "content-type": "text/csv" } });',
      "return new Response(null, { status: 302, headers: { location: url } });",
    ];
    expect(read(fine.join("\n"))).toEqual([]);
  });

  it("pone en rojo la comparación hasta que entre a la tabla, y entra con su cuenta", () => {
    const planted: TextFile = {
      path: PLANTED,
      text: [
        'if (!actor) return Response.json({ error: "Texto nuevo" }, { status: 401 });',
        'if (!found) return Response.json({ error: "Texto nuevo" }, { status: 401 });',
      ].join("\n"),
    };
    const key = `${PLANTED} › 401 › error › "Texto nuevo"`;
    const row = { status: 401, via: "error", text: "Texto nuevo", reader: "La de la siembra." };
    const withRow = (count: number): Table => ({
      "sembrado/route.ts": [{ ...row, class: "unread", count }],
    });

    expect(drift([planted], {})).toEqual({ unlisted: [key], stale: [] });
    // Una fila por uno no alcanza para dos, y una por tres sobra.
    expect(drift([planted], withRow(1))).toEqual({ unlisted: [key], stale: [] });
    expect(drift([planted], withRow(2))).toEqual({ unlisted: [], stale: [] });
    expect(drift([planted], withRow(3))).toEqual({ unlisted: [], stale: [key] });
    // El texto se va de la ruta y su fila queda: sobra.
    expect(drift([], withRow(2))).toEqual({ unlisted: [], stale: [key] });
    // Con otro status, por otra clave o con otra clase de origen es otro texto: no lo cubre esa fila.
    const moved = { path: PLANTED, text: planted.text.replaceAll("401", "403") };
    expect(drift([moved], withRow(2))).toEqual({
      unlisted: [key.replace("401", "403")],
      stale: [key],
    });
  });
});
