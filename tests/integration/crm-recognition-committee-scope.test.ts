import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { listCommitteeAnnouncements } from "@/modules/content";
import { grantRecognitionAs } from "@/modules/crm";
import { recognition } from "@/modules/crm/schema";
import { setProbation } from "@/modules/people/domain/term-outcomes";
import { consent } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedCommittee, seedCommitteeMembership, seedMember, seedTerm } from "./factories";

// DT-146 inciso (c), ADR-122 regla 2: un reconocimiento que llega con comité es de alguien que está
// vivo en ese comité en ese término. Antes lo comprobaba solo la pantalla del líder; un llamador nuevo
// con el comité A y una persona del comité B publicaba un anuncio con su nombre en la cartelera de A.

const leader = { personId: null, ip: null };

async function setup() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3");
  const pixel = await seedCommittee("pixel");
  return { termId, a3, pixel };
}

/** Con consentimiento de directorio el destacado se publica: es el caso que deja más cosas escritas. */
async function memberWithConsent(email: string): Promise<string> {
  const personId = await seedMember(email);
  await getDb().insert(consent).values({
    personId,
    purpose: "DIRECTORY_PHOTO",
    source: "SELF",
    policyVersion: "prueba-v1",
  });
  return personId;
}

async function written(): Promise<{ recognitions: number; audits: number; events: number }> {
  const db = getDb();
  return {
    recognitions: (await db.select({ id: recognition.id }).from(recognition)).length,
    audits: (await db.select({ id: auditLog.id }).from(auditLog)).length,
    events: (await db.select({ id: outbox.id }).from(outbox)).length,
  };
}

describe("el reconocimiento de un comité es de alguien de ese comité", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el destacado de un comité con una persona de otro responde como si no existiera y no publica nada", async () => {
    const f = await setup();
    const outsider = await memberWithConsent("otro.comite@eafit.edu.co");
    await seedCommitteeMembership(outsider, f.pixel, f.termId);
    const before = await written();

    await expect(
      grantRecognitionAs(leader, {
        personId: outsider,
        kind: "MEMBER_OF_MONTH",
        committeeId: f.a3,
        termId: f.termId,
        month: 8,
        title: "",
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await listCommitteeAnnouncements(f.a3)).toEqual([]);
    expect(await written()).toEqual(before);
  });

  // El alcance va antes que el bloqueo de beneficios: si no, T-2331 le diría a quien llama que una
  // persona que no es de su comité está en periodo de prueba o con los derechos suspendidos.
  it("una persona de otro comité en periodo de prueba responde lo mismo que cualquier ajena, sin delatar su condición", async () => {
    const f = await setup();
    const outsider = await memberWithConsent("otro.en.prueba@eafit.edu.co");
    await seedCommitteeMembership(outsider, f.pixel, f.termId);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, outsider, f.termId, {
        committeeId: f.pixel,
        probation: true,
        reason: "Prueba sintética",
      }),
    );
    const before = await written();

    await expect(
      grantRecognitionAs(leader, {
        personId: outsider,
        kind: "MEMBER_OF_MONTH",
        committeeId: f.a3,
        termId: f.termId,
        month: 8,
        title: "",
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await written()).toEqual(before);
  });

  it("alguien del comité en periodo de prueba sigue respondiendo que tiene los beneficios bloqueados", async () => {
    const f = await setup();
    const member = await memberWithConsent("propio.en.prueba@eafit.edu.co");
    await seedCommitteeMembership(member, f.a3, f.termId);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, member, f.termId, {
        committeeId: f.a3,
        probation: true,
        reason: "Prueba sintética",
      }),
    );

    await expect(
      grantRecognitionAs(leader, {
        personId: member,
        kind: "MEMBER_OF_MONTH",
        committeeId: f.a3,
        termId: f.termId,
        month: 8,
        title: "",
      }),
    ).rejects.toThrow(t("T-2331"));
  });

  it("con alguien que está vivo en el comité, el destacado se publica en su cartelera", async () => {
    const f = await setup();
    const member = await memberWithConsent("miembro.comite@eafit.edu.co");
    await seedCommitteeMembership(member, f.a3, f.termId);

    const granted = await grantRecognitionAs(leader, {
      personId: member,
      kind: "MEMBER_OF_MONTH",
      committeeId: f.a3,
      termId: f.termId,
      month: 8,
      title: "",
    });

    expect(granted.published).toBe(true);
    expect(await listCommitteeAnnouncements(f.a3)).toHaveLength(1);
  });

  // Falla cerrado: el destacado del mes es de un comité (ADR-036 regla 7). Sin él no hay roster contra
  // el que comprobar a la persona, así que no se registra.
  it("un destacado del mes que llega sin comité no se registra: su alcance no es opcional", async () => {
    const f = await setup();
    const member = await memberWithConsent("sin.comite@eafit.edu.co");
    await seedCommitteeMembership(member, f.a3, f.termId);
    const before = await written();

    await expect(
      grantRecognitionAs(leader, {
        personId: member,
        kind: "MEMBER_OF_MONTH",
        termId: f.termId,
        month: 8,
        title: "",
      }),
    ).rejects.toThrow(t("T-032"));

    expect(await written()).toEqual(before);
  });

  it("un premio OE sin comité no pide pertenencia a ninguno", async () => {
    const f = await setup();
    const personId = await seedMember("premio.oe@eafit.edu.co");

    const granted = await grantRecognitionAs(leader, {
      personId,
      kind: "OE_AWARD",
      termId: f.termId,
      award: "BEST_NEW_MEMBER",
      title: "",
    });

    expect(granted.published).toBe(false);
    expect((await written()).recognitions).toBe(1);
  });
});
