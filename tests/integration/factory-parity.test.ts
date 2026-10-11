import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { grantPermissionAs } from "@/modules/identity";
import { permission } from "@/modules/identity/schema";
import { recordConsentAs } from "@/modules/people";
import { consent } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { seedCommittee, seedConsent, seedMember, seedPermission } from "../factories";
import { truncateAll } from "./db";

// La fábrica escribe filas y no llama comandos: «siempre por comandos» quedó descartado (DT-013).
// Donde hay un comando equivalente, acá se compara lo que deja cada uno (ADR-124 regla 5). Si el
// comando empieza a escribir otra cosa en la fila y la fábrica no lo sigue, la siembra arma un estado
// que la casa no produce y esta prueba cae.

const db = () => getDb();

const GRANTOR = "quien.concede@eafit.edu.co";
const BY_COMMAND = "por.comando@eafit.edu.co";
const BY_FACTORY = "por.fabrica@eafit.edu.co";

/** Los permisos de una persona sin lo que es propio de cada fila: su id, de quién es y cuándo se dio. */
async function permissionsOf(personId: string) {
  const rows = await db().select().from(permission).where(eq(permission.personId, personId));
  return rows.map((row) => ({ ...row, id: null, personId: null, grantedAt: null }));
}

afterAll(closeDb);

describe("la fábrica y grantPermission", () => {
  beforeEach(truncateAll);

  it.each([
    { code: "ADMIN", scoped: false },
    { code: "BOARD", scoped: false },
    { code: "COMMITTEE_LEADER", scoped: true },
  ] as const)("dejan la misma fila de un permiso $code", async ({ code, scoped }) => {
    const grantorId = await seedMember(GRANTOR);
    const byCommand = await seedMember(BY_COMMAND);
    const byFactory = await seedMember(BY_FACTORY);
    const committeeId = scoped ? await seedCommittee("paridad") : null;

    await grantPermissionAs(
      { personId: grantorId, ip: null },
      { email: BY_COMMAND, code, committeeId: committeeId ?? undefined },
    );
    await seedPermission(byFactory, code, committeeId, grantorId);

    const granted = await permissionsOf(byCommand);
    expect(granted).toHaveLength(1);
    expect(await permissionsOf(byFactory)).toEqual(granted);
  });

  it("la fábrica solo escribe la fila: la auditoría y el evento los deja el comando", async () => {
    const grantorId = await seedMember(GRANTOR);
    await seedMember(BY_COMMAND);
    const byFactory = await seedMember(BY_FACTORY);

    await seedPermission(byFactory, "ADMIN", null, grantorId);
    expect(await db().select().from(auditLog)).toHaveLength(0);
    expect(await db().select().from(outbox)).toHaveLength(0);

    await grantPermissionAs(
      { personId: grantorId, ip: null },
      { email: BY_COMMAND, code: "ADMIN" },
    );
    const audited = await db().select({ action: auditLog.action }).from(auditLog);
    expect(audited).toEqual([{ action: "permission.granted" }]);
    expect(await db().select().from(outbox)).toHaveLength(1);
  });

  it("ante un permiso que la persona ya tiene, el comando lo rechaza y la fábrica devuelve el que hay: queda una sola fila", async () => {
    const grantorId = await seedMember(GRANTOR);
    const personId = await seedMember(BY_FACTORY);
    const committeeId = await seedCommittee("paridad");
    const otherCommitteeId = await seedCommittee("otro");

    const admin = await seedPermission(personId, "ADMIN");
    expect(await seedPermission(personId, "ADMIN")).toBe(admin);
    await expect(
      grantPermissionAs({ personId: grantorId, ip: null }, { email: BY_FACTORY, code: "ADMIN" }),
    ).rejects.toThrow(t("T-268"));
    expect(await permissionsOf(personId)).toHaveLength(1);

    const leader = await seedPermission(personId, "COMMITTEE_LEADER", committeeId);
    expect(await seedPermission(personId, "COMMITTEE_LEADER", committeeId)).toBe(leader);
    expect(await seedPermission(personId, "COMMITTEE_LEADER", otherCommitteeId)).not.toBe(leader);
    expect(await permissionsOf(personId)).toHaveLength(3);
  });
});

/** Las autorizaciones de una persona sin lo que es propio de cada fila: su id, de quién es y cuándo se dio. */
async function consentsOf(personId: string) {
  const rows = await db().select().from(consent).where(eq(consent.personId, personId));
  return rows.map((row) => ({ ...row, id: null, personId: null, acceptedAt: null }));
}

describe("la fábrica y recordConsent", () => {
  beforeEach(truncateAll);

  it.each([
    { purpose: "MEMBERSHIP", source: "SELF" },
    { purpose: "DIRECTORY_PHOTO", source: "SELF" },
    { purpose: "DATA_PROCESSING", source: "FORM" },
  ] as const)("dejan la misma fila de una autorización $purpose", async ({ purpose, source }) => {
    const byCommand = await seedMember(BY_COMMAND);
    const byFactory = await seedMember(BY_FACTORY);

    await recordConsentAs({ personId: byCommand, ip: null }, byCommand, purpose, source);
    await seedConsent(byFactory, purpose, source);

    const recorded = await consentsOf(byCommand);
    expect(recorded).toHaveLength(1);
    expect(await consentsOf(byFactory)).toEqual(recorded);
  });

  it("ante una autorización que la persona ya tiene viva, ni el comando ni la fábrica chocan: queda una sola fila", async () => {
    const personId = await seedMember(BY_FACTORY);

    await seedConsent(personId);
    await seedConsent(personId);
    const again = await recordConsentAs({ personId, ip: null }, personId, "MEMBERSHIP", "SELF");

    expect(again.created).toBe(false);
    expect(await consentsOf(personId)).toHaveLength(1);
  });
});
