import { describe, expect, it } from "vitest";
import { inventoryReviewTarget } from "../../scripts/lib/inventory-review-guard";

const database = "postgresql://sintetico:secreto@localhost:5433/inventory_review_20261029";

describe("destino del seed de revisión de inventario", () => {
  it("acepta únicamente una base de revisión y el origen fijo de staging o loopback", () => {
    expect(inventoryReviewTarget(database, "https://web-staging-53f6.up.railway.app")).toEqual({
      databaseName: "inventory_review_20261029",
      appOrigin: "https://web-staging-53f6.up.railway.app",
    });
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3001", "http://[::1]:3000"])
      expect(inventoryReviewTarget(database, origin).databaseName).toBe(
        "inventory_review_20261029",
      );
  });

  it("rechaza bases comunes, variantes escapadas y cualquier origen de producción", () => {
    for (const path of [
      "/postgres",
      "/casa_digital",
      "/production",
      "/inventory_review_",
      "/inventory_review_ABC",
      "/inventory_review_demo/otra",
      "/%69nventory_review_demo",
    ]) {
      expect(() =>
        inventoryReviewTarget(new URL(path, database).toString(), "http://localhost:3000"),
      ).toThrow();
    }
    for (const origin of [
      "https://oeeafit.com",
      "https://www.oeeafit.com",
      "https://web-production.up.railway.app",
      "https://web-staging-53f6.up.railway.app.ejemplo.com",
      "https://web-staging-53f6.up.railway.app/ruta",
      "https://usuario:secreto@web-staging-53f6.up.railway.app",
    ])
      expect(() => inventoryReviewTarget(database, origin)).toThrow();
    expect(() =>
      inventoryReviewTarget(
        database.replace("localhost", "production.railway.internal"),
        "http://localhost:3000",
      ),
    ).toThrow();
  });
});
