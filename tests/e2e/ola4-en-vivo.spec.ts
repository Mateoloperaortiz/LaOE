import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedCheckIn, seedOccasion } from "../factories";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// La ola 4 (ADR-179 a ADR-182): una consulta de asamblea que se crea en la consola, se vota desde el
// celular y se ve en el proyector sin recargar; la consola de una ocasión en el proyector; y la cola
// del modo anfitrión, que sube sola cuando vuelve la señal.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const [, pregunta, opciones, , crear, abrir] = tList("T-4992");
const [, yaVotaste, , votar] = tList("T-5002");

async function ids() {
  const db = getDb();
  const [termRow] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!termRow || !member) throw new Error("Falta el semestre o el miembro sintético");
  return { termId: termRow.id, memberId: member.id };
}

test.afterAll(async () => {
  await getDb().delete(occasion).where(like(occasion.title, "e2e-Ola4%"));
  await closeDb();
});

test("una consulta se vota desde el celular y el proyector la cuenta sin recargar", async ({
  page,
  browser,
}) => {
  const { termId, memberId } = await ids();
  const assembly = await seedOccasion(termId, {
    title: "e2e-Ola4 asamblea",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
  });
  await seedCheckIn(assembly.id, memberId, "APPROVED");

  await page.goto(`/admin/ocasiones/${assembly.id}`);
  await page
    .getByLabel(pregunta ?? "", { exact: true })
    .fill("¿Hacemos la integración el viernes?");
  await page.getByLabel(opciones ?? "", { exact: true }).fill("Sí\nNo");
  await page.getByRole("button", { name: crear, exact: true }).click();
  await expect(page).toHaveURL(/consultas=1/);
  await page.getByRole("button", { name: abrir, exact: true }).click();
  await expect(page).toHaveURL(/consultas=1/);

  const projector = await page.context().newPage();
  await projector.goto(`/presentar/asamblea/${assembly.id}`);
  await expect(projector.getByText("¿Hacemos la integración el viernes?")).toBeVisible();
  await expect(projector.getByText(t("T-5000", { n: 0 })).first()).toBeVisible();

  const memberContext = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  const phone = await memberContext.newPage();
  await phone.goto(`/app/asamblea/${assembly.id}`);
  await phone.getByRole("radio", { name: "Sí", exact: true }).check();
  await phone.getByRole("button", { name: votar, exact: true }).click();
  await expect(phone.getByText(yaVotaste ?? "", { exact: true }).first()).toBeVisible();
  await memberContext.close();

  // El proyector se entera por el flujo en vivo, sin que nadie lo recargue.
  await expect(projector.getByText(t("T-5000", { n: 1 })).first()).toBeVisible({ timeout: 15_000 });
});

test("la consola de una ocasión en el proyector muestra el QR y cuántos van, sin nombres", async ({
  page,
}) => {
  const { termId, memberId } = await ids();
  const seeded = await seedOccasion(termId, { title: "e2e-Ola4 actividad" });
  await seedCheckIn(seeded.id, memberId, "APPROVED");
  await page.goto(`/presentar/ocasion/${seeded.id}`);
  await expect(page.getByText(t("T-586"))).toBeVisible();
  await expect(page.locator(".presentacion-qr-imagen svg")).toBeVisible();
  await expect(page.locator(".presentacion-cifra")).toHaveText("1");
  await expect(page.locator("main")).not.toContainText("Miembro E2E");
});

test("el modo anfitrión sube solo lo que guardó sin señal y vacía su cola", async ({ page }) => {
  const { termId } = await ids();
  const seeded = await seedOccasion(termId, { title: "e2e-Ola4 sin señal" });
  const key = `oe.sin-senal.${seeded.id}`;
  await page.goto(`/admin/ocasiones/${seeded.id}/anfitrion`);
  // Lo que quedó de un escaneo sin red: al abrir con señal, la cola sube y se vacía; un carnet que no
  // existe vuelve con su respuesta, y también sale.
  await page.evaluate(
    (storageKey) =>
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([{ token: "oe1-carnet-que-no-existe-0000", at: Date.now() }]),
      ),
    key,
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate((storageKey) => window.localStorage.getItem(storageKey), key))
    .toBeNull();
});
