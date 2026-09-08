import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nspell from "nspell";

// Generación editorial, nunca importada por la app. No usa la red.
const VERSION = "rla-es-2.9-oe-v1";
const root = new URL("../src/modules/participation/data/wordle/", import.meta.url);
const output = new URL(`versions/${VERSION}/`, root);
const check = process.argv.includes("--check");
const require = createRequire(import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) =>
  value
    .trim()
    .normalize("NFC")
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜ]/g, (letter) => ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" })[letter]);
const isFiveLetters = (word) => /^[A-ZÑ]{5}$/.test(word);

if (require("nspell/package.json").version !== "2.1.5") {
  throw new Error("La expansión requiere exactamente nspell 2.1.5.");
}

const sources = JSON.parse(await readFile(new URL("source-manifest.json", root), "utf8"));
const sourceFiles = new Map();
for (const source of sources.files) {
  const bytes = await readFile(new URL(source.file, root));
  if (hash(bytes) !== source.sha256) {
    throw new Error(`La fuente ${source.file} no coincide con su SHA-256 fijado.`);
  }
  sourceFiles.set(source.file, bytes.toString("utf8"));
}

let aff = sourceFiles.get("sources/rla-es-2.9.aff");
let dic = sourceFiles.get("sources/rla-es-2.9.dic");
if (!aff || !dic) throw new Error("Faltan las fuentes RLA-ES.");

// nspell 2.1.5 separa flags UTF-8 con split(''), que rompe pares sustitutos.
// El remapeo conserva las clases completas, incluso ☎ + selector de variante.
const flagRemapping = ["☎️", "🏅", "📏", "🔍", "🔭", "💯", "🥇", "🧠"].map((flag, index) => ({
  flag,
  replacement: String.fromCodePoint(0xe000 + index),
}));
const directives = new Set(["SET", "FLAG", "TRY", "REP", "MAP", "PFX", "SFX"]);
for (const line of aff.split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [directive, flag] = line.split(/\s+/);
  if (!directives.has(directive)) throw new Error(`Directiva no revisada: ${directive}`);
  if (
    (directive === "PFX" || directive === "SFX") &&
    flag.length > 1 &&
    !flagRemapping.some((entry) => entry.flag === flag)
  ) {
    throw new Error(`Flag Unicode no revisado: ${flag}`);
  }
}
for (const { flag, replacement } of flagRemapping) {
  if (aff.includes(replacement) || dic.includes(replacement)) {
    throw new Error("La fuente ya usa un carácter reservado para remapeo.");
  }
  aff = aff.replaceAll(flag, replacement);
  dic = dic.replaceAll(flag, replacement);
}

const spell = nspell({ aff, dic });
// data es interna: fijamos versión, fuentes y conteos; no la usamos en runtime.
const expanded = Object.keys(spell.data);
const allowed = new Set(
  expanded
    .filter((word) => word === word.toLowerCase())
    .map(normalize)
    .filter(isFiveLetters),
);
const baseCount = allowed.size;

const additionsText = await readFile(new URL("accepted-additions.json", root), "utf8");
const additions = JSON.parse(additionsText);
for (const addition of additions) {
  if (
    !isFiveLetters(addition.word) ||
    addition.word !== normalize(addition.word) ||
    !addition.source
  ) {
    throw new Error(`Ampliación sin normalizar o sin fuente: ${addition.word}`);
  }
  allowed.add(addition.word);
}

const reviewedText = await readFile(new URL("answers-reviewed.txt", root), "utf8");
const excludedText = await readFile(new URL("answers-excluded.txt", root), "utf8");
const parseWords = (text) => text.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
const answers = parseWords(reviewedText);
const excluded = new Set(parseWords(excludedText));
if (new Set(answers).size !== answers.length) throw new Error("Hay respuestas duplicadas.");
for (const answer of answers) {
  if (!isFiveLetters(answer) || answer !== normalize(answer) || !allowed.has(answer)) {
    throw new Error(`Respuesta no válida en el diccionario: ${answer}`);
  }
  if (excluded.has(answer)) throw new Error(`Respuesta excluida en la revisión: ${answer}`);
}
if (allowed.size < 9_000 || answers.length < 1_000) {
  throw new Error("Se requieren al menos 9.000 intentos y 1.000 respuestas revisadas.");
}

const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const allowedData = serialize([...allowed].sort());
const answersData = serialize(answers.toSorted());
const manifest = {
  version: VERSION,
  generator: "scripts/generate-wordle-dictionary.mjs",
  engine: "nspell@2.1.5",
  normalization: "NFC; mayúsculas; ÁÉÍÓÚÜ → AEIOUU; Ñ distinta de N; cinco letras A-ZÑ",
  expandedForms: expanded.length,
  baseAllowedCount: baseCount,
  allowedCount: allowed.size,
  answerCount: answers.length,
  flagRemapping,
  inputs: {
    sourceManifest: hash(await readFile(new URL("source-manifest.json", root))),
    reviewedAnswers: hash(reviewedText),
    excludedAnswers: hash(excludedText),
    acceptedAdditions: hash(additionsText),
  },
  outputs: { "allowed.json": hash(allowedData), "answers.json": hash(answersData) },
  sources,
};

if (!check) await mkdir(output, { recursive: true });
for (const [name, content] of [
  ["allowed.json", allowedData],
  ["answers.json", answersData],
  ["manifest.json", serialize(manifest)],
]) {
  const path = new URL(name, output);
  if (check) {
    if ((await readFile(path, "utf8")) !== content) {
      throw new Error(`Dataset desactualizado: ${fileURLToPath(path)}`);
    }
  } else {
    await writeFile(path, content);
  }
}
process.stdout.write(
  `${check ? "Verificado" : "Generado"} ${VERSION}: ${allowed.size} intentos, ${answers.length} respuestas.\n`,
);
