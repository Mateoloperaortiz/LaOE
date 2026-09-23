import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import nspell from "nspell";

// Generación editorial, nunca importada por la app. No usa la red.
const VERSION = "rla-es-2.9-panal-v1";
const root = new URL("../src/modules/participation/data/wordle/", import.meta.url);
const output = new URL(`../panal/versions/${VERSION}/`, root);
const check = process.argv.includes("--check");
const require = createRequire(import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) =>
  value
    .trim()
    .normalize("NFC")
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜ]/g, (letter) => ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U" })[letter]);

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
const allowed = new Set(
  Object.keys(spell.data)
    .filter((word) => word === word.toLowerCase())
    .map(normalize)
    .filter((word) => /^[A-ZÑ]{4,32}$/.test(word)),
);
const signature = (word) => [...new Set(word)].sort().join("");
const byLetters = new Map();
for (const word of allowed) {
  const key = signature(word);
  if (key.length > 7) continue;
  if (!byLetters.has(key)) byLetters.set(key, []);
  byLetters.get(key).push(word);
}
const frequent = sourceFiles
  .get("sources/frequencywords-es-2018-50k.txt")
  .trim()
  .split("\n")
  .slice(0, 20000)
  .map((line) => normalize(line.split(" ")[0]));
const candidates = [
  ...new Set(
    frequent
      .filter((word) => allowed.has(word) && word.length <= 12 && signature(word).length === 7)
      .map(signature),
  ),
];
const puzzles = [];
for (const letters of candidates) {
  const words = [];
  // Las 127 combinaciones no vacías de las siete letras; evita recorrer el corpus por tablero.
  for (let bits = 1; bits < 128; bits += 1) {
    const key = [...letters].filter((_, index) => bits & (1 << index)).join("");
    words.push(...(byLetters.get(key) ?? []));
  }
  const options = [...letters]
    .map((center) => ({ center, words: words.filter((word) => word.includes(center)).sort() }))
    .filter((option) => option.words.length >= 25 && option.words.length <= 80);
  // Un único centro por conjunto evita repetir las mismas letras en días cercanos.
  options.sort(
    (a, b) =>
      Math.abs(a.words.length - 45) - Math.abs(b.words.length - 45) ||
      a.center.localeCompare(b.center, "es"),
  );
  const selected = options[0];
  if (selected) puzzles.push({ id: `${letters}-${selected.center}`, letters, ...selected });
}
puzzles.sort((a, b) => hash(VERSION + a.id).localeCompare(hash(VERSION + b.id)));
if (puzzles.length < 180) throw new Error(`Catálogo insuficiente: ${puzzles.length}`);
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const data = serialize(puzzles);
const manifest = {
  version: VERSION,
  generator: "scripts/generate-panal-dictionary.mjs",
  engine: "nspell@2.1.5",
  puzzleCount: puzzles.length,
  dictionaryWords: allowed.size,
  normalization: "NFC; ÁÉÍÓÚÜ → AEIOUU; Ñ distinta de N; 4–32 letras; flexiones permitidas",
  sourceManifest: hash(await readFile(new URL("source-manifest.json", root))),
  sources,
  outputs: { "puzzles.json": hash(data) },
};
if (!check) await mkdir(output, { recursive: true });
for (const [name, content] of [
  ["puzzles.json", data],
  ["manifest.json", serialize(manifest)],
]) {
  const path = new URL(name, output);
  if (check) {
    if ((await readFile(path, "utf8")) !== content)
      throw new Error(`Dataset desactualizado: ${fileURLToPath(path)}`);
  } else await writeFile(path, content);
}
process.stdout.write(
  `${check ? "Verificado" : "Generado"} ${VERSION}: ${puzzles.length} tableros.\n`,
);
