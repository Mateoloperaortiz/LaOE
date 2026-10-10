import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { hasLiveConsent, recordConsentAs } from "@/modules/people";
import { consent } from "@/modules/people/schema";
import { appConfig, auditLog, outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// ADR-048: la autorización de membresía la da el titular en su primer ingreso.

const db = () => getDb();

async function setPolicy(version: string): Promise<void> {
  await db()
    .insert(appConfig)
    .values({ key: "privacy.policyVersion", value: version })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: version } });
}

describe("autorización en el primer ingreso (ADR-048)", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("registra la aceptación propia con la versión publicada, auditoría y evento", async () => {
    const personId = await seedMember("autorizacion@eafit.edu.co");
    await setPolicy('"2026-09-08"');
    expect(await hasLiveConsent(personId, "MEMBERSHIP")).toBe(false);

    const first = await recordConsentAs({ personId, ip: null }, personId, "MEMBERSHIP", "SELF");
    expect(first.created).toBe(true);
    expect(await hasLiveConsent(personId, "MEMBERSHIP")).toBe(true);

    const [row] = await db().select().from(consent).where(eq(consent.personId, personId));
    expect(row).toMatchObject({
      purpose: "MEMBERSHIP",
      source: "SELF",
      policyVersion: "2026-09-08",
      revokedAt: null,
    });
    expect(
      await db().select().from(auditLog).where(eq(auditLog.action, "consent.granted")),
    ).toHaveLength(1);
    expect(await db().select().from(outbox)).toHaveLength(1);
  });

  it("aceptar dos veces no duplica la autorización", async () => {
    const personId = await seedMember("autorizacion.repetida@eafit.edu.co");
    await setPolicy('"2026-09-08"');
    await recordConsentAs({ personId, ip: null }, personId, "MEMBERSHIP", "SELF");
    const again = await recordConsentAs({ personId, ip: null }, personId, "MEMBERSHIP", "SELF");
    expect(again.created).toBe(false);
    expect(await db().select().from(consent).where(eq(consent.personId, personId))).toHaveLength(1);
  });
});
