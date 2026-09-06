import { count } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  addAppointment,
  listAppointments,
  removeAppointment,
} from "@/modules/people/domain/appointments";
import {
  hasLiveConsent,
  listConsents,
  recordConsent,
  revokeConsent,
} from "@/modules/people/domain/consents";
import { auditLog, outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

describe("consentimientos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("un consentimiento vivo por propósito, con versión de la política, historial y eventos", async () => {
    const personId = await seedMember("consiente@eafit.edu.co");
    const first = await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, personId, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
    );
    const again = await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, personId, { purpose: "DIRECTORY_PHOTO", source: "ADMIN" }),
    );
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });
    expect(await hasLiveConsent(personId, "DIRECTORY_PHOTO")).toBe(true);
    expect(await hasLiveConsent(personId, "MEMORIAL")).toBe(false);

    expect(
      await runCommand(SYSTEM_ACTOR, (ctx) => revokeConsent(ctx, personId, "DIRECTORY_PHOTO")),
    ).toBe(true);
    expect(
      await runCommand(SYSTEM_ACTOR, (ctx) => revokeConsent(ctx, personId, "DIRECTORY_PHOTO")),
    ).toBe(false);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, personId, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
    );
    const states = await listConsents(personId);
    const photo = states.find((item) => item.purpose === "DIRECTORY_PHOTO");
    expect(photo?.live?.policyVersion).toBe("prueba-v1");
    expect(photo?.history).toHaveLength(2);
    expect(states).toHaveLength(5);

    const [audits] = await getDb().select({ n: count() }).from(auditLog);
    expect(audits?.n).toBe(3);
    const events = await getDb().select().from(outbox);
    expect(events.filter((row) => row.eventType === "consent.changed")).toHaveLength(3);
  });
});

describe("cargos de junta y de GH", () => {
  beforeEach(truncateAll);

  it("se agregan y se quitan con historia por término", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("junta@eafit.edu.co");
    const added = await runCommand(SYSTEM_ACTOR, (ctx) =>
      addAppointment(ctx, personId, { kind: "VP_GH", termId }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addAppointment(ctx, personId, { kind: "OTHER", termId, title: "Tesorería" }),
    );
    const listed = await listAppointments(personId);
    expect(listed.map((item) => item.title ?? item.kind).sort()).toEqual(["Tesorería", "VP_GH"]);
    await runCommand(SYSTEM_ACTOR, (ctx) => removeAppointment(ctx, added.id));
    expect((await listAppointments(personId)).map((item) => item.kind)).toEqual(["OTHER"]);
  });
});
