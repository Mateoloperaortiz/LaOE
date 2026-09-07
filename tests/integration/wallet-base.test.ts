import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { type Env, getEnv } from "@/env";
import {
  getCarnetCredential,
  getOrCreateCarnetCredential,
  getOrCreateCarnetToken,
  rotateCarnetTokenAs,
} from "@/modules/identity";
import { membership, person } from "@/modules/people/schema";
import { loadCarnetData } from "@/modules/wallet/domain/carnet-data";
import {
  listPassesFor,
  recordPassIssued,
  walletAvailability,
} from "@/modules/wallet/domain/passes";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedTerm,
} from "./factories";
import { walletActor } from "./wallet-fixtures";

describe("datos y registro de pases", () => {
  let original: Env;
  beforeEach(async () => {
    original = { ...getEnv() };
    await truncateAll();
  });
  afterEach(() => Object.assign(getEnv(), original));
  afterAll(closeDb);

  it("una lectura no crea tokens; compone nombre, cargos, término actual y primer término", async () => {
    const personId = await seedMember("datos-wallet@eafit.edu.co", {
      firstName: "Alma",
      lastName: "Sintética",
    });
    await expect(loadCarnetData(personId)).rejects.toThrow();
    expect(await getCarnetCredential(personId)).toBeNull();
    expect(await listPassesFor(personId)).toEqual([]);
    const firstTermId = await seedTerm("2025-1");
    const currentTermId = await seedTerm(currentTermCode());
    await getDb().update(membership).set({ firstTermId }).where(eq(membership.personId, personId));
    const committee = await seedCommittee("wallet-comite", "Comité sintético");
    await seedCommitteeMembership(personId, committee, currentTermId, "GENERAL");
    const token = await getOrCreateCarnetToken(personId);
    expect(await loadCarnetData(personId)).toMatchObject({
      personId,
      fullName: "Alma Sintética",
      committees: [{ name: "Comité sintético", role: "General" }],
      term: { id: currentTermId, code: currentTermCode() },
      firstTermCode: "2025-1",
      token,
      walletEpoch: 0,
      revision: 1,
    });
  });

  it("lee los cambios sin commit de su Executor y admite ausencia de término actual", async () => {
    const personId = await seedMember("transaccion-wallet@eafit.edu.co");
    const data = await getDb().transaction(async (tx) => {
      await tx.update(person).set({ firstName: "Dentro" }).where(eq(person.id, personId));
      await getOrCreateCarnetCredential(tx, personId);
      return loadCarnetData(personId, tx, new Date("2040-09-01T15:00:00Z"));
    });
    expect(data).toMatchObject({ fullName: "Dentro Sintética", committees: [], term: null });
    expect(data.firstTermCode).toBe(currentTermCode());
  });

  it("una reemisión preserva la primera fecha y registra la revisión exacta por plataforma", async () => {
    const personId = await seedMember("registro-wallet@eafit.edu.co");
    await getOrCreateCarnetToken(personId);
    const originalData = await loadCarnetData(personId);
    const first = new Date("2026-09-01T15:00:00Z");
    const later = new Date("2026-09-02T15:00:00Z");
    await recordPassIssued(getDb(), "APPLE", personId, originalData, first);
    await rotateCarnetTokenAs(walletActor(personId));
    const latestData = await loadCarnetData(personId);
    await recordPassIssued(getDb(), "APPLE", personId, latestData, later);
    const [pass] = await listPassesFor(personId);
    expect(pass).toMatchObject({
      personId,
      platform: "APPLE",
      issuedAt: first,
      lastIssuedAt: later,
      walletEpoch: latestData.walletEpoch,
      tokenRevision: latestData.revision,
      renderedTermId: latestData.term?.id,
      revokedAt: null,
    });
    expect(pass).not.toHaveProperty("token");
    expect(await listPassesFor(await seedMember("sin-pases@eafit.edu.co"))).toEqual([]);
  });

  it("la disponibilidad depende solo de credenciales completas de cada plataforma", () => {
    expect(walletAvailability()).toEqual({ apple: true, google: true });
    delete getEnv().APPLE_PASS_TYPE_ID;
    expect(walletAvailability()).toEqual({ apple: false, google: true });
    delete getEnv().GOOGLE_WALLET_ISSUER_ID;
    expect(walletAvailability()).toEqual({ apple: false, google: false });
  });
});
