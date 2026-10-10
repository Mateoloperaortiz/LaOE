import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { getPublicForm, submitFormAs } from "@/modules/forms";
import { formSubmission } from "@/modules/forms/schema";
import { truncateAll } from "./db";
import { seedForm, seedSubmission } from "./factories";

// DT-148: un envío toma la fila del formulario con candado antes de contar las respuestas y de mirar
// si ese correo ya respondió. Ningún índice único cubre el tope ni «una por correo»: el candado es la
// única defensa. Estas pruebas mandan varios envíos a la vez.

const fields = [{ key: "motivo", label: "¿Por qué?", type: "TEXTAREA", required: true }];

async function openForm(slug: string, overrides: Parameters<typeof seedForm>[1] = {}) {
  const id = await seedForm(slug, { fields, ...overrides });
  const view = await getPublicForm(slug);
  if (!view) throw new Error("form");
  return { id, view };
}

type PublicForm = Awaited<ReturnType<typeof openForm>>["view"];

function send(view: PublicForm, email: string) {
  return submitFormAs(null, view, {
    identity: { firstName: "Lu", lastName: "Gómez", email },
    answers: { motivo: "Quiero aportar" },
    consent: true,
    ip: null,
  });
}

function submissionsOf(formId: string) {
  return getDb().select().from(formSubmission).where(eq(formSubmission.formId, formId));
}

describe("envíos a la vez al mismo formulario", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("tres envíos a la vez por el último cupo: entra uno y los otros dos reciben que el formulario está lleno", async () => {
    const { id, view } = await openForm("ultimo-cupo", { maxSubmissions: 2 });
    await seedSubmission(id, "primera@gmail.com");

    const results = await Promise.all(
      ["ana", "bruno", "carla"].map((name) => send(view, `${name}.cupo@eafit.edu.co`)),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    // Los que esperaron el candado del formulario ya contaron la respuesta del que entró.
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: "FULL", errors: {} },
      { ok: false, code: "FULL", errors: {} },
    ]);
    expect(await submissionsOf(id)).toHaveLength(2);
  });

  it("dos envíos a la vez con el mismo correo a un formulario de una respuesta por persona: entra uno y el otro recibe que ya respondió", async () => {
    const { id, view } = await openForm("una-por-correo");

    const results = await Promise.all([
      send(view, "repetida@eafit.edu.co"),
      send(view, "repetida@eafit.edu.co"),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: "DUPLICATE", errors: { email: "T-862" } },
    ]);
    expect(await submissionsOf(id)).toHaveLength(1);
  });
});
