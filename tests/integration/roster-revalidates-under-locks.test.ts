import { and, eq, getTableName, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
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
async function escenario() {
  const termId = await seedTerm();
  const code = currentTermCode();
  await seedCommittee("a3");
  const admin: Admin = { personId: await seedMember("admin.roster@eafit.edu.co"), ip: null };
  const una = { email: "prueba.una@eafit.edu.co", id: await seedMember("prueba.una@eafit.edu.co") };
  const otra = {
    email: "prueba.otra@eafit.edu.co",
    id: await seedMember("prueba.otra@eafit.edu.co"),
  };
  // La importación toma los consultivos de menor a mayor `id` (ADR-122 regla 5). En el de la de menor
  // `id` la prueba la detiene, cuando ya validó y todavía no tomó el de quien pasa a honoraria.
  const [primera, honoraria] = una.id < otra.id ? [una, otra] : [otra, una];
  const bytes = new TextEncoder().encode(
    `${[
      HEADER,
      `Ana;Pérez;${primera.email};;Derecho;A3;${code};Activo;`,
      `Juan;Gómez;${honoraria.email};;Economía;A3;${code};Honorario;General de A3, Cronista de A3`,
    ].join("\r\n")}\r\n`,
  );
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "roster.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  return { termId, admin, primera, honoraria, jobId };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

async function comoQuedo(personId: string) {
  const [row] = await db()
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  const vivas = await db()
    .select({ slug: committee.slug })
    .from(committeeMembership)
    .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  return { estado: row?.status, comites: vivas.map((item) => item.slug).sort() };
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
async function expectRowSkipped(scene: Escenario, imported: PromiseSettledResult<unknown>) {
  const { primera, honoraria, jobId } = scene;
  expect(outcome(imported)).toBe("ok");
  // Sin propuesta de líder en el resumen: es de ahí de donde la acción concede el permiso.
  expect(imported).toMatchObject({
    value: { created: 0, updated: 1, unchanged: 0, skipped: 1, proposals: [] },
  });
  const applied = await getRosterPreview(jobId);
  expect(applied).toMatchObject({ status: "APPLIED", proposals: [] });
  expect(applied?.counts).toMatchObject({ ERROR: 1, CHANGED: 1 });
  const row = applied?.rows.find((item) => item.email === honoraria.email);
  expect(row).toMatchObject({ group: "ERROR", changes: [] });
  expect(row?.errors).toEqual([
    expect.stringMatching(copyPattern("T-3265", { nombre: "Juan Gómez" })),
  ]);
  expect(await comoQuedo(honoraria.id)).toEqual({ estado: "ACTIVE", comites: [] });
  expect(await comoQuedo(primera.id)).toEqual({ estado: "ACTIVE", comites: ["a3"] });
}

describe("la importación del roster vuelve a validar con los candados de las personas tomados", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it.each([
    { llega: "una suspensión", block: suspend },
    { llega: "el periodo de prueba", block: putOnProbation },
  ])("$llega que se confirma después de validar y antes de los candados deja esa fila en error y el resto del archivo se aplica", async ({
    block,
  }) => {
    const scene = await escenario();
    const { termId, admin, primera, honoraria, jobId } = scene;
    // Lo que el archivo anunciaba antes de la carrera: la fila sin error, con su propuesta.
    const before = await getRosterPreview(jobId);
    expect(before?.counts).toMatchObject({ ERROR: 0, CHANGED: 2 });
    expect(before?.proposals).toEqual([expect.objectContaining({ email: honoraria.email })]);
    expect(before?.unknownRoles).toEqual(["Cronista"]);

    const held = await holdTransaction((tx) => lockMembershipCycle(tx, primera.id));
    let imported: PromiseSettledResult<unknown>;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      await block(admin, honoraria.id, termId);
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

  // ADR-120 regla 3, «Dentro de una importación»: el trabajo, los términos y los cargos que falten,
  // y recién después cada persona. La revisión del ciclo 15 encontró los cargos creándose después de
  // la segunda validación, con los consultivos de todo el archivo ya tomados.
  it("el cargo que el archivo trae nuevo ya está escrito cuando la importación espera el primer consultivo", async () => {
    const { admin, primera, jobId } = await escenario();

    const held = await holdTransaction((tx) => lockMembershipCycle(tx, primera.id));
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
    const scene = await escenario();
    const { termId, admin, primera, honoraria, jobId } = scene;
    await putOnProbation(admin, honoraria.id, termId);

    // Su consultivo no se tomó con los demás, en orden de `id`: aplicarla ahora sería tomarlo tarde.
    const held = await holdTransaction((tx) => lockMembershipCycle(tx, primera.id));
    let imported: PromiseSettledResult<unknown>;
    try {
      const importing = launch(applyRosterImportAs(admin, jobId));
      await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
      await setProbationAs(admin, honoraria.id, termId, {
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

  const EN_CURSO: Array<{
    escrita: string;
    block: typeof suspend;
    prepare: (scene: Escenario) => Promise<void>;
    take: (scene: Escenario) => (tx: Tx) => Promise<unknown>;
  }> = [
    {
      // Registrar la sanción referencia la fila de `person`: retenida, el comando queda escrito a
      // medias con su consultivo tomado.
      escrita: "una suspensión",
      block: suspend,
      prepare: async () => {},
      take: (scene) => (tx) =>
        tx
          .select({ id: person.id })
          .from(person)
          .where(eq(person.id, scene.honoraria.id))
          .for("update"),
    },
    {
      // Fijar la prueba actualiza la fila general de `membership_term`, que ya existe.
      escrita: "el periodo de prueba",
      block: putOnProbation,
      prepare: (scene) => seedMembershipTerm(scene.honoraria.id, scene.termId, false),
      take: (scene) => (tx) =>
        tx
          .select({ id: membershipTerm.id })
          .from(membershipTerm)
          .where(
            and(
              eq(membershipTerm.personId, scene.honoraria.id),
              eq(membershipTerm.termId, scene.termId),
              isNull(membershipTerm.committeeId),
            ),
          )
          .for("update"),
    },
  ];

  it.each(
    EN_CURSO,
  )("la importación que llega con $escrita escrita y sin confirmar la espera en el candado de esa persona y salta su fila", async ({
    block,
    prepare,
    take,
  }) => {
    const scene = await escenario();
    const { termId, admin, honoraria, jobId } = scene;
    await prepare(scene);

    const [acted, imported] = await firstThenSecond(
      await holdTransaction(take(scene)),
      () => block(admin, honoraria.id, termId),
      () => applyRosterImportAs(admin, jobId),
    );

    expect(outcome(acted)).toBe("ok");
    await expectRowSkipped(scene, imported);
  });
});
