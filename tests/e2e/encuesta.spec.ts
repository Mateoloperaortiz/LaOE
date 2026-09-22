import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { createSurveyInvites } from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// Encuesta tras la ocasión (ADR-038 regla 13, "listo cuando" de la fase 6): ADMIN arma un formulario
// e2e- con calificación y texto y una ocasión con encuesta; el miembro registra asistencia; ADMIN
// cierra; la prueba crea la invitación con el token en claro y drena el outbox; el miembro responde
// y la consola muestra el agregado. El miembro usa su sesión guardada en un contexto aparte para no
// gastar códigos de ingreso que otras pruebas necesitan.

const marca = Date.now().toString(36);
const FORM_SLUG = `e2e-encuesta-${marca}`;
const OCASION = `e2e-encuesta-${marca}`;

function haceUnaHora(): string {
  const local = new Date(Date.now() - 5 * 60 * 60_000 - 60 * 60_000);
  return local.toISOString().slice(0, 16);
}

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("la encuesta de una ocasión cerrada llega a su asistente y el agregado aparece en la consola", async ({
  page,
  browser,
}) => {
  // 1. ADMIN: el formulario de miembros con calificación y comentario.
  await page.goto("/admin/formularios");
  await page.getByRole("link", { name: t("T-251") }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel(new RegExp(tList("T-910")[0])).fill(FORM_SLUG);
  await panel.getByLabel(tList("T-910")[1], { exact: true }).fill(`e2e Encuesta ${marca}`);
  await panel.getByLabel(tList("T-910")[3]).selectOption("MEMBERS");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await page.getByRole("link", { name: `e2e Encuesta ${marca}` }).click();
  await page.getByRole("link", { name: t("T-922") }).click();
  const campo = page.getByRole("dialog");
  await campo.getByLabel(tList("T-923")[0]).fill("calif");
  await campo.getByLabel(tList("T-923")[1]).fill("¿Cómo estuvo?");
  await campo.getByLabel(tList("T-923")[2]).selectOption("RATING");
  await campo.getByLabel(tList("T-923")[3]).check();
  await campo.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(tList("T-933")[0])).toBeVisible();
  await page.getByRole("link", { name: t("T-922") }).click();
  const segundo = page.getByRole("dialog");
  await segundo.getByLabel(tList("T-923")[0]).fill("comentario");
  await segundo.getByLabel(tList("T-923")[1]).fill("Comentario");
  await segundo.getByLabel(tList("T-923")[2]).selectOption("TEXTAREA");
  await segundo.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(tList("T-933")[0])).toBeVisible();

  // 2. ADMIN: la ocasión con esa encuesta, abierta y con el registro en ventana.
  await page.goto("/admin/ocasiones");
  await page.getByRole("link", { name: t("T-251") }).click();
  const ocasion = page.getByRole("dialog");
  await ocasion.getByLabel(tList("T-563")[0]).fill(OCASION);
  await ocasion.getByLabel(tList("T-563")[7]).fill(haceUnaHora());
  await ocasion
    .getByLabel(t("T-1158"))
    .selectOption({ label: `e2e Encuesta ${marca} (${FORM_SLUG})` });
  await ocasion.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  const fila = page.getByRole("row", { name: new RegExp(OCASION) });
  await fila.getByRole("button", { name: tList("T-569")[0], exact: true }).click();
  await expect(fila.getByText(tList("T-568")[1])).toBeVisible();
  const [row] = await getDb()
    .select({ id: occasion.id, publicId: occasion.publicId })
    .from(occasion)
    .where(eq(occasion.title, OCASION));
  expect(row).toBeDefined();

  // 3. El miembro, con su sesión guardada, registra asistencia.
  const contextoMiembro = await browser.newContext({
    storageState: "tests/e2e/.auth/member.json",
  });
  const miembro = await contextoMiembro.newPage();
  await miembro.goto(`/a/${row?.publicId}`);
  await miembro.getByRole("button", { name: t("T-091") }).click();
  await expect(
    miembro
      .getByText(
        new RegExp(
          [
            copyPattern("T-092").source.split(".+?")[0],
            copyPattern("T-093").source,
            copyPattern("T-094").source,
            copyPattern("T-095").source,
          ].join("|"),
          "i",
        ),
      )
      .first(),
  ).toBeVisible();

  // 4. ADMIN cierra; la invitación con token en claro sale de la prueba; el outbox manda el push.
  await page.goto("/admin/ocasiones");
  const cerrar = page.getByRole("row", { name: new RegExp(OCASION) });
  await cerrar.getByRole("button", { name: tList("T-569")[1], exact: true }).click();
  await expect(cerrar.getByText(tList("T-568")[2])).toBeVisible();
  const invites = await createSurveyInvites(row?.id ?? "");
  const token = invites.created[0]?.token ?? "";
  expect(token).not.toBe("");
  await closeDb();
  await drenarOutbox();

  // 5. El miembro responde: 5 y un comentario; una segunda visita dice que ya respondió.
  await miembro.goto(`/app/encuesta/${token}`);
  await expect(miembro.getByRole("heading", { level: 1 })).toHaveText(
    t("T-1095", { actividad: OCASION }),
  );
  await sinViolaciones(miembro);
  await miembro.getByLabel("5", { exact: true }).check();
  await miembro.getByLabel("Comentario").fill("Muy bien");
  await miembro.getByRole("button", { name: t("T-1097") }).click();
  await expect(miembro.getByText(copyPattern("T-1098"))).toBeVisible();
  await miembro.goto(`/app/encuesta/${token}`);
  await expect(miembro.getByText(t("T-1099"))).toBeVisible();
  await contextoMiembro.close();

  // 6. ADMIN: la consola muestra el agregado y esconde el comentario por pocas respuestas.
  await page.goto(`/admin/ocasiones/${row?.id}`);
  const encuesta = page.getByRole("region", { name: t("T-1161") });
  await encuesta.locator("summary").click();
  await expect(encuesta.getByText(t("T-1162", { respondieron: 1, invitados: 1 }))).toBeVisible();
  await expect(encuesta.getByText(t("T-1164", { promedio: "5.0" }))).toBeVisible();
  await expect(encuesta.getByText(copyPattern("T-1165", { n: 3 }))).toBeVisible();
  await expect(encuesta.getByText("Muy bien")).toHaveCount(0);
  await sinViolaciones(page);
});
