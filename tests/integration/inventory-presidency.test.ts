import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db/client";
import { createItemAs, getInventoryContext } from "@/modules/inventory";
import {
  currentInventoryManagerRole,
  listLogisticsSources,
  setLogisticsDirectorAs,
} from "@/modules/people";
import { DomainError } from "@/shared/lib/errors";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
  seedVeteran,
} from "../factories";
import { truncateAll } from "./db";

// La Presidencia suple a la VP en el inventario (ADR-193, Reglamento art. 54): solo cuando el
// término no tiene una VP Administrativa con membresía operativa, y deja de hacerlo apenas la hay.

const actor = (personId: string) => ({ personId, ip: null, isAdmin: false });
const material = {
  name: "Carpas sintéticas",
  mode: "QUANTITY" as const,
  total: 2,
  location: "Bodega sintética",
  box: "Caja P",
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T17:00:00Z"));
  await truncateAll();
});
afterEach(() => vi.useRealTimers());
afterAll(closeDb);

async function presidencia() {
  const termId = await seedTerm("2026-2");
  const president = await seedMember("presidencia.sintetica@eafit.edu.co");
  await seedAppointment(president, termId, "PRESIDENT");
  return { termId, president };
}

describe("la Presidencia suple a la VP en el inventario", () => {
  it("sin VP en el término, la Presidencia administra y registra direcciones logísticas", async () => {
    const { termId, president } = await presidencia();
    expect(await currentInventoryManagerRole(president)).toBe("PRESIDENCY");
    expect(await getInventoryContext(president)).toMatchObject({
      canManage: true,
      managerRole: "PRESIDENCY",
      canOperate: true,
    });
    await expect(createItemAs(actor(president), material)).resolves.toBeDefined();

    const committeeId = await seedCommittee("suplencia-sintetica");
    const candidate = await seedVeteran("logistica.suplencia.sintetica@eafit.edu.co");
    await seedCommitteeMembership(candidate, committeeId, termId);
    await setLogisticsDirectorAs(
      actor(president),
      { kind: "COMMITTEE", committeeId, termId },
      { personId: candidate, assigned: true, coDirector: false },
    );
    expect(await listLogisticsSources(candidate)).toHaveLength(1);
  });

  it("con una VP activa en el término, la Presidencia no administra", async () => {
    const { termId, president } = await presidencia();
    const vp = await seedMember("vp.suplencia.sintetica@eafit.edu.co");
    await seedAppointment(vp, termId, "VP_ADMIN");
    expect(await currentInventoryManagerRole(vp)).toBe("VP");
    expect(await currentInventoryManagerRole(president)).toBeNull();
    expect(await getInventoryContext(president)).toMatchObject({
      canManage: false,
      managerRole: null,
    });
    await expect(createItemAs(actor(president), material)).rejects.toBeInstanceOf(DomainError);
  });

  it("con la VP en licencia, suple la Presidencia y la VP no administra", async () => {
    const { termId, president } = await presidencia();
    const vp = await seedPerson("vp.licencia.sintetica@eafit.edu.co");
    await seedMembership(vp, termId, "ON_LEAVE");
    await seedAppointment(vp, termId, "VP_ADMIN");
    expect(await currentInventoryManagerRole(vp)).toBeNull();
    expect(await currentInventoryManagerRole(president)).toBe("PRESIDENCY");
  });

  it("otro cargo de la Junta no suple a la VP", async () => {
    const { termId } = await presidencia();
    const finance = await seedMember("finanzas.suplencia.sintetica@eafit.edu.co");
    await seedAppointment(finance, termId, "VP_FINANCE");
    expect(await currentInventoryManagerRole(finance)).toBeNull();
    expect((await getInventoryContext(finance)).canManage).toBe(false);
  });
});
