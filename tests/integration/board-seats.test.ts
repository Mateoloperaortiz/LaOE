import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { currentSeatAuthority, seatDeciders, seatsDecidedBy } from "@/modules/people";
import { seedAppointment, seedMember, seedMembership, seedPerson, seedTerm } from "../factories";
import { truncateAll } from "./db";

// Quién decide por un cargo de la junta (ADR-195 regla 2, que generaliza la ADR-193): la titular con
// membresía activa; si una VP falta, la Presidencia; si falta la Presidencia, nadie.

beforeEach(truncateAll);
afterAll(closeDb);

describe("quién decide por un cargo de la junta", () => {
  it("la titular decide su cargo y la Presidencia suple a las VP vacantes, nunca al revés", async () => {
    const termId = await seedTerm();
    const president = await seedMember("presidencia.cargos@eafit.edu.co");
    await seedAppointment(president, termId, "PRESIDENT");
    const gh = await seedMember("gestion.cargos@eafit.edu.co");
    await seedAppointment(gh, termId, "VP_GH");

    expect(await currentSeatAuthority(gh, "VP_GH")).toBe("HOLDER");
    expect(await currentSeatAuthority(president, "PRESIDENT")).toBe("HOLDER");
    expect(await currentSeatAuthority(president, "VP_GH")).toBeNull();
    expect(await currentSeatAuthority(president, "VP_FINANCE")).toBe("PRESIDENCY");
    expect(await currentSeatAuthority(gh, "PRESIDENT")).toBeNull();
    expect(await currentSeatAuthority(gh, "VP_FINANCE")).toBeNull();

    expect(await seatDeciders("VP_GH", termId)).toEqual([gh]);
    expect(await seatDeciders("VP_FINANCE", termId)).toEqual([president]);
    expect(await seatsDecidedBy(president, termId)).toEqual([
      { seat: "PRESIDENT", as: "HOLDER" },
      { seat: "VP_ADMIN", as: "PRESIDENCY" },
      { seat: "VP_FINANCE", as: "PRESIDENCY" },
      { seat: "VP_PUBLIC_RELATIONS", as: "PRESIDENCY" },
      { seat: "VP_COMMUNICATIONS", as: "PRESIDENCY" },
    ]);
    expect(await seatsDecidedBy(gh, termId)).toEqual([{ seat: "VP_GH", as: "HOLDER" }]);
  });

  it("una VP en licencia no decide y la suple la Presidencia; sin Presidencia, nadie decide", async () => {
    const termId = await seedTerm();
    const admin = await seedPerson("administrativa.licencia@eafit.edu.co");
    await seedMembership(admin, termId, "ON_LEAVE");
    await seedAppointment(admin, termId, "VP_ADMIN");

    expect(await currentSeatAuthority(admin, "VP_ADMIN")).toBeNull();
    expect(await seatDeciders("VP_ADMIN", termId)).toEqual([]);
    expect(await seatDeciders("PRESIDENT", termId)).toEqual([]);

    const president = await seedMember("presidencia.suple@eafit.edu.co");
    await seedAppointment(president, termId, "PRESIDENT");
    expect(await currentSeatAuthority(president, "VP_ADMIN")).toBe("PRESIDENCY");
    expect(await seatDeciders("VP_ADMIN", termId)).toEqual([president]);
  });
});
