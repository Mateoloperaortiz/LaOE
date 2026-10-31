import { expect, type Page } from "@playwright/test";

/** Registra también un salto que se corrija antes de comprobar la posición final. */
export async function trackScroll(page: Page): Promise<() => Promise<number[]>> {
  const capture = await page.evaluateHandle(() => {
    const positions = [window.scrollY];
    const record = () => positions.push(window.scrollY);
    window.addEventListener("scroll", record);
    return { positions, record };
  });
  return async () => {
    const positions = await capture.evaluate(async ({ positions, record }) => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      window.removeEventListener("scroll", record);
      return [...positions, window.scrollY];
    });
    await capture.dispose();
    return positions;
  };
}

export function expectNoPageJump(positions: number[], before: number): void {
  expect(Math.min(...positions), `Posiciones observadas: ${positions.join(", ")}`).toBeGreaterThan(
    before - 80,
  );
  expect(positions.at(-1)).toBeLessThan(before + 80);
}

export async function holdPost(page: Page, pattern: string) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() === "POST") {
      markStarted();
      await held;
    }
    await route.continue();
  });
  return { started, release };
}
