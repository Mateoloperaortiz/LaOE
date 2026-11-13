import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { boardComposition, seedWorkCommitteesAs } from "@/modules/permanence";
import { workGroup } from "@/modules/permanence/schema";
import { seedAppointment, seedMember, seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// La junta del semestre y sus comités de trabajo (ADR-194): los seis cargos en el orden de los
// Estatutos (art. 21), cada uno con su comité de trabajo y su estado. El CCM lo dirige la VP de
// Comunicaciones y Mercadeo (art. 27.8), no la de Relaciones Públicas.

const admin = { personId: null, ip: null };

beforeEach(truncateAll);
afterAll(closeDb);

const seatOf = (composition: Awaited<ReturnType<typeof boardComposition>>, kind: string) => {
  const seat = composition.seats.find((row) => row.kind === kind);
  if (!seat) throw new Error(`Falta el cargo ${kind}`);
  return seat;
};

describe("la junta del semestre", () => {
  it("cada cargo de la junta lidera su comité de trabajo, y el CCM es de Comunicaciones", async () => {
    const termId = await seedTerm();
    const cargos = [
      ["PRESIDENT", "presidencia.junta@eafit.edu.co"],
      ["VP_ADMIN", "administrativa.junta@eafit.edu.co"],
      ["VP_FINANCE", "financiera.junta@eafit.edu.co"],
      ["VP_PUBLIC_RELATIONS", "relaciones.junta@eafit.edu.co"],
      ["VP_COMMUNICATIONS", "comunicaciones.junta@eafit.edu.co"],
      ["VP_GH", "gestion.junta@eafit.edu.co"],
    ] as const;
    const people = new Map<string, string>();
    for (const [kind, email] of cargos) {
      const personId = await seedMember(email);
      await seedAppointment(personId, termId, kind);
      people.set(kind, personId);
    }
    await seedWorkCommitteesAs(admin, termId);

    const composition = await boardComposition(termId);
    expect(composition.seats.map((seat) => seat.kind)).toEqual([
      "PRESIDENT",
      "VP_ADMIN",
      "VP_FINANCE",
      "VP_PUBLIC_RELATIONS",
      "VP_COMMUNICATIONS",
      "VP_GH",
    ]);
    expect(
      composition.seats.map((seat) => [seat.kind, seat.committees.map((item) => item.code)]),
    ).toEqual([
      ["PRESIDENT", ["CAP"]],
      ["VP_ADMIN", ["CML"]],
      ["VP_FINANCE", ["CAF"]],
      ["VP_PUBLIC_RELATIONS", ["CAE"]],
      ["VP_COMMUNICATIONS", ["CCM"]],
      ["VP_GH", ["CGH"]],
    ]);
    for (const seat of composition.seats) {
      expect(seat.holders.map((holder) => holder.personId)).toEqual([people.get(seat.kind)]);
      expect(seat.committees[0]).toMatchObject({
        state: "OK",
        leader: { personId: people.get(seat.kind) },
      });
    }
    expect(composition.issues).toBe(0);
  });

  it("marca el cargo vacante, la titular en licencia y cada comité que no está al día", async () => {
    const termId = await seedTerm();
    const president = await seedMember("presidencia.revisar@eafit.edu.co");
    await seedAppointment(president, termId, "PRESIDENT");
    const gh = await seedPerson("gestion.licencia@eafit.edu.co");
    await seedMembership(gh, termId, "ON_LEAVE");
    await seedAppointment(gh, termId, "VP_GH");
    const relations = await seedMember("relaciones.revisar@eafit.edu.co");
    await seedAppointment(relations, termId, "VP_PUBLIC_RELATIONS");
    await seedWorkCommitteesAs(admin, termId);
    // La VP de Comunicaciones llega después de sembrar: el CCM quedó sin líder.
    const communications = await seedMember("comunicaciones.tarde@eafit.edu.co");
    await seedAppointment(communications, termId, "VP_COMMUNICATIONS");
    // Al CAE lo lidera alguien que no tiene el cargo, y el CAF nunca se creó.
    const other = await seedMember("otra.persona@eafit.edu.co");
    await getDb()
      .update(workGroup)
      .set({ leaderPersonId: other })
      .where(and(eq(workGroup.termId, termId), eq(workGroup.code, "CAE")));
    await getDb()
      .delete(workGroup)
      .where(and(eq(workGroup.termId, termId), eq(workGroup.code, "CAF")));

    const composition = await boardComposition(termId);
    expect(seatOf(composition, "PRESIDENT").committees[0]?.state).toBe("OK");
    expect(seatOf(composition, "VP_ADMIN").holders).toEqual([]);
    expect(seatOf(composition, "VP_ADMIN").committees[0]?.state).toBe("NO_LEADER");
    expect(seatOf(composition, "VP_FINANCE").holders).toEqual([]);
    expect(seatOf(composition, "VP_FINANCE").committees[0]).toMatchObject({
      state: "MISSING",
      groupId: null,
    });
    expect(seatOf(composition, "VP_PUBLIC_RELATIONS").committees[0]).toMatchObject({
      state: "OTHER_LEADER",
      leader: { personId: other },
    });
    expect(seatOf(composition, "VP_COMMUNICATIONS").committees[0]?.state).toBe("NO_LEADER");
    expect(seatOf(composition, "VP_GH").holders).toEqual([
      expect.objectContaining({ personId: gh, operational: false }),
    ]);
    expect(seatOf(composition, "VP_GH").committees[0]?.state).toBe("OK");
    // Dos vacantes, una titular en licencia y cuatro comités: CML, CAF, CAE y CCM.
    expect(composition.issues).toBe(7);
  });
});
