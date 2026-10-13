import ts from "typescript";
import type { TextFile } from "./ratchet";

// El lector de `tests/unit/api-error-texts.test.ts` (DT-345, ADR-129 regla 13): saca de los archivos
// de `src/app/api` cada texto con que una ruta responde un error. Lee con el compilador de
// TypeScript, no con una expresión regular, porque un texto puede estar adentro de un ternario
// (`ok ? "OK" : "Token inválido"`), partido en varios renglones o pasar por una función de la carpeta.
//
// Qué mira. Una respuesta es `new Response(cuerpo, init)` o `new NextResponse(cuerpo, init)`,
// `Response.json(cuerpo, init)` o `NextResponse.json(cuerpo, init)`, o la llamada a una función de la
// carpeta que arma una de esas con lo que le pasan (hoy `hubJson`): esas funciones las descubre, no
// las trae en una lista. De una respuesta que sale con 400 o más, o con un status que no está escrito
// ahí, toma el cuerpo si es texto y, si es un objeto, cada clave, también las de un objeto o una lista
// de adentro y las de un objeto que el cuerpo esparce (`...(mal ? { error: "…" } : {})`): de `error`,
// lo que traiga; de las demás, solo un texto escrito o un `t(…)`. El cuerpo, sea texto o JSON, puede
// ser un ternario o ir detrás de un `??` o de un `||`: lee cada rama, con el status de su rama si el
// status pregunta lo mismo. Lo que sale con menos de 400 no cuenta, tampoco si viaja en `error`.
//
// Además toma la clave `error` de todo objeto del archivo que no haya leído así, sin status: el
// cuerpo armado en una variable (`health`) y el que llega a la respuesta por una forma que no conoce,
// como el argumento de una función de fuera. Lo que no reconoce cae ahí: no se calla.
//
// Qué no ve, y por eso es un trinquete y no una demostración: el texto que una ruta le pase a una
// función de fuera de `src/app/api`, el que llegue por una variable (ese sale como `passed`, con el
// nombre de la variable y no con su texto), una clave que no sea `error` en un cuerpo armado aparte
// o en uno que pasa por una función que no conoce, la función de la carpeta que saque su parámetro de
// otro modo que como el cuerpo entero o el valor de una clave suya (`{ error: { message } }`), y dos
// funciones de la carpeta que se llamen igual. Tampoco lee una respuesta de fuera de `src/app/api`.

/** De dónde sale el texto: escrito en la ruta, del catálogo por su código, o una expresión que la ruta deja pasar. */
export type ErrorSource =
  | { kind: "literal"; text: string }
  | { kind: "catalog"; code: string }
  | { kind: "passed"; expression: string };

export interface ErrorText {
  /** La ruta del archivo, como llegó. */
  file: string;
  /** El status con que sale, o `null` si no está escrito junto al texto. */
  status: number | null;
  /** `"body"` si el texto es el cuerpo entero; si viaja en un JSON, su clave (`"error"`). */
  via: string;
  source: ErrorSource;
}

/** El status de una respuesta: la expresión que lo trae, el número que vale si no se escribe, o `null` si no se sabe. */
type Status = ts.Expression | number | null;

/** Una respuesta: su cuerpo, cómo viaja (`null` si es un JSON del que se leen las claves) y su status. */
interface Site {
  body: ts.Expression | undefined;
  via: string | null;
  status: Status;
}

/** Una función de la carpeta que arma la respuesta con lo que le pasan. */
interface Helper {
  /** La posición del parámetro que trae el cuerpo o el texto, y su nombre adentro de la función. */
  body: number;
  parameter: string;
  via: string | null;
  /** La posición del parámetro del status, si lo recibe, y lo que vale cuando no se lo pasan o no lo recibe. */
  statusAt: number | null;
  status: number | null;
}

type Helpers = ReadonlyMap<string, Helper>;

/**
 * La lectura de un archivo: las funciones de la carpeta y los objetos que ya miró, porque los leyó
 * con el status de su respuesta o porque salen bien. Los demás quedan para la lectura sin status.
 */
interface Reading {
  helpers: Helpers;
  read: Set<ts.Node>;
}

const NO_HELPERS: Helpers = new Map();
const RESPONSES = new Set(["Response", "NextResponse"]);

function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

/** El status escrito en el `init` de una respuesta: sin `init` o sin la clave es 200, y detrás de un `...` no se sabe. */
function statusIn(init: ts.Expression | undefined): Status {
  if (!init) return 200;
  const node = unwrap(init);
  if (!ts.isObjectLiteralExpression(node)) return null;
  let unwritten: Status = 200;
  for (const property of node.properties) {
    if (ts.isSpreadAssignment(property)) unwritten = null;
    if (ts.isPropertyAssignment(property) && property.name.getText() === "status") {
      return property.initializer;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === "status") {
      return property.name;
    }
  }
  return unwritten;
}

function siteOf(node: ts.Node, helpers: Helpers): Site | null {
  if (ts.isNewExpression(node)) {
    if (!ts.isIdentifier(node.expression) || !RESPONSES.has(node.expression.text)) return null;
    const [body, init] = node.arguments ?? [];
    return { body, via: "body", status: statusIn(init) };
  }
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "json" &&
    ts.isIdentifier(callee.expression) &&
    RESPONSES.has(callee.expression.text)
  ) {
    const [body, init] = node.arguments;
    return { body, via: null, status: statusIn(init) };
  }
  const helper = ts.isIdentifier(callee) ? helpers.get(callee.text) : undefined;
  if (!helper) return null;
  const passed = helper.statusAt === null ? undefined : node.arguments[helper.statusAt];
  return { body: node.arguments[helper.body], via: helper.via, status: passed ?? helper.status };
}

function statusesOf(status: Status): Array<number | null> {
  if (status === null || typeof status === "number") return [status];
  const node = unwrap(status);
  if (ts.isNumericLiteral(node)) return [Number(node.text)];
  if (ts.isConditionalExpression(node)) {
    return [...statusesOf(node.whenTrue), ...statusesOf(node.whenFalse)];
  }
  return [null];
}

/**
 * Cada valor que una expresión puede dar, con el status con que saldría. Un ternario da sus dos
 * ramas; si el status es otro ternario con la misma pregunta, cada rama va con el status de su rama
 * (`ok ? "OK" : "Token inválido"` con `ok ? 200 : 404`), y si no, con todos. El status va como está
 * escrito, sin resolver, para que un ternario de más adentro todavía encuentre su pareja.
 */
function leavesOf(
  value: ts.Expression,
  status: Status,
): Array<{ node: ts.Expression; status: Status }> {
  const node = unwrap(value);
  if (ts.isConditionalExpression(node)) {
    const written = status !== null && typeof status !== "number" ? unwrap(status) : null;
    const paired =
      written &&
      ts.isConditionalExpression(written) &&
      written.condition.getText() === node.condition.getText()
        ? written
        : null;
    return [
      ...leavesOf(node.whenTrue, paired ? paired.whenTrue : status),
      ...leavesOf(node.whenFalse, paired ? paired.whenFalse : status),
    ];
  }
  const operator = ts.isBinaryExpression(node) ? node.operatorToken.kind : null;
  if (
    ts.isBinaryExpression(node) &&
    (operator === ts.SyntaxKind.QuestionQuestionToken || operator === ts.SyntaxKind.BarBarToken)
  ) {
    return [...leavesOf(node.left, status), ...leavesOf(node.right, status)];
  }
  return [{ node, status }];
}

/** Marca como mirados los objetos de lo que sale bien: nada de adentro es un error. */
function settle(node: ts.Node, read: Set<ts.Node>): void {
  if (ts.isObjectLiteralExpression(node)) read.add(node);
  ts.forEachChild(node, (child) => settle(child, read));
}

/** La función con nombre que encierra a un nodo, si la hay. */
function enclosingFunction(node: ts.Node): string | null {
  for (let parent = node.parent; parent; parent = parent.parent) {
    const named = namedFunction(parent);
    if (named) return named.name;
  }
  return null;
}

function sourceOf(node: ts.Expression, helpers: Helpers): ErrorSource | null {
  if (ts.isStringLiteralLike(node)) return { kind: "literal", text: node.text };
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {
    if (node.text === "undefined") return null;
    // El parámetro de una función de la carpeta no es un texto: lo es lo que le pasa cada llamada.
    const helper = helpers.get(enclosingFunction(node) ?? "");
    if (helper?.parameter === node.text) return null;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const [code] = node.arguments;
    if (node.expression.text === "t" && code && ts.isStringLiteralLike(code)) {
      return { kind: "catalog", code: code.text };
    }
  }
  return { kind: "passed", expression: node.getText().replace(/\s+/g, " ") };
}

type Found = Omit<ErrorText, "file">;

/** Los textos de un valor que sale por `via`. `anything` dice si cuenta también lo que no es un texto escrito ni un `t(…)`. */
function fromValue(
  via: string,
  value: ts.Expression,
  status: Status,
  anything: boolean,
  reading: Reading,
): Found[] {
  return leavesOf(value, status).flatMap((leaf) => {
    const failing = statusesOf(leaf.status).filter((code) => code === null || code >= 400);
    if (failing.length === 0) {
      settle(leaf.node, reading.read);
      return [];
    }
    // Un objeto o una lista adentro del cuerpo: sus claves y sus elementos salen con el mismo status.
    if (ts.isObjectLiteralExpression(leaf.node)) return fromObject(leaf.node, leaf.status, reading);
    if (ts.isArrayLiteralExpression(leaf.node)) {
      return leaf.node.elements.flatMap((element) =>
        fromValue(via, element, leaf.status, anything, reading),
      );
    }
    const source = sourceOf(leaf.node, reading.helpers);
    if (!source || (source.kind === "passed" && !anything)) return [];
    return failing.map((code) => ({ status: code, via, source }));
  });
}

function fromObject(body: ts.ObjectLiteralExpression, status: Status, reading: Reading): Found[] {
  reading.read.add(body);
  return body.properties.flatMap((property) => {
    if (ts.isPropertyAssignment(property)) {
      const key = ts.isStringLiteralLike(property.name)
        ? property.name.text
        : property.name.getText();
      return fromValue(key, property.initializer, status, key === "error", reading);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      const key = property.name.text;
      return fromValue(key, property.name, status, key === "error", reading);
    }
    if (ts.isSpreadAssignment(property)) {
      // `...(mal ? { error: "…" } : {})`: las claves del objeto que se esparce son claves del cuerpo.
      return leavesOf(property.expression, status).flatMap((leaf) =>
        ts.isObjectLiteralExpression(leaf.node) ? fromObject(leaf.node, leaf.status, reading) : [],
      );
    }
    return [];
  });
}

function namedFunction(node: ts.Node): { name: string; fn: ts.FunctionLikeDeclaration } | null {
  if (ts.isFunctionDeclaration(node) && node.name) return { name: node.name.text, fn: node };
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return { name: node.name.text, fn: node.initializer };
  }
  return null;
}

/** El parámetro que una respuesta saca como cuerpo, o como el valor de una de sus claves. */
function carried(
  site: Site,
  parameters: readonly string[],
): { at: number; name: string; via: string | null } | null {
  if (!site.body) return null;
  const body = unwrap(site.body);
  if (ts.isIdentifier(body)) {
    const at = parameters.indexOf(body.text);
    return at < 0 ? null : { at, name: body.text, via: site.via };
  }
  if (site.via !== null || !ts.isObjectLiteralExpression(body)) return null;
  for (const property of body.properties) {
    const value = ts.isPropertyAssignment(property)
      ? unwrap(property.initializer)
      : ts.isShorthandPropertyAssignment(property)
        ? property.name
        : null;
    const name = value && ts.isIdentifier(value) ? value.text : "";
    const at = parameters.indexOf(name);
    if (at >= 0 && property.name) return { at, name, via: property.name.getText() };
  }
  return null;
}

/** Las funciones de un archivo que arman una respuesta con un parámetro suyo. */
function helpersIn(source: ts.SourceFile, helpers: Map<string, Helper>): void {
  const visit = (node: ts.Node): void => {
    const named = namedFunction(node);
    if (named?.fn.body) {
      const parameters = named.fn.parameters.map((parameter) => parameter.name.getText());
      const inside = (child: ts.Node): void => {
        const site = siteOf(child, NO_HELPERS);
        const text = site && carried(site, parameters);
        if (site && text) {
          const written = site.status;
          const status = written !== null && typeof written !== "number" ? unwrap(written) : null;
          const received =
            status && ts.isIdentifier(status)
              ? named.fn.parameters.find((parameter) => parameter.name.getText() === status.text)
              : undefined;
          const [only] = statusesOf(received ? (received.initializer ?? null) : written);
          helpers.set(named.name, {
            body: text.at,
            parameter: text.name,
            via: text.via,
            statusAt: received ? named.fn.parameters.indexOf(received) : null,
            status: only ?? null,
          });
        }
        ts.forEachChild(child, inside);
      };
      inside(named.fn.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function textsIn(file: string, source: ts.SourceFile, helpers: Helpers): ErrorText[] {
  const found: Found[] = [];
  const reading: Reading = { helpers, read: new Set() };
  const visit = (node: ts.Node): void => {
    const site = siteOf(node, helpers);
    if (site?.body) {
      // Un cuerpo JSON se lee como el valor de una clave que no es `error`: de un objeto o una lista,
      // lo de adentro; suelto, solo un texto escrito o un `t(…)`.
      found.push(
        ...fromValue(site.via ?? "body", site.body, site.status, site.via !== null, reading),
      );
    } else if (ts.isObjectLiteralExpression(node) && !reading.read.has(node)) {
      // El objeto que ninguna respuesta leyó, porque está armado aparte o porque llega al cuerpo por
      // una forma que el lector no conoce: su clave `error`, sin status.
      found.push(...fromObject(node, null, reading).filter((text) => text.via === "error"));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((text) => ({ file, ...text }));
}

/** Cada texto con que las rutas de esos archivos responden un error, en el orden en que están escritos. */
export function apiErrorTexts(files: readonly TextFile[]): ErrorText[] {
  const sources = files.map(({ path, text }) => ({
    path,
    source: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true),
  }));
  const helpers = new Map<string, Helper>();
  for (const { source } of sources) {
    helpersIn(source, helpers);
  }
  return sources.flatMap(({ path, source }) => textsIn(path, source, helpers));
}

/** La clave de un texto: dónde está, con qué status sale, por dónde viaja y qué es. */
export function errorTextKey(text: ErrorText): string {
  const what =
    text.source.kind === "literal"
      ? JSON.stringify(text.source.text)
      : text.source.kind === "catalog"
        ? `t(${text.source.code})`
        : text.source.expression;
  return `${text.file} › ${text.status ?? "?"} › ${text.via} › ${what}`;
}
