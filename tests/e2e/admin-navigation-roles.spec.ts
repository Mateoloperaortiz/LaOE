import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { seedWorkGroup } from "../factories";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });

test("líder y evaluador de grupo reciben solo sus destinos, con un único activo", async ({
  page,
}) => {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !current) throw new Error("Faltan identidades sintéticas");
  const group = {
    id: await seedWorkGroup(current.id, "e2e-Navegación de grupo", {
      kind: "GAP",
      leaderPersonId: member.id,
      evaluatorIds: [member.id],
    }),
  };
  try {
    await page.goto("/app");
    await page.getByRole("link", { name: t("T-2090"), exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/permanencia/grupos/${group.id}$`));
    const nav = page.locator(".admin-sidebar nav");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole("link")).toHaveCount(2);
    await expect(page.getByRole("button", { name: t("T-299") })).toHaveCount(0);
    await expect(nav.locator('a[href="/admin/personas"]')).toHaveCount(0);
    await page.goto("/admin/personas");
    await expect(page).toHaveURL(/\/app$/);
    await db.update(workGroup).set({ leaderPersonId: null }).where(eq(workGroup.id, group.id));
    await page.goto("/app");
    await page.getByRole("link", { name: t("T-2090"), exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/permanencia\/evaluaciones$/);
    await expect(nav.getByRole("link")).toHaveCount(1);
    await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      "/admin/permanencia/evaluaciones",
    );
  } finally {
    await db.delete(workGroup).where(eq(workGroup.id, group.id));
    await closeDb();
  }
});
