import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemaRequiredIndexes } from "../../scripts/lib/release";

describe("índices que exige db:release", () => {
  it("salen del esquema: únicos parciales, únicos simples y GIN", async () => {
    const names = await schemaRequiredIndexes();
    expect(names).toContain("person_email_unique");
    expect(names).toContain("form_slug_unique");
    expect(names).toContain("document_article_search_idx");
    expect(new Set(names).size).toBe(names.length);
  });

  it("con REQUIRED_INDEXES_FILE lee la lista precalculada y no toca los esquemas (imagen, ADR-141)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "required-indexes-"));
    try {
      const file = join(dir, "indexes.json");
      writeFileSync(file, JSON.stringify(["b_idx", "a_idx"]));
      expect(await schemaRequiredIndexes({ REQUIRED_INDEXES_FILE: file })).toEqual([
        "a_idx",
        "b_idx",
      ]);
      writeFileSync(file, JSON.stringify({ no: "es una lista" }));
      await expect(schemaRequiredIndexes({ REQUIRED_INDEXES_FILE: file })).rejects.toThrow(
        /REQUIRED_INDEXES_FILE/,
      );
      writeFileSync(file, JSON.stringify(["ok_idx", 42]));
      await expect(schemaRequiredIndexes({ REQUIRED_INDEXES_FILE: file })).rejects.toThrow(
        /REQUIRED_INDEXES_FILE/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("incluye los cuatro que la lista a mano había dejado atrás (ADR-079)", async () => {
    const names = await schemaRequiredIndexes();
    for (const name of [
      "term_code_unique",
      "committee_slug_unique",
      "committee_membership_person_committee_term_unique",
      "challenge_evidence_ordinal_unique",
    ]) {
      expect(names).toContain(name);
    }
  });
});
