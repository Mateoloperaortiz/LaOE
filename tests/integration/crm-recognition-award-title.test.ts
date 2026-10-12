import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { grantRecognitionAs } from "@/modules/crm/domain/recognitions";
import { recognition } from "@/modules/crm/schema";
import { tList } from "@/shared/copy";
import { seedMember, seedTerm } from "../factories";
import { PAIRS } from "../unit/enum-label-pairs.table";
import { truncateAll } from "./db";

// Un Premio OE sin título propio queda guardado en `recognition.title` con la etiqueta de su
// categoría (T-2320). Las pruebas que entregan un premio no leían ese título: esta fija, categoría
// por categoría, la pieza literal que queda guardada, con las posiciones de la tabla de
// tests/unit/enum-label-pairs.table.ts (DT-011, ADR-126 regla 1).

describe("el título de un Premio OE", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("queda guardado con la etiqueta de su categoría, y no con el código", async () => {
    const [pair, ...others] = PAIRS.filter((item) => item.code === "T-2320");
    expect(others).toEqual([]);
    const positions = pair?.positions ?? {};
    const awards = Object.keys(positions);
    expect(awards).toHaveLength(16);
    const termId = await seedTerm();
    const personId = await seedMember("premiada.sintetica@eafit.edu.co");

    for (const award of awards) {
      await grantRecognitionAs(SYSTEM_ACTOR, {
        personId,
        termId,
        kind: "OE_AWARD",
        award: award as never,
        title: "",
      });
    }

    const rows = await getDb()
      .select({ award: recognition.award, title: recognition.title })
      .from(recognition)
      .where(eq(recognition.personId, personId));
    const labels: readonly string[] = tList("T-2320");
    expect(Object.fromEntries(rows.map((row) => [row.award, row.title]))).toEqual(
      Object.fromEntries(awards.map((award) => [award, labels[positions[award] ?? -1]])),
    );
    expect(new Set(rows.map((row) => row.title)).size).toBe(16);
    expect(rows.map((row) => row.title)).not.toContain("BEST_NEW_MEMBER");
  });
});
