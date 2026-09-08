import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import sourceManifest from "@/modules/participation/data/wordle/source-manifest.json";
import allowedV1 from "@/modules/participation/data/wordle/versions/rla-es-2.9-oe-v1/allowed.json";
import manifestV1 from "@/modules/participation/data/wordle/versions/rla-es-2.9-oe-v1/manifest.json";
import {
  hasWordleDictionary,
  isWordleGuess,
  WORDLE_ANSWERS,
  WORDLE_DICTIONARY_VERSION,
} from "@/modules/participation/domain/wordle-dictionary";

vi.mock("server-only", () => ({}));

const data = new URL("../../src/modules/participation/data/wordle/", import.meta.url);
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

describe("diccionario versionado del Wordle", () => {
  it("ofrece cobertura amplia y respuestas editoriales únicas incluidas entre los intentos", () => {
    expect(allowedV1.length).toBeGreaterThanOrEqual(9_000);
    expect(WORDLE_ANSWERS.length).toBeGreaterThanOrEqual(1_000);
    expect(new Set(allowedV1).size).toBe(allowedV1.length);
    expect(new Set(WORDLE_ANSWERS).size).toBe(WORDLE_ANSWERS.length);
    expect(Object.isFrozen(WORDLE_ANSWERS)).toBe(true);
    expect(allowedV1.every((word) => /^[A-ZÑ]{5}$/.test(word))).toBe(true);
    expect(WORDLE_ANSWERS.every((word) => isWordleGuess(word))).toBe(true);
    expect(manifestV1.version).toBe(WORDLE_DICTIONARY_VERSION);
    expect(manifestV1.allowedCount).toBe(allowedV1.length);
    expect(manifestV1.answerCount).toBe(WORDLE_ANSWERS.length);
  });

  it.each([
    "arepa",
    "parce",
    "bacán",
    "tinto",
    "trajo",
    "podés",
    "tenés",
    "venís",
    "oímos",
    "niñas",
    "niños",
    "casas",
    "comes",
    "reían",
    "oíste",
    "güira",
    "chela",
    "pibes",
    "pibas",
  ])("acepta la palabra cotidiana o regional %s y su forma sin tildes", (word) => {
    expect(isWordleGuess(word)).toBe(true);
    expect(isWordleGuess(word.toUpperCase())).toBe(true);
    expect(isWordleGuess(word.normalize("NFD"))).toBe(true);
  });

  it("normaliza las vocales sin colapsar Ñ en N ni retirar puntuación", () => {
    expect(isWordleGuess("cañón")).toBe(true);
    expect(isWordleGuess("CAÑON")).toBe(true);
    expect(isWordleGuess("NIÑAS")).toBe(true);
    expect(isWordleGuess("NINOS")).toBe(false);
    expect(isWordleGuess("caída")).toBe(true);
    expect(isWordleGuess("CAIDA")).toBe(true);
    expect(isWordleGuess("ca-ñón")).toBe(false);
    expect(isWordleGuess("cañón!")).toBe(false);
  });

  it.each([
    "",
    "sol",
    "chevere",
    "ZZZZZ",
    "ASDFG",
    "QWERT",
    "12345",
    "ABC💚D",
  ])("rechaza intentos inválidos como %s", (word) => expect(isWordleGuess(word)).toBe(false));

  it("conserva el diccionario de la versión de la partida y no reemplaza versiones desconocidas", () => {
    expect(hasWordleDictionary("rla-es-2.9-oe-v1")).toBe(true);
    expect(hasWordleDictionary("desconocida")).toBe(false);
    expect(isWordleGuess("AREPA", "rla-es-2.9-oe-v1")).toBe(true);
    expect(isWordleGuess("AREPA", "desconocida")).toBe(false);
  });

  it("mantiene la revisión editorial separada de lo que se puede intentar", () => {
    for (const word of ["AREPA", "PARCE", "BACAN", "TINTO", "VERDE", "ABEJA"]) {
      expect(WORDLE_ANSWERS).toContain(word);
    }
    for (const word of ["HENRY", "RUSIA", "JODER", "PORNO", "VOLVO", "QUIER"]) {
      expect(WORDLE_ANSWERS).not.toContain(word);
    }
    expect(isWordleGuess("JODER")).toBe(true);
  });

  it("preserva hashes de fuentes originales y avisos de sus licencias", () => {
    expect(sourceManifest.rlaEs.selectedLicense).toBe("MPL-1.1");
    expect(sourceManifest.frequencyWords.license).toBe("CC-BY-SA-4.0");
    for (const source of sourceManifest.files) {
      expect(sha256(readFileSync(new URL(source.file, data))), source.file).toBe(source.sha256);
    }
    for (const [name, expected] of Object.entries(manifestV1.outputs)) {
      expect(sha256(readFileSync(new URL(`versions/${manifestV1.version}/${name}`, data)))).toBe(
        expected,
      );
    }
  });

  it("reproduce el dataset y el manifiesto usando exclusivamente las fuentes locales", () => {
    const output = execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("../../scripts/generate-wordle-dictionary.mjs", import.meta.url)),
        "--check",
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(output).toContain(`Verificado ${WORDLE_DICTIONARY_VERSION}`);
  });
});
