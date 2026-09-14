import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import type { Actor } from "@/modules/identity/domain/actor";
import { issueCarnet, readCarnet } from "@/modules/identity/domain/carnet";
import {
  deleteCarnetTokenFor,
  getCarnetCredential,
  getCarnetMetadata,
  getOrCreateCarnetCredential,
  getOrCreateCarnetToken,
  resolveCarnetToken,
  rotateCarnetTokenAs,
} from "@/modules/identity/domain/carnet-token";
import { ForbiddenError } from "@/modules/identity/domain/errors";
import "@/modules/identity/jobs";
import { carnetToken } from "@/modules/identity/schema";
import {
  anonymizePerson,
  changeMembershipStatus,
  endMembership,
  reactivateMembership,
} from "@/modules/people/domain/membership";
import { getWalletMemberState } from "@/modules/people/domain/wallet-member";
import { person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";
import { leaveUntilSoon, seedMember, seedPerson } from "./factories";

function actorFor(personId: string, isAdmin = false): Actor {
  return {
    personId,
    sessionId: "sesion-sintetica",
    email: "sintetica@eafit.edu.co",
    name: "Persona",
    firstName: "Persona",
    membershipStatus: "ACTIVE",
    permissions: isAdmin ? [{ code: "ADMIN", committeeId: null }] : [],
    otpVerifiedAt: new Date(0),
    sessionLastSeenAt: new Date(),
    sessionRemembered: false,
    isAdmin,
  };
}

function barrier() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function waitForMemberLock(personId: string): Promise<void> {
  await vi.waitFor(
    async () => {
      const result = await getDb().execute<{ blocked: boolean }>(sql`
        select exists (
          select 1 from pg_locks
          where locktype = 'advisory' and not granted
            and database = (select oid from pg_database where datname = current_database())
            and objid = (hashtext(${`wallet-member:${personId}`})::bigint & 4294967295)::oid
        ) as blocked
      `);
      expect(result.rows[0]?.blocked).toBe(true);
    },
    { timeout: 5000, interval: 10 },
  );
}

const endInput = { endReason: "OTHER" as const, memorialConsent: false, contactConsent: false };

describe("credenciales del carnet de billetera", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea una sola credencial ante solicitudes simultáneas y solo devuelve datos persistidos", async () => {
    const personId = await seedMember("simultanea@eafit.edu.co");
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () => getOrCreateCarnetToken(personId)),
    );
    expect(new Set(tokens).size).toBe(1);
    const [rows] = await getDb().select({ n: count() }).from(carnetToken);
    expect(rows?.n).toBe(1);
    expect(await getCarnetCredential(personId)).toMatchObject({
      token: tokens[0],
      walletEpoch: 0,
      revision: 1,
    });
    const metadata = await getCarnetMetadata(personId);
    expect(metadata).toMatchObject({ personId, walletEpoch: 0, revision: 1, lastUsedAt: null });
    expect(metadata).not.toHaveProperty("token");
    expect(await getCarnetMetadata("no-existe")).toBeNull();
  });

  it("resuelve oe2 sin vencimiento, registra el uso y distingue formato inválido de revocación", async () => {
    const personId = await seedMember("resolver@eafit.edu.co");
    const token = await getOrCreateCarnetToken(personId);
    const now = new Date("2026-09-06T18:00:00Z");
    expect(await readCarnet(token, now)).toEqual({
      ok: true,
      personId,
      expiresAt: null,
      source: "WALLET",
    });
    expect((await getCarnetMetadata(personId))?.lastUsedAt).toEqual(now);
    expect(await resolveCarnetToken("basura")).toBeNull();
    for (const value of ["oe2", "oe2.corto", `oe2.${"a".repeat(65)}`, "basura"]) {
      expect(await readCarnet(value)).toEqual({ ok: false, reason: "MALFORMED" });
    }
    expect(await readCarnet(`oe2.${"a".repeat(32)}`)).toEqual({ ok: false, reason: "REVOKED" });
  });

  it("rota con revisiones únicas y conserva cada evento; los oe1 siguen válidos", async () => {
    const personId = await seedMember("rotacion@eafit.edu.co");
    const original = await getOrCreateCarnetToken(personId);
    const app = await issueCarnet(personId);
    await resolveCarnetToken(original);
    const rotated = await Promise.all([
      rotateCarnetTokenAs(actorFor(personId)),
      rotateCarnetTokenAs(actorFor(personId)),
    ]);
    expect(new Set([original, ...rotated]).size).toBe(3);
    expect(await readCarnet(original)).toEqual({ ok: false, reason: "REVOKED" });
    const current = await getCarnetCredential(personId);
    expect(current).toMatchObject({ revision: 3, lastUsedAt: null });
    for (const token of rotated) {
      expect((await readCarnet(token)).ok).toBe(token === current?.token);
    }
    expect(await readCarnet(app.token)).toMatchObject({ ok: true, source: "APP", personId });
    const events = await getDb()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, "carnet-token.rotated"));
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.dedupeKey)).toEqual([null, null]);
    expect(events.map((event) => event.payload.revision).sort()).toEqual([2, 3]);
    const audits = await getDb()
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "carnet-token.rotated"));
    expect(audits).toHaveLength(2);
    expect(JSON.stringify({ audits, events })).not.toContain("oe2.");
  });

  it("solo ADMIN puede rotar el carnet de otra persona, sin pedir step-up", async () => {
    const self = await seedMember("propia@eafit.edu.co");
    const other = await seedMember("otra@eafit.edu.co");
    const old = await getOrCreateCarnetToken(other);
    await expect(rotateCarnetTokenAs(actorFor(self), other)).rejects.toBeInstanceOf(ForbiddenError);
    const leader = actorFor(self);
    leader.permissions = [{ code: "COMMITTEE_LEADER", committeeId: "comite-sintetico" }];
    await expect(rotateCarnetTokenAs(leader, other)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await resolveCarnetToken(old)).toBe(other);
    const rotated = await rotateCarnetTokenAs(actorFor(self, true), other);
    expect(await resolveCarnetToken(old)).toBeNull();
    expect(await resolveCarnetToken(rotated)).toBe(other);
  });

  it("no emite para aspirantes ni licencias; el token previo de una licencia se conserva", async () => {
    const prospect = await seedPerson("aspirante@eafit.edu.co", { stage: "APPLICANT" });
    await expect(getOrCreateCarnetToken(prospect)).rejects.toBeInstanceOf(ForbiddenError);
    const personId = await seedMember("licencia@eafit.edu.co");
    const token = await getOrCreateCarnetToken(personId);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      changeMembershipStatus(ctx, personId, {
        to: "ON_LEAVE",
        reason: "Semestre afuera",
        leaveUntil: leaveUntilSoon(),
      }),
    );
    await expect(getOrCreateCarnetToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rotateCarnetTokenAs(actorFor(personId))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await resolveCarnetToken(token)).toBe(personId);
    expect((await getWalletMemberState(getDb(), personId))?.walletEpoch).toBe(0);
    await drain(20);
    expect((await getCarnetCredential(personId))?.token).toBe(token);
  });

  it("la baja corta el token antes del outbox y una baja atrasada no borra la reemisión", async () => {
    const personId = await seedMember("reactivada@eafit.edu.co");
    const original = await getOrCreateCarnetToken(personId);
    await runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    expect((await getWalletMemberState(getDb(), personId))?.walletEpoch).toBe(1);
    expect(await readCarnet(original)).toEqual({ ok: false, reason: "REVOKED" });
    expect(await getCarnetCredential(personId)).not.toBeNull();
    expect(await getCarnetMetadata(personId)).toBeNull();
    await expect(getOrCreateCarnetToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
    await runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    expect((await getWalletMemberState(getDb(), personId))?.walletEpoch).toBe(1);
    await runCommand(SYSTEM_ACTOR, (ctx) => reactivateMembership(ctx, personId, {}));
    expect(await resolveCarnetToken(original)).toBeNull();
    expect(await getCarnetMetadata(personId)).toBeNull();
    await expect(rotateCarnetTokenAs(actorFor(personId))).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getCarnetCredential(personId))?.token).toBe(original);
    const current = await getOrCreateCarnetToken(personId);
    expect(current).not.toBe(original);
    expect(await getCarnetMetadata(personId)).toMatchObject({ walletEpoch: 1, revision: 1 });
    expect((await drain(30)).failed).toBe(0);
    expect(await deleteCarnetTokenFor(personId)).toBe(0);
    expect(await resolveCarnetToken(current)).toBe(personId);
  });

  it("revocar sin una emisión previa no crea el primer token ni un evento", async () => {
    const personId = await seedMember("wallet-no-emitido@eafit.edu.co");
    await expect(rotateCarnetTokenAs(actorFor(personId))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await getCarnetCredential(personId)).toBeNull();
    expect(await getCarnetMetadata(personId)).toBeNull();
    expect(await getDb().select().from(outbox)).toEqual([]);
  });

  it("la anonimización avanza el epoch aunque ya estuviera de baja y no permite reactivar", async () => {
    const personId = await seedMember("anonima@eafit.edu.co");
    const original = await getOrCreateCarnetToken(personId);
    await runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    await getDb()
      .update(person)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(person.id, personId));
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));
    expect((await getWalletMemberState(getDb(), personId))?.walletEpoch).toBe(2);
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));
    expect((await getWalletMemberState(getDb(), personId))?.walletEpoch).toBe(2);
    expect(await resolveCarnetToken(original)).toBeNull();
    await expect(getOrCreateCarnetToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => reactivateMembership(ctx, personId, {})),
    ).rejects.toThrow();
    expect((await drain(30)).failed).toBe(0);
    expect(await getCarnetCredential(personId)).toBeNull();
  });

  it("una emisión que espera el commit de la baja no puede crear una credencial nueva", async () => {
    const personId = await seedMember("carrera-baja@eafit.edu.co");
    const entered = barrier();
    const finish = barrier();
    const ending = runCommand(SYSTEM_ACTOR, async (ctx) => {
      await endMembership(ctx, personId, endInput);
      entered.release();
      await finish.promise;
    });
    await entered.promise;
    const creation = expect(getOrCreateCarnetToken(personId)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    try {
      await waitForMemberLock(personId);
    } finally {
      finish.release();
    }
    await ending;
    await creation;
    expect(await getCarnetCredential(personId)).toBeNull();
  });

  it("la reserva y la baja comparten el lock: una credencial en vuelo queda inválida al salir", async () => {
    const personId = await seedMember("carrera-reserva@eafit.edu.co");
    const entered = barrier();
    const finish = barrier();
    const preparation = runCommand(SYSTEM_ACTOR, async (ctx) => {
      const credential = await getOrCreateCarnetCredential(ctx.tx, personId);
      entered.release();
      await finish.promise;
      return credential;
    });
    await entered.promise;
    const ending = runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    try {
      await waitForMemberLock(personId);
    } finally {
      finish.release();
    }
    const credential = await preparation;
    await ending;
    expect(await resolveCarnetToken(credential.token)).toBeNull();
    expect(await deleteCarnetTokenFor(personId)).toBe(1);
  });
});
