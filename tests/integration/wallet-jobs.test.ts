import { Cron } from "croner";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { type Env, getEnv } from "@/env";
import { processOne } from "@/jobs/poller";
import { SCHEDULE } from "@/jobs/schedule";
import { getCarnetCredential, readCarnet } from "@/modules/identity";
import { drainOutbox } from "../helpers/outbox";
import "@/modules/identity/jobs";
import { setCommitteeMembershipsAs, updatePersonAs } from "@/modules/people";
import {
  anonymizePerson,
  endMembership,
  reactivateMembership,
} from "@/modules/people/domain/membership";
import { person } from "@/modules/people/schema";
import { outbox } from "@/modules/system/schema";
import { loadCarnetData } from "@/modules/wallet/domain/carnet-data";
import {
  issueGoogleSaveUrl,
  setGoogleWalletTransportForTests,
} from "@/modules/wallet/domain/google";
import { listPassesFor, recordPassIssued } from "@/modules/wallet/domain/passes";
import "@/modules/wallet/jobs";
import { eventOf } from "@/domain-events/define";
import {
  committeeMembershipChanged,
  membershipChanged,
  personUpdated,
} from "@/domain-events/people";
import { walletReconcile, walletSync } from "@/domain-events/wallet";
import { t } from "@/shared/copy";
import {
  currentTermCode,
  seedCarnetTokens,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMemberships,
  seedPeople,
  seedTerm,
  seedWalletPasses,
} from "../factories";
import { truncateAll } from "./db";
import { FakeGoogleWallet } from "./wallet-fixtures";

const endInput = { endReason: "OTHER" as const, memorialConsent: false, contactConsent: false };

describe("wallet por outbox y reconciliación diaria", () => {
  let server: FakeGoogleWallet;
  let original: Env;
  beforeEach(async () => {
    original = { ...getEnv() };
    server = new FakeGoogleWallet();
    setGoogleWalletTransportForTests(server.transport);
    await truncateAll();
  });
  afterEach(() => {
    setGoogleWalletTransportForTests();
    Object.assign(getEnv(), original);
    vi.useRealTimers();
  });
  afterAll(closeDb);

  it("programa la reconciliación a las 00:05 de Bogotá, equivalentes a las 05:05 UTC", () => {
    const entry = SCHEDULE.find((item) => item.events.includes("wallet.reconcile"));
    expect(entry).toBeDefined();
    const schedule = new Cron(entry?.cron ?? "", { timezone: getEnv().APP_TIMEZONE, paused: true });
    try {
      expect(schedule.nextRun(new Date("2026-09-07T04:59:00Z"))).toEqual(
        new Date("2026-09-07T05:05:00Z"),
      );
      expect(schedule.nextRun(new Date("2026-09-07T05:05:01Z"))).toEqual(
        new Date("2026-09-08T05:05:00Z"),
      );
    } finally {
      schedule.stop();
    }
  });

  it("el evento de comités encola un trabajo corto y solo wallet.sync toca Google", async () => {
    const personId = await seedMember("wallet-comites@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    const termId = await seedTerm(currentTermCode());
    const committeeId = await seedCommittee("nuevo-wallet", "Comité nuevo");
    server.calls.length = 0;
    await setCommitteeMembershipsAs({ personId, ip: null }, personId, termId, [
      { committeeId, roleCode: "MIEMBRO", transferredIn: false },
    ]);
    expect(server.calls).toEqual([]);
    expect(await processOne(() => new Date(Date.now() + 1000))).toBe("processed");
    expect(server.calls).toEqual([]);
    const queued = await getDb().select().from(outbox).where(eq(outbox.eventType, "wallet.sync"));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.dedupeKey).toMatch(/^wallet-sync:/);
    await drainOutbox();
    const [pass] = await listPassesFor(personId);
    expect(server.objects.get(pass?.externalId ?? "")).toMatchObject({
      textModulesData: expect.arrayContaining([
        expect.objectContaining({
          id: "committees",
          body: expect.stringContaining("Comité nuevo"),
        }),
      ]),
    });
  });

  it("teléfono y personas sin pase no causan envíos ni crean credenciales", async () => {
    const issuedId = await seedMember("wallet-telefono@eafit.edu.co");
    const emptyId = await seedMember("wallet-sin-pase@eafit.edu.co");
    await issueGoogleSaveUrl(issuedId);
    server.calls.length = 0;
    await enqueueEvent(
      getDb(),
      eventOf(personUpdated, { actorId: null, personId: issuedId, fields: ["phone"] }),
    );
    await enqueueEvent(
      getDb(),
      eventOf(committeeMembershipChanged, {
        actorId: null,
        personId: emptyId,
        termId: "termino-sintetico",
        committees: [],
      }),
    );
    await enqueueEvent(
      getDb(),
      eventOf(membershipChanged, {
        actorId: null,
        personId: emptyId,
        from: null,
        to: "ACTIVE",
        reason: null,
      }),
    );
    await drainOutbox();
    expect(server.calls).toEqual([]);
    expect(await getCarnetCredential(emptyId)).toBeNull();
    expect(await listPassesFor(emptyId)).toEqual([]);
  });

  it("el cambio de nombre encola sin REST y wallet.sync reconstruye el encabezado", async () => {
    const personId = await seedMember("wallet-nombre@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    server.calls.length = 0;
    await updatePersonAs({ personId, ip: null }, personId, {
      firstName: "Nombre",
      lastName: "Actualizado",
      email: "wallet-nombre@eafit.edu.co",
      kind: "STUDENT",
    });
    expect(server.calls).toEqual([]);
    expect(await processOne(() => new Date(Date.now() + 1000))).toBe("processed");
    expect(server.calls).toEqual([]);
    await drainOutbox();
    const [pass] = await listPassesFor(personId);
    expect(server.objects.get(pass?.externalId ?? "")).toMatchObject({
      header: { defaultValue: { value: "Nombre Actualizado" } },
    });
  });

  it("una baja vieja no expira ni borra la reemisión explícita posterior a reactivar", async () => {
    const personId = await seedMember("wallet-evento-atrasado@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    const old = await getCarnetCredential(personId);
    await runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    expect(await readCarnet(old?.token ?? "")).toEqual({ ok: false, reason: "REVOKED" });
    await runCommand(SYSTEM_ACTOR, (ctx) => reactivateMembership(ctx, personId, {}));
    await issueGoogleSaveUrl(personId);
    const fresh = await getCarnetCredential(personId);
    expect(fresh?.walletEpoch).toBe(1);
    server.calls.length = 0;
    await drainOutbox();
    const [pass] = await listPassesFor(personId);
    expect(pass).toMatchObject({ walletEpoch: 1, revokedAt: null });
    expect(server.objects.get(pass?.externalId ?? "")).toMatchObject({
      state: "ACTIVE",
      barcode: { value: fresh?.token },
    });
    expect(server.writes().every((call) => call.body.state === "ACTIVE")).toBe(true);
    expect(await getCarnetCredential(personId)).toEqual(fresh);
  });

  it("dar de baja expira el objeto y reactivar sin agregar otra vez no restaura pase ni token", async () => {
    const personId = await seedMember("wallet-baja@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    await runCommand(SYSTEM_ACTOR, (ctx) => endMembership(ctx, personId, endInput));
    await drainOutbox();
    const [pass] = await listPassesFor(personId);
    expect(pass?.revokedAt).toBeInstanceOf(Date);
    expect(server.objects.get(pass?.externalId ?? "")?.state).toBe("EXPIRED");
    expect(await getCarnetCredential(personId)).toBeNull();
    server.calls.length = 0;
    await runCommand(SYSTEM_ACTOR, (ctx) => reactivateMembership(ctx, personId, {}));
    await drainOutbox();
    expect(server.calls).toEqual([]);
    expect(await getCarnetCredential(personId)).toBeNull();
    expect((await listPassesFor(personId))[0]?.revokedAt).toEqual(pass?.revokedAt);
  });

  it("anonimizar conserva el identificador cuando falla el scrub y el reintento borra los datos remotos", async () => {
    const personId = await seedMember("wallet-anonimizar@eafit.edu.co", {
      firstName: "Nombre",
      lastName: "Sintético",
    });
    await issueGoogleSaveUrl(personId);
    await recordPassIssued(getDb(), "APPLE", personId, await loadCarnetData(personId));
    const google = (await listPassesFor(personId)).find((pass) => pass.platform === "GOOGLE");
    let fail = true;
    server.intercept = async (call) =>
      call.method === "PUT" && call.body.state === "EXPIRED" && fail
        ? Response.json({}, { status: 503 })
        : undefined;
    await getDb()
      .update(person)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(person.id, personId));
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));
    expect((await drainOutbox({ expectFailures: [walletSync] })).failed).toBe(1);
    expect(await getCarnetCredential(personId)).toBeNull();
    expect(await listPassesFor(personId)).toEqual([
      expect.objectContaining({ id: google?.id, externalId: google?.externalId }),
    ]);
    expect(server.objects.get(google?.externalId ?? "")).toHaveProperty("barcode");
    fail = false;
    // El reintento espera un minuto de backoff: el reloj adelantado lo alcanza.
    await drainOutbox({ now: new Date(Date.now() + 2 * 60_000) });
    expect(await listPassesFor(personId)).toEqual([]);
    const tombstone = server.objects.get(google?.externalId ?? "");
    expect(tombstone).toMatchObject({
      state: "EXPIRED",
      header: { defaultValue: { value: t("T-223") } },
    });
    for (const field of ["barcode", "textModulesData", "subheader", "linksModuleData"])
      expect(tombstone).not.toHaveProperty(field);
    const count = server.calls.length;
    await enqueueEvent(getDb(), eventOf(walletSync, { personId }));
    await drainOutbox();
    expect(server.calls).toHaveLength(count);
  });

  it("la diaria recupera una limpieza pendiente al restaurar la configuración", async () => {
    const personId = await seedMember("wallet-config-restaurada@eafit.edu.co");
    await issueGoogleSaveUrl(personId);
    delete getEnv().GOOGLE_WALLET_ISSUER_ID;
    await getDb()
      .update(person)
      .set({ deletionRequestedAt: new Date() })
      .where(eq(person.id, personId));
    await runCommand(SYSTEM_ACTOR, (ctx) => anonymizePerson(ctx, personId));
    expect((await drainOutbox({ expectFailures: [walletSync] })).failed).toBe(1);
    expect(await listPassesFor(personId)).toHaveLength(1);
    Object.assign(getEnv(), original);
    await enqueueEvent(getDb(), eventOf(walletReconcile, {}));
    // La diaria encola su propio wallet.sync, que no falla; el que falló sigue esperando su reintento.
    expect((await drainOutbox({ expectFailures: [walletSync] })).failed).toBe(0);
    expect(await listPassesFor(personId)).toEqual([]);
  });

  it("actualiza un roster futuro al iniciar el semestre y la siguiente diaria conserva objeto y QR", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-30T15:00:00Z"));
    const personId = await seedMember("wallet-semestre@eafit.edu.co");
    const firstTerm = await seedTerm("2026-1");
    const nextTerm = await seedTerm("2026-2");
    const oldCommittee = await seedCommittee("wallet-anterior", "Comité anterior");
    const futureCommittee = await seedCommittee("wallet-futuro", "Comité futuro");
    await seedCommitteeMembership(personId, oldCommittee, firstTerm);
    await issueGoogleSaveUrl(personId);
    await setCommitteeMembershipsAs({ personId, ip: null }, personId, nextTerm, [
      { committeeId: futureCommittee, roleCode: "MIEMBRO", transferredIn: false },
    ]);
    await drainOutbox();
    expect((await listPassesFor(personId))[0]?.renderedTermId).toBe(firstTerm);
    vi.setSystemTime(new Date("2026-07-01T05:05:00Z"));
    await enqueueEvent(getDb(), eventOf(walletReconcile, {}));
    await drainOutbox();
    const [pass] = await listPassesFor(personId);
    expect(pass?.renderedTermId).toBe(nextTerm);
    const remote = server.objects.get(pass?.externalId ?? "");
    expect(remote).toMatchObject({ subheader: { defaultValue: { value: "2026-2" } } });
    expect(JSON.stringify(remote)).toContain("Comité futuro");
    expect(JSON.stringify(remote)).not.toContain("Comité anterior");
    const credential = await getCarnetCredential(personId);
    server.calls.length = 0;
    await enqueueEvent(getDb(), eventOf(walletReconcile, {}));
    await drainOutbox();
    // La diaria también recupera cambios de nombre/comités cuyos eventos no llegaron al proveedor.
    expect(server.writes()).toHaveLength(1);
    expect(server.writes()[0]?.method).toBe("PUT");
    expect(server.objects.get(pass?.externalId ?? "")).toEqual(remote);
    expect(await getCarnetCredential(personId)).toEqual(credential);
  });

  it("pagina ciento un pases en lotes de cien sin omitir personas ni duplicar escrituras", async () => {
    const termId = await seedTerm();
    const personIds = await seedPeople(
      Array.from({ length: 101 }, (_, index) => ({
        email: `wallet-lote-${index}@eafit.edu.co`,
        firstName: "Miembro",
        lastName: `Sintético ${index}`,
      })),
    );
    const people = personIds.map((id) => ({ id }));
    await seedMemberships(personIds, termId);
    await seedCarnetTokens(personIds);
    await seedWalletPasses(
      personIds.map((id) => ({ personId: id, externalId: `1234567890.carnet-oe-test.${id}` })),
    );
    for (const { id } of people) {
      const externalId = `1234567890.carnet-oe-test.${id}`;
      server.objects.set(externalId, {
        id: externalId,
        classId: "1234567890.carnet-oe-test",
        state: "ACTIVE",
      });
    }
    await enqueueEvent(getDb(), eventOf(walletReconcile, {}));
    await drainOutbox();
    const jobs = await getDb().select().from(outbox);
    expect(jobs.filter((job) => job.eventType === "wallet.reconcile")).toHaveLength(2);
    expect(jobs.filter((job) => job.eventType === "wallet.sync")).toHaveLength(101);
    expect(server.writes()).toHaveLength(101);
    expect(new Set(server.writes().map((call) => call.path)).size).toBe(101);
    expect(server.writes().every((call) => call.method === "PUT")).toBe(true);
  });
});
