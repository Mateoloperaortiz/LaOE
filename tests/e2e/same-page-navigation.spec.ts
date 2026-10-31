import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { adjustPointsAs } from "@/modules/participation";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedTerm,
} from "../factories";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";
import { expectNoPageJump, trackScroll } from "./scroll-observer";

test.use({ storageState: "tests/e2e/.auth/member.json" });

async function seedLongPointsPage(): Promise<string> {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  const [admin] = await db.select().from(person).where(eq(person.email, E2E_EMAIL));
  const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!current || !admin || !member) throw new Error("Faltan las identidades sintéticas");
  const previousId = await seedTerm(E2E_CALENDAR.previous.code, E2E_CALENDAR.previous);

  // Ambos tableros de personas y el de comités tienen contenido real bajo las pestañas.
  for (let index = 0; index < 10; index += 1) {
    const committeeId = await seedCommittee(
      `e2e-navegacion-${index}`,
      `Comité sintético ${index}`,
      { publicationStatus: "DRAFT" },
    );
    for (const newcomer of [true, false]) {
      const kind = newcomer ? "nueva" : "veterana";
      const personId = await seedPerson(`e2e-navegacion-${kind}-${index}@example.invalid`, {
        firstName: "Persona sintética",
        lastName: `${kind} ${index}`,
        source: "E2E",
      });
      await seedMembership(personId, newcomer ? current.id : previousId);
      await seedCommitteeMembership(personId, committeeId, current.id);
      await adjustPointsAs(
        { personId: admin.id, ip: null },
        {
          personId,
          termId: current.id,
          points: 10 + index,
          reason: "Saldo sintético para recorrer los tableros",
        },
      );
    }
  }

  // La altura antes de Rankings sale de las asambleas que muestra la página real.
  const firstDay = new Date(`${current.startsOn}T12:00:00-05:00`).getTime();
  for (let index = 0; index < 12; index += 1) {
    const startsAt = new Date(firstDay + index * 86_400_000);
    const assembly = await seedOccasion(current.id, {
      title: `Asamblea sintética de navegación ${index}`,
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      status: "CLOSED",
      points: 0,
      startsAt,
      checkInOpensAt: startsAt,
      checkInClosesAt: new Date(startsAt.getTime() + 3_600_000),
    });
    await seedCheckIn(assembly.id, member.id);
  }
  await closeDb();
  return current.id;
}

for (const width of [390, 1440]) {
  test(`las pestañas Nuevos, Veteranos y Comités conservan el lugar en GH Points a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 });
    const termId = await seedLongPointsPage();
    await page.goto(`/app/gh-points?semestre=${termId}&tablero=nuevos`);
    const tabs = page.getByRole("navigation", { name: t("T-539"), exact: true });
    const [newLabel, veteranLabel, committeeLabel] = tList("T-083");
    for (const [board, label] of [
      ["veteranos", veteranLabel],
      ["comites", committeeLabel],
      ["nuevos", newLabel],
    ] as const) {
      const tab = tabs.getByRole("link", { name: label, exact: true });
      await tab.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(500);
      const finish = await trackScroll(page);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-current", "page");
      await expect.poll(() => new URL(page.url()).searchParams.get("tablero")).toBe(board);
      expect(new URL(page.url()).searchParams.get("semestre")).toBe(termId);
      expectNoPageJump(await finish(), before);
      await expect(tab).toBeInViewport();
    }

    // El historial recupera la pestaña y conserva el lugar del mismo semestre.
    for (const [direction, board, label] of [
      ["back", "comites", committeeLabel],
      ["forward", "nuevos", newLabel],
    ] as const) {
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(500);
      const finish = await trackScroll(page);
      if (direction === "back") await page.goBack();
      else await page.goForward();
      await expect.poll(() => new URL(page.url()).searchParams.get("tablero")).toBe(board);
      expect(new URL(page.url()).searchParams.get("semestre")).toBe(termId);
      const tab = tabs.getByRole("link", { name: label, exact: true });
      await expect(tab).toHaveAttribute("aria-current", "page");
      expectNoPageJump(await finish(), before);
      await expect(tab).toBeInViewport();
    }

    // Abrir otra página mantiene el inicio habitual de la navegación.
    await page.locator(".member-brand").click();
    await expect(page).toHaveURL(/\/app$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
}
