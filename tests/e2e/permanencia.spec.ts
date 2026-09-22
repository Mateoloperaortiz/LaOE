import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { workGroup, workGroupMembership } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Permanencia en Mi OE (10-verificacion, e2e): el miembro ve la barra en el inicio y su desglose,
// hace check-in en una integración y el criterio sube sin esperar al outbox (vista en vivo).

test.describe("miembro", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let publicId = "";

  test.beforeEach(async () => {
    const db = getDb();
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!current) throw new Error("sin término");
    const now = Date.now();
    const [row] = await db
      .insert(occasion)
      .values({
        termId: current.id,
        publicId: `e2ei${String(now % 1_000_000).padStart(6, "0")}`,
        title: "e2e-Integración de permanencia",
        kind: "ACTIVITY",
        category: "INTEGRATION",
        points: 0,
        status: "OPEN",
        startsAt: new Date(now),
        checkInOpensAt: new Date(now - 3_600_000),
        checkInClosesAt: new Date(now + 3_600_000),
      })
      .returning({ publicId: occasion.publicId });
    if (!row) throw new Error("sin ocasión");
    publicId = row.publicId;
    await closeDb();
  });

  test("ve su permanencia y el criterio sube tras un check-in de integración", async ({ page }) => {
    await page.goto("/app");
    const barra = page.getByRole("region", { name: t("T-110") });
    await expect(barra).toBeVisible();
    await expect(barra.getByRole("progressbar").first()).toBeVisible();
    await expect(barra.getByRole("link", { name: t("T-699") })).toBeVisible();

    await page.goto("/app/permanencia");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-110"));
    // Otras suites ya pudieron registrar al miembro en integraciones e2e: se compara contra lo que había.
    const integraciones = page
      .getByRole("listitem")
      .filter({ hasText: tList("T-125")[0] })
      .first();
    await expect(integraciones).toContainText(copyPattern("T-682", { peso: 10 }));
    const before = Number(
      (await integraciones.innerText()).match(
        new RegExp(t("T-682", { logrado: "(\\d+)", peso: 10 })),
      )?.[1] ?? "0",
    );
    await expect(page.getByText(copyPattern("T-124"))).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/a/${publicId}`);
    await page.getByRole("button", { name: t("T-091") }).click();
    await expect(page.getByText(t("T-093"))).toBeVisible();

    await page.goto("/app/permanencia");
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: tList("T-125")[0] })
        .first(),
    ).toContainText(t("T-682", { logrado: Math.min(10, before + 2), peso: 10 }));
  });

  test("un GT de macroevento acreditado cumple su GAP y el desglose lo explica", async ({
    page,
  }) => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!member || !current) throw new Error("sin miembro o término");
    const [grupo] = await db
      .insert(workGroup)
      .values({ termId: current.id, kind: "GT_MACROEVENT", name: "e2e-GT que cumple el GAP" })
      .returning({ id: workGroup.id });
    if (!grupo) throw new Error("sin grupo");
    await db.insert(workGroupMembership).values({
      groupId: grupo.id,
      personId: member.id,
      evaluation: "GOOD",
      evaluatedById: member.id,
      evaluatedAt: new Date(),
    });
    await closeDb();

    await page.goto("/app/permanencia");
    const gap = page
      .getByRole("listitem")
      .filter({ hasText: tList("T-125")[3] })
      .first();
    await expect(gap).toContainText("e2e-GT que cumple el GAP");
    await expect(gap).toContainText(t("T-2617", { tipo: tList("T-725")[1] }));
    await sinViolaciones(page);
  });
});

test.describe("GH", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("cumplimiento lista el roster, filtra y abre la pestaña Permanencia de la persona", async ({
    page,
  }) => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    await closeDb();
    if (!member) throw new Error("sin miembro");

    await page.goto("/admin/permanencia/cumplimiento");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-788"));
    await page.getByRole("button", { name: t("T-794") }).click();
    await expect(page.getByText(t("T-795"))).toBeVisible();
    await page.getByRole("link", { name: tList("T-789")[5] }).click();
    await expect(page).toHaveURL(/filtro=exentos/);
    await sinViolaciones(page);

    await page.goto(`/admin/personas/${member.id}?pestana=permanencia`);
    await expect(page.getByText(tList("T-829")[0])).toBeVisible();
    await expect(page.getByText(t("T-120"))).toBeVisible();
    await sinViolaciones(page);
  });
});
