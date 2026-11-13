import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { trajectoryCredential } from "@/modules/crm/schema";
import { createSurveyInvites } from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { committee, handoverDoc, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedCommitteeRole,
  seedForm,
  seedOccasion,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Mi OE en la ola 2: la trayectoria verificable con su página pública (ADR-171), el empalme de un
// cargo (ADR-172) y la encuesta pendiente que se abre desde «Te toca» (ADR-174).

test.use({ storageState: "tests/e2e/.auth/member.json" });

const [publicar, despublicar, verPagina, linkedin] = tList("T-4948");
const [guardar, verificar] = tList("T-4955");

async function ids() {
  const db = getDb();
  const [termRow] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  const [member] = await db
    .select({ id: person.id, fullName: person.fullName })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!termRow || !member) throw new Error("Falta el semestre o el miembro sintético");
  return { termId: termRow.id, memberId: member.id, name: member.fullName?.trim() ?? "" };
}

test.afterAll(async () => {
  const db = getDb();
  const { memberId } = await ids();
  await db.delete(trajectoryCredential).where(eq(trajectoryCredential.personId, memberId));
  const committees = await db
    .select({ id: committee.id })
    .from(committee)
    .where(like(committee.slug, "e2e-ola2%"));
  for (const row of committees) {
    await db.delete(handoverDoc).where(eq(handoverDoc.committeeId, row.id));
  }
  await db.delete(occasion).where(like(occasion.title, "e2e-Ola2%"));
  await closeDb();
});

test("la trayectoria publica un comité, su página lo verifica y se deja de publicar", async ({
  page,
}) => {
  const { termId, memberId, name } = await ids();
  const committeeId = await seedCommittee("e2e-ola2-trayectoria", "Comité Trayectoria E2E");
  await seedCommitteeMembership(memberId, committeeId, termId);

  await page.goto("/app/yo/trayectoria");
  const item = page.locator("li").filter({ hasText: "Comité Trayectoria E2E" });
  await item.getByRole("button", { name: publicar, exact: true }).click();
  await expect(item.getByRole("link", { name: linkedin, exact: true })).toHaveAttribute(
    "href",
    /^https:\/\/www\.linkedin\.com\/profile\/add\?/,
  );
  await sinViolaciones(page);
  await item.getByRole("link", { name: verPagina, exact: true }).click();
  await expect(page).toHaveURL(/\/verificar\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText(/Comité Trayectoria E2E/)).toBeVisible();
  const publicUrl = page.url();

  await page.goto("/app/yo/trayectoria");
  await page
    .locator("li")
    .filter({ hasText: "Comité Trayectoria E2E" })
    .getByRole("button", { name: despublicar, exact: true })
    .click();
  await expect(
    page
      .locator("li")
      .filter({ hasText: "Comité Trayectoria E2E" })
      .getByRole("button", { name: publicar, exact: true }),
  ).toBeVisible();
  await page.goto(publicUrl);
  await expect(page.getByText(t("T-4952"), { exact: true })).toBeVisible();
});

test("el empalme de un cargo se escribe, se verifica y lo dice", async ({ page }) => {
  const { termId, memberId } = await ids();
  const committeeId = await seedCommittee("e2e-ola2-empalme", "Comité Empalme E2E");
  const membershipId = await seedCommitteeMembership(memberId, committeeId, termId);
  await seedCommitteeRole(membershipId, "GESTION_HUMANA");

  await page.goto("/app/yo/empalme");
  const seccion = page.getByRole("region", { name: /Comité Empalme E2E/ });
  await seccion
    .getByRole("textbox")
    .fill("Los contactos de la universidad y lo que quedó pendiente.");
  await seccion.getByRole("button", { name: guardar, exact: true }).click();
  await expect(page).toHaveURL(/guardado=1/);
  await page
    .getByRole("region", { name: /Comité Empalme E2E/ })
    .getByRole("button", { name: verificar, exact: true })
    .click();
  await expect(page.getByRole("region", { name: /Comité Empalme E2E/ })).toContainText(
    /Verificado el/,
  );
  await sinViolaciones(page);
});

test("la encuesta pendiente sale en «Te toca» y se responde desde ahí", async ({ page }) => {
  const { termId, memberId } = await ids();
  const formId = await seedForm("e2e-ola2-encuesta", {
    audience: "MEMBERS",
    fields: [{ key: "calif", label: "¿Cómo estuvo?", type: "RATING", required: true }],
    actions: { createPerson: false },
  });
  const { id } = await seedOccasion(termId, { title: "e2e-Ola2 taller con encuesta" });
  await getDb()
    .update(occasion)
    .set({ surveyFormId: formId, status: "CLOSED", closedAt: new Date() })
    .where(eq(occasion.id, id));
  await seedCheckIn(id, memberId, "APPROVED");
  await createSurveyInvites(id);

  await page.goto("/app");
  await page
    .getByRole("link", { name: /Responde la encuesta de «e2e-Ola2 taller con encuesta»/ })
    .click();
  await expect(page).toHaveURL(/\/app\/encuestas\//);
  await page.getByRole("radio", { name: "5" }).check();
  await page.getByRole("button", { name: t("T-1097"), exact: true }).click();
  await expect(page.getByText(t("T-1098"))).toBeVisible();
});
