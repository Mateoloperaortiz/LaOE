import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { grantPermissionAs, setOwnPassword } from "@/modules/identity";
import { verifyPassword } from "@/modules/identity/domain/pure";
import { credential, permission } from "@/modules/identity/schema";
import { createChallengeAs } from "@/modules/participation/domain/gamification-commands";
import { challengeQuestion } from "@/modules/participation/schema";
import {
  admitPersonAs,
  createPersonAs,
  endMembershipAs,
  recordConsentAs,
  setCommitteeMembershipsAs,
} from "@/modules/people";
import {
  createSegment,
  segmentFilterSchema,
  segmentInputSchema,
} from "@/modules/people/domain/segments";
import { createTag } from "@/modules/people/domain/tags";
import {
  committeeMembership,
  committeeRoleAssignment,
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
  seedCommitteeMembership,
  seedCommitteeRole,
  seedConsent,
  seedCredential,
  seedMember,
  seedMembership,
  seedMemberships,
  seedPermission,
  seedPerson,
  seedQuestion,
  seedSegment,
  seedTag,
  seedTerm,
  seedVeteran,
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

  const LEAVING = {
    endReason: "RESIGNATION",
    memorialConsent: false,
    contactConsent: false,
  } as const;

  /** La persona sin lo que es propio de cada una: su id, su correo y cuándo se creó o cambió. */
  const personOf = async (personId: string) => {
    const rows = await db().select().from(person).where(eq(person.id, personId));
    return without(rows[0], "id", "email", "createdAt", "updatedAt");
  };

  it("dejan la misma membresía de quien salió, con el último semestre y la época del carné que deja la baja (DT-351)", async () => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const left = await seedMember(BY_COMMAND, { phone: "3000000000" });
    const seeded = await seedPerson(BY_FACTORY, { stage: "ALUMNI" });

    await endMembershipAs({ personId: actor, ip: null }, left, LEAVING);
    await seedMembership(seeded, termId, "INACTIVE", { endReason: "RESIGNATION" });

    // Además de lo de siempre, sin la hora de la salida.
    const byCommand = await membershipOf(left, "endedAt");
    expect(byCommand).toMatchObject({
      status: "INACTIVE",
      endReason: "RESIGNATION",
      firstTermId: termId,
      lastTermId: termId,
      walletEpoch: 1,
    });
    expect(await membershipOf(seeded, "endedAt")).toEqual(byCommand);
    // La fábrica siembra la membresía y no toca a la persona: quien la llama la siembra como exalumna,
    // que es como la deja la baja. Lo otro que la baja le hace a la persona no lo deja ninguna siembra:
    // le revoca las sesiones y, sin autorización de contacto, le borra el celular.
    const former = await personOf(left);
    expect(former).toMatchObject({ stage: "ALUMNI", phone: null });
    expect(former.sessionsRevokedAt).toBeInstanceOf(Date);
    expect(await personOf(seeded)).toEqual({ ...former, sessionsRevokedAt: null });
  });

  it("dejan la misma membresía de quien entró en un semestre anterior y salió en el vigente, si la fábrica recibe aparte el último semestre", async () => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const entryTermId = await seedTerm("2025-1");
    const left = await seedVeteran(BY_COMMAND);
    const seeded = await seedPerson(BY_FACTORY, { stage: "ALUMNI" });

    await endMembershipAs({ personId: actor, ip: null }, left, LEAVING);
    await seedMembership(seeded, entryTermId, "INACTIVE", {
      endReason: "RESIGNATION",
      lastTermId: termId,
    });

    const byCommand = await membershipOf(left, "endedAt");
    expect(byCommand).toMatchObject({
      firstTermId: entryTermId,
      lastTermId: termId,
      walletEpoch: 1,
    });
    expect(await membershipOf(seeded, "endedAt")).toEqual(byCommand);
  });

  it("sin decirle el último semestre, la fábrica escribe el de ingreso: es la membresía de una baja que nombra ese semestre como el último", async () => {
    const actor = await seedMember(GRANTOR);
    await seedTerm();
    const entryTermId = await seedTerm("2025-1");
    const left = await seedVeteran(BY_COMMAND);
    const seeded = await seedPerson(BY_FACTORY, { stage: "ALUMNI" });

    await endMembershipAs({ personId: actor, ip: null }, left, {
      ...LEAVING,
      lastTermId: entryTermId,
    });
    await seedMembership(seeded, entryTermId, "INACTIVE", { endReason: "RESIGNATION" });

    const byCommand = await membershipOf(left, "endedAt");
    expect(byCommand).toMatchObject({ firstTermId: entryTermId, lastTermId: entryTermId });
    expect(await membershipOf(seeded, "endedAt")).toEqual(byCommand);
  });

  it("el motivo de salida y el último semestre son de una inactiva: con otro estado la fábrica lanza, dice qué hacer y no siembra la membresía (DT-382)", async () => {
    const termId = await seedTerm();
    const personId = await seedPerson(BY_FACTORY);

    for (const status of ["ACTIVE", "ON_LEAVE", "HONORARY"] as const) {
      for (const exit of [{ endReason: "RESIGNATION" } as const, { lastTermId: termId }]) {
        await expect(seedMembership(personId, termId, status, exit)).rejects.toThrow(
          `con el estado ${status} no se escriben. Quitá las opciones de salida o sembrá la membresía "INACTIVE"`,
        );
        await expect(seedMemberships([personId], termId, status, exit)).rejects.toThrow(
          "el motivo de salida y el último semestre son de una membresía inactiva",
        );
      }
    }

    expect(await db().select().from(membership).where(eq(membership.personId, personId))).toEqual(
      [],
    );
  });

  it("sembrar una inactiva sobre una persona que no es exalumna lanza, dice qué hacer y no siembra ninguna membresía (DT-382)", async () => {
    const termId = await seedTerm();
    const former = await seedPerson(BY_COMMAND, { stage: "ALUMNI" });

    for (const stage of ["MEMBER", "APPLICANT", "PROSPECT"] as const) {
      const personId = await seedPerson(`${stage.toLowerCase()}.${BY_FACTORY}`, { stage });

      await expect(seedMembership(personId, termId, "INACTIVE")).rejects.toThrow(
        'Sembrá a la persona con seedPerson(correo, { stage: "ALUMNI" }) antes de sembrar su membresía',
      );
      // En un lote, una sola persona que no es exalumna deja el lote entero sin sembrar, y el mensaje
      // la nombra a ella y no a la que sí lo es.
      const batch = seedMemberships([former, personId], termId, "INACTIVE");
      await expect(batch).rejects.toThrow(`no lo están: ${personId}.`);
    }
    // Una persona que no existe tampoco es exalumna: cae por la misma puerta, antes de escribir.
    await expect(seedMembership("nadie", termId, "INACTIVE")).rejects.toThrow(
      "no lo están: nadie.",
    );

    expect(await db().select().from(membership)).toEqual([]);
    // Con la persona exalumna, la misma llamada siembra.
    await seedMembership(former, termId, "INACTIVE");
    expect(await db().select({ personId: membership.personId }).from(membership)).toEqual([
      { personId: former },
    ]);
  });
});

describe("la fábrica y el cargo de quien ya está en un comité", () => {
  beforeEach(truncateAll);

  /** La pertenencia de la persona y sus cargos, sin lo que es propio de cada fila. */
  async function seatOf(personId: string) {
    const seats = await db()
      .select()
      .from(committeeMembership)
      .where(eq(committeeMembership.personId, personId));
    expect(seats).toHaveLength(1);
    const roles = await db()
      .select()
      .from(committeeRoleAssignment)
      .where(eq(committeeRoleAssignment.personId, personId))
      .orderBy(asc(committeeRoleAssignment.roleCode));
    return {
      pertenencia: without(seats[0], "id", "personId", "committeeId", "joinedAt", "createdAt"),
      // La hora del cierre es propia de cada fila; que el cargo esté cerrado o vivo, no.
      cargos: roles.map((row) => ({
        ...without(
          row,
          "id",
          "membershipId",
          "personId",
          "committeeId",
          "startedAt",
          "endedAt",
          "createdAt",
        ),
        cerrado: row.endedAt !== null,
      })),
    };
  }

  // El cargo principal de la pertenencia es el cargo vivo de menor orden, sea titular o codirección
  // (`syncPrincipalRole`, ADR-058): Financiero va antes que Gestión Humana.
  it.each([
    {
      caso: "un titular",
      roles: [{ roleCode: "GESTION_HUMANA", coDirector: false }],
      principal: "GESTION_HUMANA",
    },
    {
      caso: "una codirección",
      roles: [{ roleCode: "GENERAL", coDirector: true }],
      principal: "GENERAL",
    },
    {
      // Con dos cargos directivos, uno tiene que ser codirección (Regl. art. 27; ADR-060 regla 11).
      caso: "un segundo cargo de mayor orden, que no pasa a ser el principal",
      roles: [
        { roleCode: "FINANCIERO", coDirector: false },
        { roleCode: "GESTION_HUMANA", coDirector: true },
      ],
      principal: "FINANCIERO",
    },
    {
      // El orden es el del catálogo (`sort_order`) y la etiqueta solo desempata: Logística (5) va antes
      // que Gestión Humana (6), y por etiqueta iría después. En el caso anterior los dos órdenes dan lo
      // mismo.
      caso: "un segundo cargo de menor orden y de etiqueta posterior, que pasa a ser el principal",
      roles: [
        { roleCode: "GESTION_HUMANA", coDirector: false },
        { roleCode: "LOGISTICA", coDirector: true },
      ],
      principal: "LOGISTICA",
    },
  ])("dejan la misma pertenencia y los mismos cargos con $caso (DT-354)", async ({
    roles,
    principal,
  }) => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const byCommand = await seedVeteran(BY_COMMAND);
    const byFactory = await seedVeteran(BY_FACTORY);
    // Un comité por camino: un cargo admite un solo titular y una sola codirección por comité y término.
    const forCommand = await seedCommittee("paridad-comando");
    const forFactory = await seedCommittee("paridad-fabrica");
    await seedCommitteeMembership(byCommand, forCommand, termId);
    const seat = await seedCommitteeMembership(byFactory, forFactory, termId);

    await setCommitteeMembershipsAs({ personId: actor, ip: null }, byCommand, termId, [
      { committeeId: forCommand, roles },
    ]);
    for (const role of roles) {
      await seedCommitteeRole(seat, role.roleCode, role.coDirector);
    }

    const named = await seatOf(byCommand);
    expect(named.pertenencia).toMatchObject({ roleCode: principal });
    expect(named.cargos).toHaveLength(roles.length);
    expect(await seatOf(byFactory)).toEqual(named);
  });

  it("dejan el mismo cargo principal en una pertenencia con un cargo cerrado de menor orden: el cerrado no cuenta (DT-354)", async () => {
    const actor = await seedMember(GRANTOR);
    const termId = await seedTerm();
    const byCommand = await seedVeteran(BY_COMMAND);
    const byFactory = await seedVeteran(BY_FACTORY);
    const forCommand = await seedCommittee("paridad-comando");
    const forFactory = await seedCommittee("paridad-fabrica");
    await seedCommitteeMembership(byCommand, forCommand, termId);
    const seat = await seedCommitteeMembership(byFactory, forFactory, termId);
    const name = (personId: string, committeeId: string, roleCodes: string[]) =>
      setCommitteeMembershipsAs({ personId: actor, ip: null }, personId, termId, [
        { committeeId, roles: roleCodes.map((roleCode) => ({ roleCode, coDirector: false })) },
      ]);
    // El cargo cerrado lo deja el comando por los dos caminos, porque la fábrica no cierra cargos:
    // Logística (5), de menor orden que el cargo que viene después.
    for (const [personId, committeeId] of [
      [byCommand, forCommand],
      [byFactory, forFactory],
    ] as const) {
      await name(personId, committeeId, ["LOGISTICA"]);
      await name(personId, committeeId, []);
    }

    await name(byCommand, forCommand, ["GESTION_HUMANA"]);
    await seedCommitteeRole(seat, "GESTION_HUMANA");

    const named = await seatOf(byCommand);
    expect(named.pertenencia).toMatchObject({ roleCode: "GESTION_HUMANA" });
    expect(named.cargos).toMatchObject([
      { roleCode: "GESTION_HUMANA", cerrado: false },
      { roleCode: "LOGISTICA", cerrado: true },
    ]);
    expect(await seatOf(byFactory)).toEqual(named);
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
