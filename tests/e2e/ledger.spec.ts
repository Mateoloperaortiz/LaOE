import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Ledger, rankings y Persona 360 (Participación) como ADMIN (ADR-035 regla 9).
test.use({ storageState: "tests/e2e/.auth/admin.json" });

let memberId = "";

test.beforeEach(async () => {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("sin miembro");
  memberId = member.id;
  await closeDb();
});

test("GH ajusta puntos desde la 360, los ve en el ledger, los revierte y el ranking lista el término", async ({
  page,
}) => {
  await page.goto(`/admin/personas/${memberId}?pestana=participacion`);
  await expect(page.getByRole("heading", { name: tList("T-668")[1] })).toBeVisible();
  await sinViolaciones(page);
  await page
    .getByRole("link", { name: t("T-625") })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/ledger\?personId=.*accion=ajustar/);
  await page.getByLabel(tList("T-626")[2]).fill("7");
  await page.getByLabel(tList("T-626")[3]).fill("e2e-Ajuste desde el ledger");
  await page.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText("e2e-Ajuste desde el ledger")).toBeVisible();
  await sinViolaciones(page);

  await page
    .getByRole("row")
    .filter({ hasText: "e2e-Ajuste desde el ledger" })
    .getByRole("link", { name: t("T-630") })
    .click();
  await expect(
    page.getByText(copyPattern("T-631", { puntos: 7, nombre: "Miembro E2E" })),
  ).toBeVisible();
  await page.getByLabel(tList("T-626")[3]).fill("e2e-Reversión");
  await page.getByRole("button", { name: t("T-630") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText("e2e-Reversión")).toBeVisible();

  await page.goto("/admin/rankings");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t("T-635", { término: E2E_TERM.code }),
  );
  await expect(page.getByRole("heading", { name: tList("T-083")[0] })).toBeVisible();
  await sinViolaciones(page);
});
