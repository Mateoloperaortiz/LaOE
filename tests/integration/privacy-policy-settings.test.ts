import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { recordConsent } from "@/modules/people";
import { consent } from "@/modules/people/schema";
import {
  getPrivacyPolicyState,
  PrivacyPolicyPendingError,
  requireConfig,
  setPrivacyPolicyVersionAs,
} from "@/modules/system";
import { appConfig, auditLog } from "@/modules/system/schema";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

describe("guardado auditado de la versión de política", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("guarda el actor, invalida caché y bloquea enseguida sin cambiar aceptaciones históricas", async () => {
    const personId = await seedMember("politica.admin@eafit.edu.co");
    const actor = { personId, ip: "127.0.0.1" };
    await setPrivacyPolicyVersionAs(actor, "pendiente");
    expect(await requireConfig("privacy.policyVersion")).toBe("pendiente");

    await setPrivacyPolicyVersionAs(actor, " prueba-administrada-v2 ");
    expect(await requireConfig("privacy.policyVersion")).toBe("prueba-administrada-v2");
    expect(await getPrivacyPolicyState()).toEqual({
      ready: true,
      version: "prueba-administrada-v2",
    });
    await runCommand(actor, (ctx) =>
      recordConsent(ctx, personId, { purpose: "MEMORIAL", source: "SELF" }),
    );
    await setPrivacyPolicyVersionAs(actor, " PENDIENTE ");
    expect(await getPrivacyPolicyState()).toEqual({ ready: false, version: "pendiente" });
    expect(await requireConfig("privacy.policyVersion")).toBe("pendiente");
    await expect(
      runCommand(actor, (ctx) =>
        recordConsent(ctx, personId, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
      ),
    ).rejects.toBeInstanceOf(PrivacyPolicyPendingError);

    const [config] = await getDb()
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, "privacy.policyVersion"));
    expect(config).toMatchObject({ value: "pendiente", updatedById: personId });
    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "config.updated"));
    expect(audits).toHaveLength(3);
    expect(audits.every((entry) => entry.actorId === personId && entry.ip === actor.ip)).toBe(true);
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ before: "pendiente", after: "prueba-administrada-v2" }),
        expect.objectContaining({ before: "prueba-administrada-v2", after: "pendiente" }),
      ]),
    );
    const accepted = await getDb().select().from(consent);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ policyVersion: "prueba-administrada-v2", revokedAt: null });
  });

  it("una versión inválida no altera configuración ni crea auditoría", async () => {
    const before = await getPrivacyPolicyState();
    await expect(setPrivacyPolicyVersionAs({ personId: null, ip: null }, " \n ")).rejects.toThrow();
    expect(await getPrivacyPolicyState()).toEqual(before);
    expect(await getDb().select().from(auditLog)).toHaveLength(0);
  });
});
