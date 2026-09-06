import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { createSurveyInvites } from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { sinViolaciones } from "./axe";
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
  await page.getByRole("link", { name: "Nuevo" }).click();
  const panel = page.getByRole("complementary");
  await panel.getByLabel(/Identificador/).fill(FORM_SLUG);
  await panel.getByLabel("Título", { exact: true }).fill(`e2e Encuesta ${marca}`);
  await panel.getByLabel("Audiencia").selectOption("MEMBERS");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await page.getByRole("link", { name: `e2e Encuesta ${marca}` }).click();
  await page.getByRole("link", { name: "Agregar campo" }).click();
  const campo = page.getByRole("complementary");
  await campo.getByLabel("Clave").fill("calif");
  await campo.getByLabel("Etiqueta").fill("¿Cómo estuvo?");
  await campo.getByLabel("Tipo").selectOption("RATING");
  await campo.getByLabel("Obligatorio").check();
  await campo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Campos guardados.")).toBeVisible();
  await page.getByRole("link", { name: "Agregar campo" }).click();
  const segundo = page.getByRole("complementary");
  await segundo.getByLabel("Clave").fill("comentario");
  await segundo.getByLabel("Etiqueta").fill("Comentario");
  await segundo.getByLabel("Tipo").selectOption("TEXTAREA");
  await segundo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Campos guardados.")).toBeVisible();

  // 2. ADMIN: la ocasión con esa encuesta, abierta y con el registro en ventana.
  await page.goto("/admin/ocasiones");
  await page.getByRole("link", { name: "Nuevo" }).click();
  const ocasion = page.getByRole("complementary");
  await ocasion.getByLabel("Título").fill(OCASION);
  await ocasion.getByLabel("Empieza").fill(haceUnaHora());
  await ocasion
    .getByLabel("Encuesta al cerrar")
    .selectOption({ label: `e2e Encuesta ${marca} (${FORM_SLUG})` });
  await ocasion.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  const fila = page.getByRole("row", { name: new RegExp(OCASION) });
  await fila.getByRole("button", { name: "Abrir", exact: true }).click();
  await expect(fila.getByText("Abierta")).toBeVisible();
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
  await miembro.getByRole("button", { name: "Registrar mi asistencia" }).click();
  await expect(miembro.getByText(/GH Points|Listo|registrad/i).first()).toBeVisible();

  // 4. ADMIN cierra; la invitación con token en claro sale de la prueba; el outbox manda el push.
  await page.goto("/admin/ocasiones");
  const cerrar = page.getByRole("row", { name: new RegExp(OCASION) });
  await cerrar.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(cerrar.getByText("Cerrada")).toBeVisible();
  const invites = await createSurveyInvites(row?.id ?? "");
  const token = invites.created[0]?.token ?? "";
  expect(token).not.toBe("");
  await closeDb();
  await drenarOutbox();

  // 5. El miembro responde: 5 y un comentario; una segunda visita dice que ya respondió.
  await miembro.goto(`/app/encuesta/${token}`);
  await expect(miembro.getByRole("heading", { level: 1 })).toHaveText(`¿Cómo estuvo ${OCASION}?`);
  await sinViolaciones(miembro);
  await miembro.getByLabel("5", { exact: true }).check();
  await miembro.getByLabel("Comentario").fill("Muy bien");
  await miembro.getByRole("button", { name: "Enviar respuestas" }).click();
  await expect(miembro.getByText(/¡Gracias! Tus respuestas ayudan/)).toBeVisible();
  await miembro.goto(`/app/encuesta/${token}`);
  await expect(miembro.getByText("Ya respondiste esta encuesta. ¡Gracias!")).toBeVisible();
  await contextoMiembro.close();

  // 6. ADMIN: la consola muestra el agregado y esconde el comentario por pocas respuestas.
  await page.goto(`/admin/ocasiones/${row?.id}`);
  const encuesta = page.getByRole("region", { name: "Encuesta" });
  await expect(encuesta.getByText("1 de 1 respondieron")).toBeVisible();
  await expect(encuesta.getByText("Promedio 5.0 de 5")).toBeVisible();
  await expect(
    encuesta.getByText(/Los comentarios se muestran cuando hay al menos 3/),
  ).toBeVisible();
  await expect(encuesta.getByText("Muy bien")).toHaveCount(0);
  await sinViolaciones(page);
});
