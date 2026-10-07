import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { saveSubscriptionAs, setPushSenderForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  answerSurveyAs,
  closeOccasionAs,
  createOccasionAs,
  createSurveyInvites,
  getSurveyInviteForActor,
  surveySummary,
  surveySummaryForCommittee,
} from "@/modules/participation";
import {
  occasion,
  occasionSurveyInvite,
  occasionSurveyResponse,
} from "@/modules/participation/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedForm,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Encuesta anónima tras la ocasión (ADR-038 regla 13): una invitación por asistente aprobado al cerrar,
// push con URL propia, una respuesta por invitación sin persona, ventana y agregados.

const db = () => getDb();
const fields = [
  { key: "calif", label: "¿Cómo estuvo?", type: "RATING", required: true },
  { key: "comentario", label: "Comentario", type: "TEXTAREA", required: false },
];

describe("encuesta tras la ocasión", () => {
  const pushed: Array<{ endpoint: string; url: string }> = [];
  beforeEach(async () => {
    await truncateAll();
    pushed.length = 0;
    setPushSenderForTests(async (subscription, payload) => {
      pushed.push({ endpoint: subscription.endpoint, url: payload.url });
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("al cerrar crea una invitación por aprobado, manda el push con la URL propia y no repite", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-pixel", "Pixel");
    const formId = await seedForm("encuesta", {
      audience: "MEMBERS",
      fields,
      actions: { createPerson: false },
    });
    const ana = await seedMember("ana.enc@eafit.edu.co");
    const bruno = await seedMember("bruno.enc@eafit.edu.co");
    const pendiente = await seedMember("pendiente.enc@eafit.edu.co");
    await seedCommitteeMembership(ana, committeeId, termId);
    await saveSubscriptionAs(
      { personId: ana },
      {
        endpoint: "https://push.example/ana",
        keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
      },
      null,
    );
    const { id } = await seedOccasion(termId, { title: "Integración", committeeId, points: 10 });
    await db().update(occasion).set({ surveyFormId: formId }).where(eq(occasion.id, id));
    await seedCheckIn(id, ana, "APPROVED");
    await seedCheckIn(id, bruno, "APPROVED");
    await seedCheckIn(id, pendiente, "PENDING");
    await closeOccasionAs(SYSTEM_ACTOR, id);
    // El cierre encola la invitación y esta encola el push.
    await drainOutbox();
    const invites = await db()
      .select()
      .from(occasionSurveyInvite)
      .where(eq(occasionSurveyInvite.occasionId, id));
    expect(invites.map((row) => row.personId).sort()).toEqual([ana, bruno].sort());
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.url).toMatch(/^\/app\/encuesta\/[A-Za-z0-9_-]{24,}$/);
    const rows = await db().select().from(message).where(eq(message.personId, ana));
    expect(rows[0]).toMatchObject({
      kind: "SURVEY",
      subject: t("T-191", { actividad: "Integración" }).split(" · ")[0],
    });
    // Un segundo cierre o reintento no crea ni manda nada más.
    const again = await createSurveyInvites(id);
    expect(again.created).toHaveLength(0);
    await drainOutbox();
    expect(pushed).toHaveLength(1);
  });

  it("solo el invitado responde, una vez, dentro de la ventana; la respuesta no tiene persona y el agregado sale por ocasión y comité", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("e2e-a3", "A3");
    const formId = await seedForm("encuesta", {
      audience: "MEMBERS",
      fields,
      actions: { createPerson: false },
    });
    const ana = await seedMember("ana.resp@eafit.edu.co");
    const otra = await seedMember("otra.resp@eafit.edu.co");
    const { id: created } = await createOccasionAs(SYSTEM_ACTOR, {
      title: "Charla",
      kind: "ACTIVITY",
      category: "TALK",
      newMembersOnly: false,
      description: "",
      location: "",
      startsAt: new Date(Date.now() - 3 * 60 * 60_000),
      points: 5,
      approval: "AUTO",
      requireRotatingCode: false,
      committeeId,
      surveyFormId: formId,
    });
    await db().update(occasion).set({ status: "OPEN" }).where(eq(occasion.id, created));
    await seedCheckIn(created, ana, "APPROVED");
    await closeOccasionAs(SYSTEM_ACTOR, created);
    const { created: invites } = await createSurveyInvites(created);
    const token = invites.find((item) => item.personId === ana)?.token ?? "";
    expect(token).not.toBe("");

    expect((await getSurveyInviteForActor(otra, token)).state).toBe("NOT_FOUND");
    const open = await getSurveyInviteForActor(ana, token);
    expect(open.state).toBe("OPEN");
    const invalid = await answerSurveyAs({ personId: ana }, token, { calif: "9" });
    expect(invalid).toEqual({ ok: false, errors: { calif: "T-1171" } });
    const ok = await answerSurveyAs({ personId: ana }, token, {
      calif: "5",
      comentario: "Muy bien",
    });
    expect(ok).toEqual({ ok: true });
    expect((await getSurveyInviteForActor(ana, token)).state).toBe("ANSWERED");
    expect(await answerSurveyAs({ personId: ana }, token, { calif: "1" })).toEqual({
      ok: false,
      state: "ANSWERED",
    });
    const responses = await db().select().from(occasionSurveyResponse);
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ occasionId: created, committeeId });
    expect(responses[0]?.answers).toEqual({ calif: 5, comentario: "Muy bien" });
    expect(Object.keys(responses[0] ?? {})).not.toContain("personId");
    const audits = await db().select().from(auditLog).where(eq(auditLog.action, "survey.answered"));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.after)).not.toContain("Muy bien");

    const summary = await surveySummary(created);
    expect(summary).toMatchObject({ invited: 1, answered: 1, formTitle: "encuesta" });
    expect(summary?.questions[0]?.average).toBe(5);
    expect(summary?.questions[1]?.texts).toBeNull();
    const committee = await surveySummaryForCommittee(termId, committeeId);
    expect(committee.rows).toHaveLength(1);
    expect(committee.rows[0]).toMatchObject({
      occasionId: created,
      invited: 1,
      answered: 1,
      average: 5,
    });
    expect(committee.average).toBe(5);

    // Ventana vencida: una invitación de una ocasión cerrada hace más de `survey.windowDays`.
    await db()
      .update(occasion)
      .set({ closedAt: new Date(Date.now() - 30 * 86_400_000) })
      .where(eq(occasion.id, created));
    const { created: late } = await createSurveyInvites(created);
    expect(late).toHaveLength(0);
    const [inviteRow] = await db()
      .select()
      .from(occasionSurveyInvite)
      .where(eq(occasionSurveyInvite.occasionId, created));
    await db()
      .update(occasionSurveyInvite)
      .set({ answeredAt: null })
      .where(eq(occasionSurveyInvite.id, inviteRow?.id ?? ""));
    expect((await getSurveyInviteForActor(ana, token)).state).toBe("EXPIRED");
  });
});
