import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { endMembershipAs, setCommitteeMembershipsAs } from "@/modules/people";
import { setCommitteeMemberships } from "@/modules/people/domain/committee-memberships";
import { endMembership } from "@/modules/people/domain/membership";
import { committeeMembership, committeeRoleAssignment, membership } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { holdCommand, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "./factories";

// Solo quien tiene una membresía vigente cambia de comités (ADR-118 regla 11; DT-209 b): una baja
// cierra pertenencias y cargos, y un editor de comités que quedó abierto no los vuelve a abrir.

const LEAVING = {
  endReason: "RESIGNATION",
  memorialConsent: false,
  contactConsent: false,
} as const;

async function liveCommittees(personId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ committeeId: committeeMembership.committeeId })
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  return rows.map((row) => row.committeeId).sort();
}

async function liveRoles(personId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ roleCode: committeeRoleAssignment.roleCode })
    .from(committeeRoleAssignment)
    .where(
      and(eq(committeeRoleAssignment.personId, personId), isNull(committeeRoleAssignment.endedAt)),
    );
  return rows.map((row) => row.roleCode);
}

async function scene() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
  const personId = await seedVeteran("general@eafit.edu.co");
  await seedCommitteeMembership(personId, a3, termId, "GENERAL");
  return { termId, a3, pixel, gh, personId };
}

describe("cambiar los comités exige una membresía vigente", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("a quien está de baja no se le abren pertenencias ni cargos", async () => {
    const { termId, a3, gh, personId } = await scene();
    await endMembershipAs(gh, personId, LEAVING);

    await expect(
      setCommitteeMembershipsAs(gh, personId, termId, [{ committeeId: a3, roleCode: "GENERAL" }]),
    ).rejects.toThrow(new DomainError(t("T-3246"), "committeeId"));

    expect(await liveCommittees(personId)).toEqual([]);
    expect(await liveRoles(personId)).toEqual([]);
  });

  it("a quien no tiene membresía tampoco", async () => {
    const { termId, a3, gh } = await scene();
    const prospecto = await seedPerson("prospecto@example.com");

    await expect(
      setCommitteeMembershipsAs(gh, prospecto, termId, [{ committeeId: a3 }]),
    ).rejects.toThrow(new DomainError(t("T-3246"), "committeeId"));

    expect(await liveCommittees(prospecto)).toEqual([]);
  });

  it("un semestre que no existe responde un error de dominio, no el de la base", async () => {
    const { a3, gh, personId } = await scene();

    await expect(
      setCommitteeMembershipsAs(gh, personId, "semestre-que-no-existe", [{ committeeId: a3 }]),
    ).rejects.toThrow(new DomainError(t("T-032"), "termId"));
  });

  it("si la baja entra primero, el cambio de comités que hacía cola responde el error", async () => {
    const { termId, a3, gh, personId } = await scene();
    const held = await holdCommand(gh, (ctx) => endMembership(ctx, personId, LEAVING));
    const saving = setCommitteeMembershipsAs(gh, personId, termId, [
      { committeeId: a3, roleCode: "GENERAL" },
    ]).then(
      () => "guardado",
      (error: unknown) => error,
    );
    try {
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      held.release();
      await held.done;
    }

    expect(await saving).toEqual(new DomainError(t("T-3246"), "committeeId"));
    expect(await liveCommittees(personId)).toEqual([]);
    expect(await liveRoles(personId)).toEqual([]);
  });

  it("si el cambio de comités entra primero, la baja que hacía cola cierra también lo recién abierto", async () => {
    const { termId, a3, pixel, gh, personId } = await scene();
    const held = await holdCommand(gh, (ctx) =>
      setCommitteeMemberships(ctx, personId, termId, [
        { committeeId: a3, roleCode: "GENERAL" },
        { committeeId: pixel },
      ]),
    );
    const leaving = endMembershipAs(gh, personId, LEAVING);
    try {
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBeGreaterThan(0), {
        timeout: 5_000,
      });
    } finally {
      held.release();
      await held.done;
    }
    await leaving;

    const [fila] = await getDb()
      .select({ status: membership.status })
      .from(membership)
      .where(eq(membership.personId, personId));
    expect(fila?.status).toBe("INACTIVE");
    expect(await liveCommittees(personId)).toEqual([]);
    expect(await liveRoles(personId)).toEqual([]);
  });
});
