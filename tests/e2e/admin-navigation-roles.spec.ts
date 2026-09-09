import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { workGroup, workGroupEvaluator } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
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
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  if (!member || !current) throw new Error("Faltan identidades sintéticas");
  const [group] = await db
    .insert(workGroup)
    .values({
      name: "e2e-Navegación de grupo",
      termId: current.id,
      kind: "GAP",
      leaderPersonId: member.id,
    })
    .returning({ id: workGroup.id });
  if (!group) throw new Error("Falta grupo sintético");
  try {
    await db.insert(workGroupEvaluator).values({ groupId: group.id, personId: member.id });
    await page.goto("/app");
    await page.getByRole("link", { name: "Cambiar a Administración", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/permanencia/grupos/${group.id}$`));
    const nav = page.locator(".admin-sidebar nav");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(nav.getByRole("link")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Buscar (⌘K)" })).toHaveCount(0);
    await expect(nav.locator('a[href="/admin/personas"]')).toHaveCount(0);
    await page.goto("/admin/personas");
    await expect(page).toHaveURL(/\/app$/);
    await db.update(workGroup).set({ leaderPersonId: null }).where(eq(workGroup.id, group.id));
    await page.goto("/app");
    await page.getByRole("link", { name: "Cambiar a Administración", exact: true }).click();
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
