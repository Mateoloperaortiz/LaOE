import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { grantPermissionAs, setOwnPassword } from "@/modules/identity";
import { verifyPassword } from "@/modules/identity/domain/pure";
import { credential, permission } from "@/modules/identity/schema";
import { createChallengeAs } from "@/modules/participation/domain/gamification-commands";
import { challengeQuestion } from "@/modules/participation/schema";
import { admitPersonAs, createPersonAs, endMembershipAs, recordConsentAs } from "@/modules/people";
import {
  createSegment,
  segmentFilterSchema,
  segmentInputSchema,
} from "@/modules/people/domain/segments";
import { createTag } from "@/modules/people/domain/tags";
import {
  consent,
  membership,
  membershipEvent,
  person,
  segment,
  tag,
} from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { conventionalTermDates } from "@/modules/terms";
import { createTerm, termInputSchema } from "@/modules/terms/domain/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  seedCommittee,
  seedConsent,
  seedCredential,
  seedMember,
  seedMembership,
  seedPermission,
  seedPerson,
  seedQuestion,
  seedSegment,
  seedTag,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

// La fábrica escribe filas y no llama comandos: «siempre por comandos» quedó descartado (DT-013).
// Donde hay un comando equivalente, acá se compara lo que deja cada uno (ADR-124 reglas 5 y 6). Si el
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

describe("la fábrica y createTag", () => {
  beforeEach(truncateAll);

  it("dejan la misma fila de una etiqueta sin color", async () => {
    const actor = await seedMember(GRANTOR);

    const byCommand = await runCommand({ personId: actor, ip: null }, (ctx) =>
      createTag(ctx, { name: "Por comando" }),
    );
    const byFactory = await seedTag("Por fábrica");

    // Sin lo que es propio de cada fila: su id, su nombre y cuándo se creó.
    const rows = await db().select().from(tag);
    const rowOf = (id: string) =>
      rows
        .filter((row) => row.id === id)
        .map((row) => ({ ...row, id: null, name: null, createdAt: null }));
    expect(rowOf(byCommand.id)).toHaveLength(1);
    expect(rowOf(byFactory)).toEqual(rowOf(byCommand.id));
  });
});

/** La fila sin lo que es propio de cada una: las columnas que se nombran quedan en nulo. */
function without<T extends Record<string, unknown>>(row: T | undefined, ...own: string[]): T {
  if (!row) {
    throw new Error("No hay fila que comparar");
  }
  return { ...row, ...Object.fromEntries(own.map((column) => [column, null])) };
}

describe("la fábrica y los comandos de las cuatro tablas de partida", () => {
  beforeEach(truncateAll);

  const membershipOf = async (personId: string, ...own: string[]) => {
    const rows = await db().select().from(membership).where(eq(membership.personId, personId));
    expect(rows).toHaveLength(1);
    return without(rows[0], "id", "personId", "createdAt", "updatedAt", ...own);
  };

  it("dejan la misma fila de un término", async () => {
    const actor = await seedMember(GRANTOR);

    const byCommand = await runCommand({ personId: actor, ip: null }, (ctx) =>
      createTerm(
        ctx,
        termInputSchema.parse({ code: "2024-2", ...conventionalTermDates("2024-2") }),
      ),
    );
    const byFactory = await seedTerm("2025-2");

    // Sin lo que es propio de cada uno: su id, su código, sus fechas y cuándo se creó.
    const rows = await db().select().from(term);
    const rowOf = (id: string) =>
      without(
        rows.find((row) => row.id === id),
        "id",
        "code",
        "startsOn",
        "endsOn",
        "createdAt",
        "updatedAt",
      );
    expect(rowOf(byFactory)).toEqual(rowOf(byCommand.id));
  });

  it("dejan la misma fila de un prospecto, salvo el origen: el comando escribe ADMIN y la fábrica, TEST", async () => {
    const actor = await seedMember(GRANTOR);

    const byCommand = await createPersonAs(
      { personId: actor, ip: null },
      { firstName: "Persona", lastName: "Sintética", email: BY_COMMAND, kind: "STUDENT" },
    );
    const byFactory = await seedPerson(BY_FACTORY, { stage: "PROSPECT" });

    const rows = await db().select().from(person);
    const rowOf = (id: string) =>
      without(
        rows.find((row) => row.id === id),
        "id",
        "email",
        "createdAt",
        "updatedAt",
      );
    expect(rowOf(byCommand.id)).toMatchObject({ stage: "PROSPECT", source: "ADMIN" });
    expect(rowOf(byFactory)).toEqual({ ...rowOf(byCommand.id), source: "TEST" });
  });

  it("dejan la misma membresía activa; el evento del alta solo lo deja el comando", async () => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const committeeId = await seedCommittee("paridad");
    const admitted = await seedPerson(BY_COMMAND, { stage: "APPLICANT" });
    const seeded = await seedPerson(BY_FACTORY);

    const byCommand = await admitPersonAs({ personId: actor, ip: null }, admitted, {
      termId,
      committeeIds: [committeeId],
    });
    await seedMembership(seeded, termId);

    expect(await membershipOf(seeded)).toEqual(await membershipOf(admitted));
    expect(
      await db().select({ membershipId: membershipEvent.membershipId }).from(membershipEvent),
    ).toEqual([{ membershipId: byCommand.membershipId }]);
  });

  it("dejan la misma membresía de quien salió, salvo el último semestre y la época del carné, que solo escribe la baja (DT-351)", async () => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const left = await seedMember(BY_COMMAND);
    const seeded = await seedPerson(BY_FACTORY);

    await endMembershipAs({ personId: actor, ip: null }, left, {
      endReason: "RESIGNATION",
      memorialConsent: false,
      contactConsent: false,
    });
    await seedMembership(seeded, termId, "INACTIVE", "RESIGNATION");

    // Además de lo de siempre, sin la hora de la salida.
    const byCommand = await membershipOf(left, "endedAt");
    expect(byCommand).toMatchObject({
      status: "INACTIVE",
      endReason: "RESIGNATION",
      lastTermId: termId,
      walletEpoch: 1,
    });
    expect(await membershipOf(seeded, "endedAt")).toEqual({
      ...byCommand,
      lastTermId: null,
      walletEpoch: 0,
    });
    // La baja pasa además a la persona a exalumna; la fábrica siembra la membresía y no toca a la persona.
    const stages = await db().select({ id: person.id, stage: person.stage }).from(person);
    expect(stages.find((row) => row.id === left)?.stage).toBe("ALUMNI");
    expect(stages.find((row) => row.id === seeded)?.stage).toBe("MEMBER");
  });
});

describe("la fábrica y setOwnPassword", () => {
  beforeEach(truncateAll);

  const FIRST = "trapecio verde 41";
  const SECOND = "bulevar de tinta 88";

  async function credentialOf(personId: string) {
    const rows = await db().select().from(credential).where(eq(credential.personId, personId));
    expect(rows).toHaveLength(1);
    return without(rows[0]);
  }

  it("dejan una credencial que abre con la contraseña y, al cambiarla, la misma fila con la clave nueva y su fecha de cambio movida", async () => {
    const byCommand = await seedMember(BY_COMMAND);
    const byFactory = await seedMember(BY_FACTORY);
    const setOwn = (password: string, current: string) =>
      setOwnPassword({
        personId: byCommand,
        email: BY_COMMAND,
        names: ["Persona", "Sintética"],
        current,
        password,
        keepSessionId: "ninguna",
        ip: null,
      });

    expect(await setOwn(FIRST, "")).toMatchObject({ ok: true });
    await seedCredential(byFactory, FIRST);
    const first = {
      comando: await credentialOf(byCommand),
      fábrica: await credentialOf(byFactory),
    };
    expect(await verifyPassword(first.comando.passwordHash, FIRST)).toBe(true);
    expect(await verifyPassword(first.fábrica.passwordHash, FIRST)).toBe(true);

    expect(await setOwn(SECOND, FIRST)).toMatchObject({ ok: true });
    await seedCredential(byFactory, SECOND);

    for (const [who, personId] of [
      ["comando", byCommand],
      ["fábrica", byFactory],
    ] as const) {
      const before = first[who];
      const after = await credentialOf(personId);
      expect(after.id, who).toBe(before.id);
      expect(after.createdAt, who).toEqual(before.createdAt);
      expect(after.updatedAt.getTime(), who).toBeGreaterThan(before.updatedAt.getTime());
      expect(await verifyPassword(after.passwordHash, SECOND), who).toBe(true);
      expect(await verifyPassword(after.passwordHash, FIRST), who).toBe(false);
    }
  });
});

describe("la fábrica y createSegment", () => {
  beforeEach(truncateAll);

  it("dejan un segmento sin filtro que se lee igual; el comando escribe además cada filtro con su valor por defecto y quién lo creó", async () => {
    const actor = await seedMember(GRANTOR);

    const byCommand = await runCommand({ personId: actor, ip: null }, (ctx) =>
      createSegment(ctx, segmentInputSchema.parse({ name: "Por comando" })),
    );
    const byFactory = await seedSegment("Por fábrica");

    // Sin lo que es propio de cada fila: su id, su nombre y cuándo se creó.
    const rows = await db().select().from(segment);
    const rowOf = (id: string) =>
      without(
        rows.find((row) => row.id === id),
        "id",
        "name",
        "createdAt",
        "updatedAt",
      );
    const command = rowOf(byCommand.id);
    const factory = rowOf(byFactory);
    expect(command).toMatchObject({ createdById: actor, filter: segmentFilterSchema.parse({}) });
    expect(factory).toEqual({ ...command, createdById: null, filter: {} });
    // Los valores por defecto los pone la lectura, que valida el filtro guardado.
    expect(segmentFilterSchema.parse(factory.filter)).toEqual(command.filter);
  });
});

describe("la fábrica y el guardado de un reto", () => {
  beforeEach(truncateAll);

  it("dejan la misma pregunta de una trivia", async () => {
    await seedTerm();
    const actor = await seedMember(GRANTOR);
    const question = { prompt: "¿Pregunta?", options: ["Sí", "No"], correctIndex: 0 };
    const draft = (title: string, questions: (typeof question)[]) =>
      createChallengeAs(
        { personId: actor, ip: null },
        {
          kind: "TRIVIA",
          title,
          description: "Descripción",
          audience: "ALL",
          audienceCommitteeIds: [],
          opensAt: new Date(Date.now() - 3_600_000),
          closesAt: new Date(Date.now() + 86_400_000),
          basePoints: 5,
          passPercent: 80,
          occasionId: null,
          questions,
        },
      );

    const byCommand = await draft("Trivia por comando", [question]);
    const byFactory = await draft("Trivia por fábrica", []);
    await seedQuestion(byFactory.id);

    // Sin lo que es propio de cada fila: su id, de qué reto es y cuándo se creó.
    const rows = await db().select().from(challengeQuestion);
    const of = (challengeId: string) =>
      rows
        .filter((row) => row.challengeId === challengeId)
        .map((row) => without(row, "id", "challengeId", "createdAt"));
    expect(of(byCommand.id)).toHaveLength(1);
    expect(of(byFactory.id)).toEqual(of(byCommand.id));
  });
});
