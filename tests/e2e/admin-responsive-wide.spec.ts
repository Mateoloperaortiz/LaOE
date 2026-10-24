import { checkAdminResponsive } from "./admin-responsive-check";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// La administración adaptable de admin-responsive en tableta y escritorio: otro archivo para
// que el reparto E2E los pueda mandar a otro runner (ADR-140).
for (const width of [768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`administración adaptable ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      await checkAdminResponsive(page, testInfo, width, colorScheme);
    });
  }
}
