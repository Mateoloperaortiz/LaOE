import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { countUnreadInbox } from "@/modules/comms";
import { inboxItem } from "@/modules/comms/schema";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { seedInboxItem } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El centro de avisos de Mi OE (ADR-166): la campana de «Hoy» cuenta lo que no se ha leído, el centro
// filtra por tipo y abrir un aviso lo marca leído y lleva a su enlace.

test.use({ storageState: "tests/e2e/.auth/member.json" });

test("la campana cuenta lo nuevo, el filtro separa por tipo y abrir marca leído", async ({
  page,
}) => {
  const db = getDb();
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!member) throw new Error("Falta la identidad sintética");
  await seedInboxItem(member.id, {
    kind: "WORDLE",
    title: "e2e-Aviso: el Wordle de hoy",
    href: "/app/juegos",
    dedupeKey: "e2e-aviso-wordle",
  });
  await seedInboxItem(member.id, {
    kind: "CAMPAIGN",
    title: "e2e-Aviso: la campaña",
    body: "Texto sintético de una campaña.",
    dedupeKey: "e2e-aviso-campana",
  });

  await page.goto("/app");
  // La base de la E2E ya trae avisos del bus (los retos publicados): se cuenta lo de la persona.
  const unread = await countUnreadInbox(member.id);
  expect(unread).toBeGreaterThanOrEqual(2);
  const [, uno, varios] = tList("T-4889");
  const campana = page.getByRole("link", {
    name: (unread === 1 ? uno : varios)?.replace("{n}", String(unread)) ?? "",
    exact: true,
  });
  await expect(campana).toBeVisible();
  await campana.click();
  await expect(page).toHaveURL(/\/app\/avisos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(tList("T-4884")[0]);
  await sinViolaciones(page);

  const filtros = page.getByRole("navigation", { name: t("T-4885"), exact: true });
  const [, , juegos, , , campanas] = tList("T-4886");
  await filtros.getByRole("link", { name: campanas, exact: true }).click();
  await expect(page).toHaveURL(/tipo=campanas$/);
  await expect(page.getByRole("button", { name: /e2e-Aviso: la campaña/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /e2e-Aviso: el Wordle/ })).toHaveCount(0);

  await filtros.getByRole("link", { name: juegos, exact: true }).click();
  await page.getByRole("button", { name: /e2e-Aviso: el Wordle/ }).click();
  await expect(page).toHaveURL(/\/app\/juegos$/);
  const [leido] = await db
    .select({ readAt: inboxItem.readAt })
    .from(inboxItem)
    .where(eq(inboxItem.dedupeKey, "e2e-aviso-wordle"));
  expect(leido?.readAt).not.toBeNull();
});
