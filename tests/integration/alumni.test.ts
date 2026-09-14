import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { listAlumniByYear } from "@/modules/people/domain/alumni";
import { addAppointment } from "@/modules/people/domain/appointments";
import { recordConsent, revokeConsent } from "@/modules/people/domain/consents";
import { membership, person } from "@/modules/people/schema";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
  seedTerm,
} from "./factories";

async function alumni(email: string, name: string, endedAt: Date): Promise<string> {
  const termId = await seedTerm("2024-1");
  const [firstName, lastName] = name.split(" ") as [string, string];
  const personId = await seedPerson(email, { firstName, lastName, stage: "ALUMNI" });
  await seedMembership(personId, termId, "INACTIVE");
  await getDb().update(membership).set({ endedAt }).where(eq(membership.personId, personId));
  return personId;
}

describe("galería de egresados", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("agrupa por año de salida a quienes dieron consentimiento MEMORIAL y no están anonimizados", async () => {
    const t2024 = await seedTerm("2024-1");
    const t2026 = await seedTerm();
    const a3 = await seedCommittee("a3");
    const ana = await alumni("ana@eafit.edu.co", "Ana Arango", new Date("2024-06-15T05:00:00Z"));
    const bruno = await alumni(
      "bruno@eafit.edu.co",
      "Bruno Betancur",
      new Date("2023-12-01T05:00:00Z"),
    );
    const cami = await alumni(
      "cami@eafit.edu.co",
      "Camila Cadavid",
      new Date("2024-06-15T05:00:00Z"),
    );
    await seedCommitteeMembership(ana, a3, t2024, "GENERAL");
    await seedCommitteeMembership(ana, a3, t2026, "MIEMBRO");
    // Junta y mesa no conviven (ADR-060 regla 11): el dato histórico entra como excepción con motivo.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addAppointment(ctx, ana, { kind: "VP_GH", termId: t2024 }, { reason: "histórico" }),
    );
    for (const id of [ana, bruno, cami]) {
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        recordConsent(ctx, id, { purpose: "MEMORIAL", source: "ADMIN" }),
      );
    }
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, ana, { purpose: "DIRECTORY_PHOTO", source: "SELF" }),
    );
    await getDb().update(person).set({ photoAssetId: "foto-ana" }).where(eq(person.id, ana));
    await getDb().update(person).set({ photoAssetId: "foto-cami" }).where(eq(person.id, cami));
    // Bruno retiró el consentimiento; una persona activa con consentimiento no es egresada todavía.
    await runCommand(SYSTEM_ACTOR, (ctx) => revokeConsent(ctx, bruno, "MEMORIAL"));
    const active = await seedPerson("activa@eafit.edu.co", { stage: "MEMBER" });
    await seedMembership(active, t2026);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      recordConsent(ctx, active, { purpose: "MEMORIAL", source: "SELF" }),
    );

    const years = await listAlumniByYear();
    expect(years.map((group) => group.year)).toEqual([2024]);
    expect(years[0]?.entries.map((entry) => entry.fullName)).toEqual([
      "Ana Arango",
      "Camila Cadavid",
    ]);
    const first = years[0]?.entries[0];
    expect(first).toMatchObject({
      photoAssetId: "foto-ana",
      committees: ["A3 · General"],
      fromTermCode: "2024-1",
    });
    expect(first?.appointments).toEqual([
      {
        kind: "VP_GH",
        title: null,
        termCode: "2024-1",
        roleLabel: null,
        editionLabel: null,
        coDirector: false,
      },
    ]);
    // Sin consentimiento de foto no hay foto, aunque exista.
    expect(years[0]?.entries[1]?.photoAssetId).toBeNull();

    await getDb().update(person).set({ anonymizedAt: new Date() }).where(eq(person.id, cami));
    expect((await listAlumniByYear())[0]?.entries).toHaveLength(1);
  });
});
