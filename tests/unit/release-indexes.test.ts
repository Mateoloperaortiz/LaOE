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
