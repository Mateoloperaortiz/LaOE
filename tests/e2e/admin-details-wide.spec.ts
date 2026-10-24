import { closeDb } from "@/db/client";
import { type AdminDetails, checkAdminDetails, seedAdminDetails } from "./admin-details-fixture";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Los mismos detalles administrativos de admin-details-responsive, en tableta y escritorio:
// otro archivo para que el reparto E2E los pueda mandar a otro runner (ADR-140).
let details: AdminDetails;

test.beforeEach(async () => {
  details = await seedAdminDetails();
});

test.afterEach(async () => {
  await drenarOutbox();
  await details.remove();
  await closeDb();
});

for (const width of [768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`detalles administrativos ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await checkAdminDetails(page, testInfo, details.routes, width, colorScheme);
    });
  }
}
