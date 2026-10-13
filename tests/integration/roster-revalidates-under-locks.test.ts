import { and, eq, getTableName, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  endMembershipAs,
  getRosterPreview,
  lockMembershipCycle,
  recordSanctionAs,
  setProbationAs,
} from "@/modules/people";
import {
  committee,
  committeeMembership,
  committeeRole,
  membership,
  membershipTerm,
  person,
} from "@/modules/people/schema";
import { todayKey } from "@/shared/lib/dates";
import {
  currentTermCode,
  seedCommittee,
  seedMember,
  seedMembershipTerm,
  seedTerm,
} from "../factories";
import { copyPattern } from "../helpers/copy";
import {
  firstThenSecond,
  holdTransaction,
  outcome,
  waitingOn,
  waitingWithWritesTo,
} from "../helpers/locks";
import { truncateAll } from "./db";

// ADR-127 regla 1 (DT-339): después de tomar los consultivos de las personas de su archivo, la
// importación del roster vuelve a validar por el camino de la vista previa y aplica, resume y guarda
// lo de esa segunda pasada. Antes validaba una sola vez, sin candados: la prueba o la suspensión que
// se confirmaba entre esa lectura y la fila llegaba a `changeMembershipStatus`, que rechaza con
// T-2331, y la importación entera se deshacía.

const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";

interface Admin {
  personId: string;
  ip: null;
}

const db = () => getDb();

/**
 * Dos personas activas y un archivo que le suma A3 a la primera y trae a la segunda como honoraria,
 * General de A3 (lo que arma su propuesta de líder) y con un cargo que solo pide esa fila.
 */
async function scenario() {
  const termId = await seedTerm();
  const code = currentTermCode();
  await seedCommittee("a3");
  const admin: Admin = { personId: await seedMember("admin.roster@eafit.edu.co"), ip: null };
  const one = { email: "prueba.una@eafit.edu.co", id: await seedMember("prueba.una@eafit.edu.co") };
  const other = {
    email: "prueba.otra@eafit.edu.co",
    id: await seedMember("prueba.otra@eafit.edu.co"),
  };
  // La importación toma los consultivos de menor a mayor `id` (ADR-122 regla 5). En el de la de menor
  // `id` la prueba la detiene, cuando ya validó y todavía no tomó el de quien pasa a honoraria.
  const [first, honorary] = one.id < other.id ? [one, other] : [other, one];
  const bytes = new TextEncoder().encode(
    `${[
      HEADER,
      `Ana;Pérez;${first.email};;Derecho;A3;${code};Activo;`,
      `Juan;Gómez;${honorary.email};;Economía;A3;${code};Honorario;General de A3, Cronista de A3`,
    ].join("\r\n")}\r\n`,
  );
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "roster.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  return { termId, admin, first, honorary, jobId };
}

type Scenario = Awaited<ReturnType<typeof scenario>>;

async function stateOf(personId: string) {
  const [row] = await db()
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  const open = await db()
    .select({ slug: committee.slug })
    .from(committeeMembership)
    .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  return { status: row?.status, committees: open.map((item) => item.slug).sort() };
}

const suspend = (admin: Admin, personId: string, termId: string): Promise<unknown> =>
  recordSanctionAs(
    admin,
    personId,
    {
      termId,
      kind: "SUSPENSION",
      cause: "Uso indebido de la oficina, con descargos",
      occurredOn: todayKey(),
      suspendedUntil: todayKey(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)),
    },
    { by: "ADMIN" },
  );

const putOnProbation = (admin: Admin, personId: string, termId: string): Promise<unknown> =>
  setProbationAs(admin, personId, termId, {
    probation: true,
    reason: "Bajo desempeño el semestre pasado",
  });

/** Lanza sin esperar: si la prueba cae antes de recoger el resultado, el rechazo no queda suelto. */
function launch<T>(running: Promise<T>): Promise<T> {
  void running.catch(() => undefined);
  return running;
}

/** La fila de quien pasaba a honoraria quedó saltada con T-3265 y a ella no se le escribió nada. */
async function expectRowSkipped(scene: Scenario, imported: PromiseSettledResult<unknown>) {
  const { first, honorary, jobId } = scene;
  expect(outcome(imported)).toBe("ok");
  // Sin propuesta de líder en el resumen: es de ahí de donde la acción concede el permiso.
  expect(imported).toMatchObject({
    value: { created: 0, updated: 1, unchanged: 0, skipped: 1, proposals: [] },
  });
  const applied = await getRosterPreview(jobId);
  expect(applied).toMatchObject({ status: "APPLIED", proposals: [] });
  expect(applied?.counts).toMatchObject({ ERROR: 1, CHANGED: 1 });
  const row = applied?.rows.find((item) => item.email === honorary.email);
  expect(row).toMatchObject({ group: "ERROR", changes: [] });
  expect(row?.errors).toEqual([
    expect.stringMatching(copyPattern("T-3265", { nombre: "Juan Gómez" })),
  ]);
  expect(await stateOf(honorary.id)).toEqual({ status: "ACTIVE", committees: [] });
  expect(await stateOf(first.id)).toEqual({ status: "ACTIVE", committees: ["a3"] });
}

describe("la importación del roster vuelve a validar con los candados de las personas tomados", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it.each([
    { arrives: "una suspensión", block: suspend },
    { arrives: "el periodo de prueba", block: putOnProbation },
  ])("$arrives que se confirma después de validar y antes de los candados deja esa fila en error y el resto del archivo se aplica", async ({
    block,
  }) => {
    const scene = await scenario();
    const { termId, admin, first, honorary, jobId } = scene;
    // Lo que el archivo anunciaba antes de la carrera: la fila sin error, con su propuesta.
    const before = await getRosterPreview(jobId);
    expect(before?.counts).toMatchObject({ ERROR: 0, CHANGED: 2 });
    expect(before?.proposals).toEqual([expect.objectContaining({ email: honorary.email })]);
    expect(before?.unknownRoles).toEqual(["Cronista"]);

    const held = await holdTransaction((tx) => lockMembershipCycle(tx, first.id));
    let imported: PromiseSettledResult<unknown>;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      await block(admin, honorary.id, termId);
      held.release();
      [imported] = await Promise.allSettled([importing]);
    } finally {
      held.release();
      await held.done;
    }

    await expectRowSkipped(scene, imported);
    // El cargo que solo pedía esa fila queda creado y contado, como el de cualquier fila con error
    // de la vista previa: `ensureRoles` recorre todas las filas (DT-378).
    expect(imported).toMatchObject({ value: { rolesCreated: ["Cronista"] } });
    expect(
      await db()
        .select({ label: committeeRole.label })
        .from(committeeRole)
        .where(eq(committeeRole.code, "CRONISTA")),
    ).toEqual([{ label: "Cronista" }]);
  });

  // La carrera que ejecutó la revisión del ciclo 15 (DT-386): la expulsión que se confirma mientras la
  // importación espera sus consultivos. La primera pasada todavía proponía a esa persona de líder;
  // la segunda, con los consultivos tomados, la encuentra de baja, su fila ya no le deja escrito
  // ningún comité (`committeesToWrite`) y por eso el resumen no la propone.
  it("la expulsión que se confirma después de validar y antes de los candados deja a esa persona sin comités y sin propuesta de líder, y el resto del archivo se aplica", async () => {
    const { admin, first, honorary, jobId } = await scenario();
    const before = await getRosterPreview(jobId);
    expect(before?.proposals).toEqual([expect.objectContaining({ email: honorary.email })]);

    const held = await holdTransaction((tx) => lockMembershipCycle(tx, first.id));
    let imported: PromiseSettledResult<unknown>;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      await endMembershipAs(admin, honorary.id, {
        endReason: "EXPULSION",
        memorialConsent: false,
        contactConsent: false,
      });
      held.release();
      [imported] = await Promise.allSettled([importing]);
    } finally {
      held.release();
      await held.done;
    }

    expect(outcome(imported)).toBe("ok");
    // Sin propuesta de líder en el resumen: es de ahí de donde la acción concede el permiso.
    expect(imported).toMatchObject({ value: { skipped: 0, proposals: [] } });
    const applied = await getRosterPreview(jobId);
    expect(applied).toMatchObject({ status: "APPLIED", proposals: [] });
    // Su fila no queda en error: avisa que no vuelve (T-2208) y no anuncia el estado ni los comités.
    const row = applied?.rows.find((item) => item.email === honorary.email);
    expect(row?.errors).toEqual([]);
    expect(row?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(copyPattern("T-2208", { nombre: "Juan Gómez" })),
      ]),
    );
    expect(row?.changes).toEqual(expect.not.arrayContaining(["status"]));
    expect(row?.changes).toEqual(expect.not.arrayContaining(["committees"]));
    expect(await stateOf(honorary.id)).toEqual({ status: "INACTIVE", committees: [] });
    expect(await stateOf(first.id)).toEqual({ status: "ACTIVE", committees: ["a3"] });
  });

  // ADR-120 regla 3, «Dentro de una importación»: el trabajo, los términos y los cargos que falten,
  // y recién después cada persona. La revisión del ciclo 15 encontró los cargos creándose después de
  // la segunda validación, con los consultivos de todo el archivo ya tomados.
  it("el cargo que el archivo trae nuevo ya está escrito cuando la importación espera el primer consultivo", async () => {
    const { admin, first, jobId } = await scenario();

    const held = await holdTransaction((tx) => lockMembershipCycle(tx, first.id));
    let imported: PromiseSettledResult<unknown>;
    let wroteRoles: number;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      wroteRoles = await waitingWithWritesTo(held.pid, getTableName(committeeRole));
      held.release();
      [imported] = await Promise.allSettled([importing]);
    } finally {
      held.release();
      await held.done;
    }

    expect(wroteRoles).toBe(1);
    expect(outcome(imported)).toBe("ok");
    expect(imported).toMatchObject({ value: { rolesCreated: ["Cronista"] } });
  });

  it("la fila que ya era un error antes de los candados sigue saltada aunque le levanten la prueba mientras la importación espera", async () => {
    const scene = await scenario();
    const { termId, admin, first, honorary, jobId } = scene;
    await putOnProbation(admin, honorary.id, termId);

    // Su consultivo no se tomó con los demás, en orden de `id`: aplicarla ahora sería tomarlo tarde.
    const held = await holdTransaction((tx) => lockMembershipCycle(tx, first.id));
    let imported: PromiseSettledResult<unknown>;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      await setProbationAs(admin, honorary.id, termId, {
        probation: false,
        reason: "Cumplió el plan de mejora",
      });
      held.release();
      [imported] = await Promise.allSettled([importing]);
    } finally {
      held.release();
      await held.done;
    }

    await expectRowSkipped(scene, imported);
  });

  const IN_PROGRESS: Array<{
    written: string;
    block: typeof suspend;
    prepare: (scene: Scenario) => Promise<void>;
    take: (scene: Scenario) => (tx: Tx) => Promise<unknown>;
  }> = [
    {
      // Registrar la sanción referencia la fila de `person`: retenida, el comando queda escrito a
      // medias con su consultivo tomado.
      written: "una suspensión",
      block: suspend,
      prepare: async () => {},
      take: (scene) => (tx) =>
        tx
          .select({ id: person.id })
          .from(person)
          .where(eq(person.id, scene.honorary.id))
          .for("update"),
    },
    {
      // Fijar la prueba actualiza la fila general de `membership_term`, que ya existe.
      written: "el periodo de prueba",
      block: putOnProbation,
      prepare: (scene) => seedMembershipTerm(scene.honorary.id, scene.termId, false),
      take: (scene) => (tx) =>
        tx
          .select({ id: membershipTerm.id })
          .from(membershipTerm)
          .where(
            and(
              eq(membershipTerm.personId, scene.honorary.id),
              eq(membershipTerm.termId, scene.termId),
              isNull(membershipTerm.committeeId),
            ),
          )
          .for("update"),
    },
  ];

  it.each(
    IN_PROGRESS,
  )("la importación que llega con $written escrita y sin confirmar la espera en el candado de esa persona y salta su fila", async ({
    block,
    prepare,
    take,
  }) => {
    const scene = await scenario();
    const { termId, admin, honorary, jobId } = scene;
    await prepare(scene);

    const [acted, imported] = await firstThenSecond(
      await holdTransaction(take(scene)),
      () => block(admin, honorary.id, termId),
      () => applyRosterImportAs(admin, jobId),
    );

    expect(outcome(acted)).toBe("ok");
    await expectRowSkipped(scene, imported);
  });
});
