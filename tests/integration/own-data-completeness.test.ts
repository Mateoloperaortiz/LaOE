import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import {
  getPreferences,
  unsubscribeByToken,
  updatePreferencesAs,
} from "@/modules/comms/domain/preferences";
import { saveSubscriptionAs } from "@/modules/comms/domain/subscriptions";
import { markOnboardingStep } from "@/modules/crm/domain/onboarding";
import { formSubmission } from "@/modules/forms/schema";
import { getOrCreateCalendarToken } from "@/modules/identity/domain/calendar-token";
import { credential } from "@/modules/identity/schema";
import { adjustPoints } from "@/modules/participation/domain/ledger";
import { grantReward, reserveReward, reverseReward } from "@/modules/participation/domain/rewards";
import { colorRun } from "@/modules/participation/schema";
import { changeMembershipStatus } from "@/modules/people/domain/membership";
import { setProbation } from "@/modules/people/domain/term-outcomes";
import { membership } from "@/modules/people/schema";
import { confirmDecisions, listClosingRows } from "@/modules/permanence/domain/closing";
import { grantManualCredit, scoreCriterion } from "@/modules/permanence/domain/leader-scores";
import { recomputeSnapshots } from "@/modules/permanence/domain/snapshots";
import { permanenceSnapshot } from "@/modules/permanence/schema";
import { auditLog } from "@/modules/system/schema";
import {
  leaveUntilSoon,
  seedAuditFact,
  seedCall,
  seedCallEntry,
  seedCampaign,
  seedCampaignRecipients,
  seedChallenge,
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedConfig,
  seedCredential,
  seedEmailTemplate,
  seedForm,
  seedInteractions,
  seedLeaderScore,
  seedManualCredit,
  seedMediaAsset,
  seedMember,
  seedMembershipTerm,
  seedOccasion,
  seedParticipation,
  seedPermission,
  seedRequest,
  seedRule,
  seedSegment,
  seedSentEmails,
  seedSubmission,
  seedTag,
  seedTerm,
  seedWordleGame,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import {
  seedAssemblyRequirement,
  seedContinuesDecision,
  seedFailedPushReceipt,
  seedOtherRecognition,
  seedPersonTags,
  seedPersonTask,
  seedPresenceBonus,
  seedRecoveryGrant,
  seedWarningSanction,
} from "../factories/personal-records";
import { truncateAll } from "./db";

let personId = "";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));
vi.mock("@/modules/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/identity")>()),
  getActor: () => Promise.resolve({ personId, otpVerifiedAt: new Date() }),
}));
const { GET } = await import("@/app/api/mis-datos/route");

describe("Mis datos incluye las categorías de la política con aislamiento por titular", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("conserva la condición congelada al salir a licencia aunque cambie la prueba actual, y valida el JSON histórico", async () => {
    const termId = await seedTerm();
    personId = await seedMember("licencia.congelada@example.test");
    await seedMembershipTerm(personId, termId, true);
    await runCommand({ personId, ip: null }, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Licencia sintética",
        leaveUntil: leaveUntilSoon(),
      }),
    );
    await runCommand({ personId, ip: null }, (ctx) =>
      setProbation(ctx, personId, termId, {
        probation: false,
        reason: "Prueba del término retirada después de salir a licencia",
      }),
    );
    const [stored] = await getDb()
      .select({ leaveCondition: membership.leaveCondition })
      .from(membership)
      .where(eq(membership.personId, personId));
    if (!stored?.leaveCondition) throw new Error("Falta la condición congelada sintética");
    const data = await (await GET()).json();
    expect(data.membership).toMatchObject({
      status: "ON_LEAVE",
      leaveCondition: stored.leaveCondition,
      leaveConditionAvailable: true,
    });
    expect(
      data.membership.leaveCondition.some((row: { probation: boolean }) => row.probation),
    ).toBe(true);
    expect(data.probation.every((row: { probation: boolean }) => !row.probation)).toBe(true);
    // JSON histórico con una clave adicional: se conserva el dato conocido sin exportar el extra.
    const conditionWithExtra = stored.leaveCondition.map((row) => ({
      ...row,
      internalSecret: "NO_EXPORTAR_CONDICION",
    }));
    await getDb()
      .update(membership)
      .set({ leaveCondition: conditionWithExtra })
      .where(eq(membership.personId, personId));
    const projected = await (await GET()).json();
    expect(projected.membership.leaveCondition).toEqual(stored.leaveCondition);
    expect(projected.membership.leaveConditionAvailable).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("NO_EXPORTAR_CONDICION");
    // Ningún comando escribe este booleano inválido: representa una fila histórica dañada.
    await getDb()
      .update(membership)
      .set({
        leaveCondition: JSON.parse(
          '[{"committeeId":null,"probation":"invalida","reportAsVeteran":false,"resumedNew":false}]',
        ),
      })
      .where(eq(membership.personId, personId));
    const invalid = await (await GET()).json();
    expect(invalid.membership).toMatchObject({
      leaveCondition: null,
      leaveConditionAvailable: false,
    });
  });

  it("incluye cambios y baja de preferencias y el ciclo auditado de premios propios sin operaciones ajenas", async () => {
    const termId = await seedTerm();
    personId = await seedMember("auditoria.premios@example.test");
    const other = await seedMember("auditoria.premios.ajenos@example.test");
    const rewardIds = new Map<string, string>();
    const tokens: string[] = [];
    for (const who of [personId, other]) {
      await updatePreferencesAs(
        { personId: who, ip: null },
        {
          emailCampaigns: true,
          pushAnnouncements: true,
          pushPoints: true,
          pushReminders: true,
          pushWordle: false,
          pushGamerStreak: true,
        },
      );
      const preferences = await getPreferences(who);
      if (!preferences.unsubscribeToken) throw new Error("Falta el token de baja sintético");
      tokens.push(preferences.unsubscribeToken);
      expect(await unsubscribeByToken(preferences.unsubscribeToken, null)).toBe(true);
      const challengeId = await seedChallenge(termId);
      const participationId = await seedParticipation(challengeId, who);
      const reserved = await runCommand({ personId: who, ip: null }, (ctx) =>
        reserveReward(
          ctx,
          {
            personId: who,
            termId,
            source: "CHALLENGE",
            participationId,
            base: 10,
            personalPercent: 0,
            campaignPercent: 0,
          },
          { daily: 20, weekly: 60 },
        ),
      );
      rewardIds.set(who, reserved.reward.id);
      await runCommand({ personId: who, ip: null }, (ctx) =>
        grantReward(ctx, reserved.reward.id, {
          base: "Premio sintético",
          extra: "Extra sintético",
        }),
      );
      await runCommand({ personId: who, ip: null }, (ctx) =>
        reverseReward(ctx, reserved.reward.id, "Reversión sintética"),
      );
    }
    const data = await (await GET()).json();
    const ownPreferences = data.auditHistory.filter(
      (row: { entityType: string }) => row.entityType === "notification_preference",
    );
    expect(ownPreferences.map((row: { action: string }) => row.action).sort()).toEqual([
      "notification-preference.unsubscribed",
      "notification-preference.updated",
    ]);
    expect(ownPreferences.every((row: { entityId: string }) => row.entityId === personId)).toBe(
      true,
    );
    const ownRewards = data.auditHistory.filter(
      (row: { entityType: string }) => row.entityType === "reward",
    );
    expect(ownRewards.map((row: { action: string }) => row.action).sort()).toEqual([
      "reward.granted",
      "reward.reserved",
      "reward.reversed",
    ]);
    expect(
      ownRewards.every((row: { entityId: string }) => row.entityId === rewardIds.get(personId)),
    ).toBe(true);
    expect(data.rewards).toHaveLength(1);
    expect(data.rewards[0].status).toBe("REVERSED");
    const serialized = JSON.stringify(data);
    for (const secret of [...tokens, other, rewardIds.get(other)]) {
      if (!secret) throw new Error("Falta el dato sintético ajeno");
      expect(serialized).not.toContain(secret);
    }
  });

  it("incluye más de cien mensajes propios y declara el alcance sin entregar los ajenos", async () => {
    personId = await seedMember("titular.mensajes@example.test");
    const other = await seedMember("otra.mensajes@example.test");
    await seedSentEmails(personId, 105, { provider: "console", sentAt: new Date() });
    await seedSentEmails(other, 1, {
      provider: "console",
      sentAt: new Date(),
      subject: "MENSAJE_AJENO",
    });
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.messages).toHaveLength(105);
    expect(data.exportCoverage.collections.messages).toEqual({
      limit: 10000,
      returned: 105,
      truncated: false,
    });
    expect(data.exportCoverage.truncated).toBe(false);
    expect(JSON.stringify(data)).not.toContain("MENSAJE_AJENO");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      await getDb()
        .select({ ip: auditLog.ip })
        .from(auditLog)
        .where(eq(auditLog.action, "export.self")),
    ).toEqual([{ ip: "203.0.113.7" }]);
  });

  it("un historial que supera el máximo declara el corte real dentro del archivo", async () => {
    personId = await seedMember("titular.tope@example.test");
    await seedSentEmails(personId, 10001, { provider: "console", sentAt: new Date() });
    const data = await (await GET()).json();
    expect(data.messages).toHaveLength(10000);
    expect(data.exportCoverage.collections.messages).toEqual({
      limit: 10000,
      returned: 10000,
      truncated: true,
    });
    expect(data.exportCoverage.truncated).toBe(true);
  });

  it("solo entrega metadatos propios de calendario, archivos y recibos push, sin soluciones ni JSON desconocidos", async () => {
    const termId = await seedTerm();
    personId = await seedMember("titular.privacidad@example.test");
    const other = await seedMember("otra.privacidad@example.test");
    const formId = await seedForm("respuestas-proyectadas", {
      fields: [{ key: "motivo", type: "TEXT", label: "Motivo" }],
    });
    await seedSubmission(formId, "titular.privacidad@example.test", {
      personId,
      answers: {
        motivo: "Respuesta propia",
        secret: "SECRETO_DESCONOCIDO",
        nested: { thirdParty: other },
      },
    });
    await seedWordleGame(personId, termId, "2026-08-10", { status: "LOST", answer: "QUESO" });
    // Fila dañada: ningún escritor de Color guarda claves extra en un HSL (excepción ADR-124).
    const color = { h: 120, s: 50, l: 50, internalSecret: "COLOR_INTERNO_NO_EXPORTAR" };
    await getDb()
      .insert(colorRun)
      .values({
        personId,
        termId,
        day: "2026-08-10",
        rulesVersion: "color-oklab-1",
        status: "FINISHED",
        startRequestId: "CLAVE_INTERNA_COLOR",
        targets: [color, color, color],
        round: 3,
        watchStartedAt: new Date(),
        finishedAt: new Date(),
        average: 100,
        results: [
          {
            round: 1,
            target: color,
            answer: color,
            accuracy: 100,
            requestId: "CLAVE_INTERNA_COLOR",
          },
        ],
      });
    const secrets: string[] = [];
    let ownReceipt: Awaited<ReturnType<typeof seedFailedPushReceipt>> | undefined;
    for (const [who, prefix] of [
      [personId, "propio"],
      [other, "ajeno"],
    ] as const) {
      secrets.push(await getOrCreateCalendarToken(who));
      await seedCredential(who, `${prefix}-contrasena-sintetica-2026`);
      const [saved] = await getDb()
        .select({ hash: credential.passwordHash })
        .from(credential)
        .where(eq(credential.personId, who));
      if (!saved) throw new Error("Falta la credencial sintética");
      secrets.push(saved.hash);
      const mediaId = await seedMediaAsset(`photos/${who}/${prefix}-CLAVE_SECRETA.webp`, {
        uploadedById: who,
      });
      const device = await saveSubscriptionAs(
        { personId: who, ip: null },
        {
          endpoint: `https://fcm.googleapis.com/fcm/send/${prefix}-ENDPOINT_SECRETO`,
          keys: { p256dh: "CLAVE_PUSH_SECRETA", auth: "AUTH_PUSH_SECRETA" },
        },
        null,
      );
      const permissionId = await seedPermission(who, "BOARD", null, other);
      const grant = await seedRecoveryGrant(who, other);
      secrets.push(grant.tokenHash);
      await seedPresenceBonus(who, termId, "2026-08-10");
      for (const fact of [
        { entityType: "media_asset", entityId: mediaId, action: "media.uploaded" },
        {
          entityType: "presence_bonus",
          entityId: `${who}:${termId}:2026-08-10`,
          action: "presence-streak.reconciled",
        },
        { entityType: "permission", entityId: permissionId, action: "permission.granted" },
        { entityType: "access_grant", entityId: grant.id, action: "access-grant.issued" },
      ])
        await seedAuditFact({ ...fact, actorId: other });
      const receipt = await seedFailedPushReceipt(who, device.id, "ERROR_SECRETO_PROVEEDOR");
      if (who === personId) ownReceipt = receipt;
    }
    const data = await (await GET()).json();
    expect(data.calendar).toMatchObject({ createdAt: expect.any(String), lastUsedAt: null });
    expect(data.passwordCredential).toMatchObject({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(data.mediaFiles).toHaveLength(1);
    expect(data.auditHistory.map((row: { action: string }) => row.action).sort()).toEqual([
      "access-grant.issued",
      "media.uploaded",
      "permission.granted",
      "presence-streak.reconciled",
      "push-subscription.created",
    ]);
    expect(data.pushDeliveries).toEqual([
      expect.objectContaining({
        id: ownReceipt?.deliveryId,
        messageId: ownReceipt?.messageId,
        status: "FAILED",
        retryable: true,
      }),
    ]);
    expect(data.formSubmissions[0].answers).toEqual({ motivo: "Respuesta propia" });
    expect(data.formSubmissions[0].answersRequiringReview).toBe(2);
    expect(data.wordleGames[0]).not.toHaveProperty("answer");
    expect(data.currentGamification).toHaveProperty("ghPoints");
    const serialized = JSON.stringify(data);
    for (const value of [
      ...secrets,
      "CLAVE_SECRETA",
      "ERROR_SECRETO_PROVEEDOR",
      "SECRETO_DESCONOCIDO",
      "QUESO",
      "COLOR_INTERNO_NO_EXPORTAR",
      "CLAVE_INTERNA_COLOR",
      "ENDPOINT_SECRETO",
      "CLAVE_PUSH_SECRETA",
      "AUTH_PUSH_SECRETA",
      other,
      "ajeno-",
    ])
      expect(serialized).not.toContain(value);
  });

  it("incluye hechos propios de cada categoría y excluye la fila ajena y las notas internas", async () => {
    const termId = await seedTerm();
    personId = await seedMember("titular.categorias@example.test");
    const other = await seedMember("otra.categorias@example.test");
    const { id: occasionId } = await seedOccasion(termId);
    const formId = await seedForm("exportacion-segura", {
      fields: [{ key: "motivo", type: "TEXT", label: "Motivo" }],
    });
    const ruleId = await seedRule(termId, "credito-propio");
    const leaderRuleId = await seedRule(termId, "lider-propio", { computation: "LEADER_SCORE" });
    const groupId = await seedWorkGroup(termId, "Grupo sintético");
    const callId = await seedCall(termId, groupId);
    const tagId = await seedTag("Etiqueta sintética");
    const templateId = await seedEmailTemplate("exportacion");
    const segmentId = await seedSegment("Exportación");
    const campaignId = await seedCampaign("Exportación", templateId, segmentId);
    for (const [who, prefix] of [
      [personId, "propio"],
      [other, "ajeno"],
    ] as const) {
      await seedCheckIn(occasionId, who, "APPROVED", {
        id: `${prefix}-asistencia`,
        reason: "NOTA_INTERNA_SECRETA",
      });
      // El libro es el único escritor de los movimientos, también en pruebas (ADR-119 regla 8).
      await runCommand({ personId: other, ip: null }, (ctx) =>
        adjustPoints(ctx, { personId: who, termId, points: 1, reason: "NOTA_INTERNA_SECRETA" }),
      );
      await seedWarningSanction(who, termId, "NOTA_INTERNA_SECRETA");
      await seedRequest(who, termId, "LEAVE", {
        payload: {
          reason: `${prefix}-motivo`,
          until: "2026-12-01",
          internalSecret: "NO_EXPORTAR_PAYLOAD",
        },
      });
      await seedSubmission(formId, `${prefix}@example.test`, {
        personId: who,
        answers: { motivo: `${prefix}-respuesta` },
      });
      // Snapshot dañado: una clave desconocida que el cálculo actual no produce (excepción ADR-124).
      await getDb()
        .insert(permanenceSnapshot)
        .values({
          id: `${prefix}-snapshot`,
          personId: who,
          termId,
          status: "ACTIVE",
          generalTotal: 7,
          generalMax: 10,
          general: [
            {
              ruleId,
              key: "credito-propio",
              label: "Crédito",
              computation: "MANUAL",
              weight: 10,
              achieved: 7,
              remaining: 0,
              detail: { type: "MANUAL", credited: 7, reason: "NOTA_INTERNA_SECRETA" },
              internalSecret: "NO_EXPORTAR_SNAPSHOT",
            },
          ],
          results: [],
          mandatory: {
            required: { ordinary: 1, boardElection: false, runoff: false },
            attended: { ordinary: 1, boardElection: false, runoff: false },
            met: true,
            missing: [],
            lost: [],
            upcoming: [],
          },
        });
      await seedContinuesDecision(who, termId, "NOTA_INTERNA_SECRETA");
      await seedLeaderScore(termId, leaderRuleId, who, 7);
      await seedManualCredit(termId, ruleId, who, 7, { reason: "NOTA_INTERNA_SECRETA" });
      await seedWorkGroupMembership(groupId, who, "GOOD", other);
      await seedCallEntry(callId, who);
      await seedOtherRecognition(who, termId, "Reconocimiento sintético", other);
      await seedPersonTags(who, [tagId]);
      await seedCampaignRecipients(campaignId, [{ personId: who }]);
      await seedAssemblyRequirement(who, termId, "NOTA_INTERNA_SECRETA");
      await seedInteractions(who, [
        {
          kind: "NOTE",
          summary: "NOTA_INTERNA_SECRETA",
          body: "NOTA_INTERNA_SECRETA",
          actorId: other,
          occurredAt: new Date(),
        },
      ]);
      await seedPersonTask(who, "NOTA_INTERNA_SECRETA", other);
      await seedAuditFact({
        entityType: "person",
        entityId: who,
        action: "person.updated",
        actorId: other,
        after: { tercero: "NO_EXPORTAR_AUDITORIA" },
      });
    }
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    for (const section of [
      "checkIns",
      "pointEntries",
      "sanctions",
      "requests",
      "formSubmissions",
      "permanenceSnapshots",
      "permanenceDecisions",
      "leaderScores",
      "manualCredits",
      "workGroupMemberships",
      "recognitions",
      "internalCallEntries",
      "personTags",
      "campaignRecipients",
      "assemblyRequirements",
      "timeline",
      "tasks",
      "auditHistory",
    ]) {
      const expected = section === "auditHistory" ? 2 : 1;
      expect(data[section], section).toHaveLength(expected);
      expect(data.exportCoverage.collections[section], section).toMatchObject({
        limit: 10000,
        returned: expected,
        truncated: false,
      });
    }
    expect(data.requests[0].payload).toEqual({ reason: "propio-motivo", until: "2026-12-01" });
    expect(data.formSubmissions[0].answers).toEqual({ motivo: "propio-respuesta" });
    expect(data.permanenceSnapshots[0].general[0]).toMatchObject({ achieved: 7, weight: 10 });
    expect(data.leaderScores[0].value).toBe(7);
    expect(data.manualCredits[0].value).toBe(7);
    expect(data.exportCoverage.reviewRequired).toContain("permanenceDecisions.reason");
    const serialized = JSON.stringify(data);
    for (const value of ["ajeno-", "NOTA_INTERNA_SECRETA", "NO_EXPORTAR_", other])
      expect(serialized).not.toContain(value);
    const [stored] = await getDb()
      .select({ answers: formSubmission.answers })
      .from(formSubmission)
      .where(eq(formSubmission.personId, personId));
    expect(stored?.answers).toEqual({ motivo: "propio-respuesta" });
  });

  it("incluye las auditorías con claves compuestas de los escritores reales sin mezclar a otra persona ni duplicar el cierre por comité", async () => {
    const termId = await seedTerm();
    personId = await seedMember("titular.auditoria@example.test");
    const other = await seedMember("otra.auditoria@example.test");
    const committees = [
      await seedCommittee("export-auditoria-a"),
      await seedCommittee("export-auditoria-b"),
    ];
    const committeeId = committees[0];
    if (!committeeId) throw new Error("Falta el comité sintético");
    const leaderRuleId = await seedRule(termId, "lider-auditoria", {
      committeeId,
      computation: "LEADER_SCORE",
    });
    const manualRuleId = await seedRule(termId, "manual-auditoria");
    await seedConfig("onboarding.steps", [
      { key: "exportacion", label: "Paso sintético", auto: null },
    ]);
    for (const who of [personId, other]) {
      for (const id of committees) await seedCommitteeMembership(who, id, termId);
      await runCommand({ personId: other, ip: null }, async (ctx) => {
        await markOnboardingStep(ctx, who, termId, "exportacion");
        await scoreCriterion(
          ctx,
          { scope: "COMMITTEE", committeeId, termId },
          { personId: who, ruleId: leaderRuleId, value: 10, note: "" },
          { personName: "Persona sintética", committeeName: "Comité sintético", closed: false },
        );
        await grantManualCredit(
          ctx,
          { personId: who, ruleId: manualRuleId, value: 7, reason: "Motivo interno sintético" },
          { closed: false },
        );
      });
    }
    await recomputeSnapshots(termId);
    const closing = await listClosingRows(termId);
    expect(closing.rows).toHaveLength(2);
    for (const row of closing.rows) {
      await runCommand({ personId: other, ip: null }, (ctx) =>
        confirmDecisions(ctx, termId, row, {
          personId: row.personId,
          person: row.personProposed,
          committees: row.committees.map((committee) => ({
            committeeId: committee.committeeId,
            decision: committee.proposed,
          })),
          reason: "",
        }),
      );
    }
    const data = await (await GET()).json();
    expect(data.permanenceDecisions).toHaveLength(3);
    const expected = [
      { entityType: "onboarding_progress", entityId: `${personId}:${termId}:exportacion` },
      { entityType: "leader_score", entityId: `${leaderRuleId}:${personId}` },
      { entityType: "manual_credit", entityId: `${manualRuleId}:${personId}` },
      { entityType: "permanence_decision", entityId: `${termId}:${personId}` },
    ];
    expect(data.auditHistory).toEqual(
      expect.arrayContaining(expected.map((row) => expect.objectContaining(row))),
    );
    for (const row of expected)
      expect(
        data.auditHistory.filter(
          (fact: { entityType: string }) => fact.entityType === row.entityType,
        ),
      ).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(other);
  });
});
