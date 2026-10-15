import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  cancelCampaignAs,
  createCampaignAs,
  createTemplate,
  estimateAudience,
  getCampaign,
  getPreferences,
  listRecipients,
  processCampaignBatch,
  scheduleCampaignAs,
  setMailTransportsForTests,
  startDueCampaigns,
  unsubscribeByToken,
  updateCampaignAs,
  updatePreferencesAs,
} from "@/modules/comms";
import { campaignRecipient, message } from "@/modules/comms/schema";
import { recordConsentAs } from "@/modules/people";
import type { MailMessage, MailTransport } from "@/shared/adapters/mail";
import { seedMember, seedMemberships, seedPerson, seedSegment, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Campañas (ADR-038 regla 8): audiencia congelada con elegibilidad por motivo, lotes por minuto por
// el transporte de desbordamiento, baja por token y cancelación en curso.

const db = () => getDb();

function fakeTransport(name: MailTransport["name"], sent: MailMessage[]): MailTransport {
  return {
    name,
    async send(mail) {
      sent.push(mail);
      return { id: `${name}_${sent.length}` };
    },
  };
}

async function seedTemplate(slug = "prueba"): Promise<string> {
  const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createTemplate(ctx, {
      slug,
      name: "Prueba",
      subject: "Hola {nombre}",
      body: "Hola **{nombre}**, sos de {comités} en {semestre}.\n\n[Mi OE]({url}/app)",
    }),
  );
  return id;
}

describe("campañas", () => {
  const primary: MailMessage[] = [];
  const overflow: MailMessage[] = [];
  beforeEach(async () => {
    await truncateAll();
    primary.length = 0;
    overflow.length = 0;
    setMailTransportsForTests({
      primary: fakeTransport("resend", primary),
      overflow: fakeTransport("ses", overflow),
    });
  });
  afterAll(async () => {
    setMailTransportsForTests(undefined);
    await closeDb();
  });

  it("congela la audiencia con la elegibilidad de cada persona y manda por SES con el enlace de baja", async () => {
    const termId = await seedTerm();
    const activa = await seedMember("activa@eafit.edu.co", { firstName: "Ana" });
    const baja = await seedMember("baja@eafit.edu.co");
    const egresadoSin = await seedPerson("egresado.sin@eafit.edu.co", { stage: "ALUMNI" });
    const egresadoCon = await seedPerson("egresado.con@eafit.edu.co", {
      stage: "ALUMNI",
      personalEmail: "egresado@gmail.com",
    });
    await seedMemberships([egresadoSin, egresadoCon], termId, "INACTIVE");
    await recordConsentAs(SYSTEM_ACTOR, egresadoCon, "COMMUNICATIONS", "SELF");
    await updatePreferencesAs(
      { personId: baja, ip: null },
      {
        emailCampaigns: false,
        pushAnnouncements: true,
        pushPoints: true,
        pushReminders: true,
        pushWordle: true,
        pushGamerStreak: false,
      },
    );
    const segmentId = await seedSegment("todos");
    const templateId = await seedTemplate();
    const { id } = await createCampaignAs(SYSTEM_ACTOR, {
      name: "Lanzamiento",
      templateId,
      segmentId,
    });

    const estimate = await estimateAudience(segmentId);
    expect(estimate).toMatchObject({ segment: 4, eligible: 2, optedOut: 1, noConsent: 1 });

    await scheduleCampaignAs(SYSTEM_ACTOR, id, new Date());
    expect((await getCampaign(id))?.status).toBe("SCHEDULED");
    await drainOutbox(); // campaign.start
    const campaign = await getCampaign(id);
    expect(campaign).toMatchObject({
      status: "SENT",
      totalCount: 4,
      sentCount: 2,
      skippedCount: 2,
    });
    const { rows } = await listRecipients(id);
    const byPerson = new Map(rows.map((row) => [row.personId, row]));
    expect(byPerson.get(activa)).toMatchObject({ status: "SENT" });
    expect(byPerson.get(baja)).toMatchObject({ status: "SKIPPED", skipReason: "OPTED_OUT" });
    expect(byPerson.get(egresadoSin)).toMatchObject({
      status: "SKIPPED",
      skipReason: "NO_CONSENT",
    });
    expect(byPerson.get(egresadoCon)).toMatchObject({ status: "SENT" });

    expect(primary).toHaveLength(0);
    expect(overflow).toHaveLength(2);
    const toAna = overflow.find((mail) => mail.to === "activa@eafit.edu.co");
    expect(toAna?.subject).toBe("Hola Ana");
    expect(toAna?.html).toContain("<strong>");
    expect(toAna?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(toAna?.headers?.["List-Unsubscribe"]).toMatch(/\/api\/baja\//);
    expect(toAna?.text).toContain("/baja/");
    expect(overflow.some((mail) => mail.to === "egresado@gmail.com")).toBe(true);
    const messages = await db().select().from(message).where(eq(message.campaignId, id));
    expect(messages).toHaveLength(2);
    expect(messages.every((row) => row.kind === "CAMPAIGN" && row.provider === "ses")).toBe(true);
    void termId;
  });

  it("respeta el lote por minuto, la baja por token omite en la siguiente y cancelar deja lo pendiente omitido", async () => {
    await seedTerm();
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await seedMember(`lote${i}@eafit.edu.co`));
    }
    const segmentId = await seedSegment("lote");
    const templateId = await seedTemplate("lote");
    const { id } = await createCampaignAs(SYSTEM_ACTOR, { name: "Lote", templateId, segmentId });
    await scheduleCampaignAs(SYSTEM_ACTOR, id, new Date(Date.now() - 1000));
    expect(await startDueCampaigns()).toBe(1);
    expect(await processCampaignBatch(2)).toBe(2);
    let campaign = await getCampaign(id);
    expect(campaign).toMatchObject({ status: "SENDING", sentCount: 2, totalCount: 5 });
    expect(await processCampaignBatch(2)).toBe(2);
    expect(await processCampaignBatch(2)).toBe(1);
    campaign = await getCampaign(id);
    expect(campaign).toMatchObject({ status: "SENT", sentCount: 5 });
    expect(await processCampaignBatch(2)).toBe(0);

    // La baja por el token del pie: la siguiente campaña la omite.
    const first = ids[0] ?? "";
    const token = (await getPreferences(first)).unsubscribeToken ?? "";
    expect(token.length).toBeGreaterThan(10);
    expect(await unsubscribeByToken(token, null)).toBe(true);
    expect(await unsubscribeByToken("no-existe-este-token-xx", null)).toBe(false);
    expect((await getPreferences(first)).emailCampaigns).toBe(false);

    const second = await createCampaignAs(SYSTEM_ACTOR, { name: "Segunda", templateId, segmentId });
    await updateCampaignAs(SYSTEM_ACTOR, second.id, { name: "Segunda v2", templateId, segmentId });
    await scheduleCampaignAs(SYSTEM_ACTOR, second.id, new Date(Date.now() - 1000));
    await startDueCampaigns();
    const { rows } = await listRecipients(second.id);
    expect(rows.find((row) => row.personId === first)).toMatchObject({
      status: "SKIPPED",
      skipReason: "OPTED_OUT",
    });
    expect(await processCampaignBatch(2)).toBe(2);
    await cancelCampaignAs(SYSTEM_ACTOR, second.id);
    const cancelled = await getCampaign(second.id);
    expect(cancelled?.status).toBe("CANCELLED");
    const [pending] = await db()
      .select()
      .from(campaignRecipient)
      .where(eq(campaignRecipient.campaignId, second.id));
    expect(pending).toBeDefined();
    const left = await listRecipients(second.id);
    expect(left.rows.filter((row) => row.status === "PENDING")).toHaveLength(0);
    expect(left.rows.filter((row) => row.skipReason === "CANCELLED")).toHaveLength(2);
    await expect(
      updateCampaignAs(SYSTEM_ACTOR, second.id, { name: "x", templateId, segmentId }),
    ).rejects.toThrow();
  });
});
