import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Cada pantalla pasa axe sin violaciones (10-verificacion.md). */
export async function sinViolaciones(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
