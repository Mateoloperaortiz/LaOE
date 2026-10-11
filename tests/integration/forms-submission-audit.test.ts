import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { getPublicForm, submitFormAs } from "@/modules/forms";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { auditLog } from "@/modules/system/schema";
import { seedForm, seedMember } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Lo que la auditoría guarda de una respuesta a un formulario (DT-138). La entrada es de la entidad
// `form`, así que la anonimización, que solo limpia la auditoría de la entidad `person` (ADR-030), no
// la toca: lo que guarde junto al id de la persona se queda.

const admin = { personId: null, ip: null };

async function openForm(slug: string, overrides: Parameters<typeof seedForm>[1] = {}) {
  await seedForm(slug, { fields: [], ...overrides });
  const view = await getPublicForm(slug);
  if (!view) throw new Error("form");
  return view;
}

/** Lo que quedó en `after` de cada `submission.received`. */
async function receivedAudits(): Promise<unknown[]> {
  const rows = await getDb()
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(eq(auditLog.action, "submission.received"));
  return rows.map((row) => row.after);
}

describe("auditoría de una respuesta a un formulario", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la respuesta de un miembro queda con su id y el de la respuesta, sin su correo, y así sigue después de anonimizarlo", async () => {
    const email = "responde.interno@eafit.edu.co";
    const personId = await seedMember(email, { firstName: "Ana" });
    const view = await openForm("encuesta-interna", { audience: "MEMBERS" });
    const result = await submitFormAs({ personId, email, firstName: "Ana" }, view, {
      answers: {},
      consent: false,
      ip: null,
    });
    if (!result.ok || !result.submissionId) throw new Error("submission");

    expect(await receivedAudits()).toEqual([{ submissionId: result.submissionId, personId }]);

    await requestDeletionAs({ personId, ip: null });
    await anonymizePersonAs(admin, personId);
    await drainOutbox();
    // El par que volvía a identificar a la persona era su id junto a su correo: ya no se escribe.
    const audits = await receivedAudits();
    expect(audits).toEqual([{ submissionId: result.submissionId, personId }]);
    expect(JSON.stringify(audits)).not.toContain(email);
  });

  it("la respuesta pública de alguien que no es persona de la casa queda identificada por el id de la respuesta", async () => {
    const email = "visitante@example.com";
    const view = await openForm("contacto", { actions: { createPerson: false } });
    const result = await submitFormAs(null, view, {
      identity: { firstName: "Lu", lastName: "Gómez", email },
      answers: {},
      consent: true,
      ip: "10.0.0.1",
      userAgent: "vitest",
    });
    if (!result.ok || !result.submissionId) throw new Error("submission");

    const audits = await receivedAudits();
    expect(audits).toEqual([{ submissionId: result.submissionId, personId: null }]);
    expect(JSON.stringify(audits)).not.toContain(email);
  });
});
