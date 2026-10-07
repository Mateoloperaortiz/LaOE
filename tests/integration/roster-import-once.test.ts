import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { personImported } from "@/domain-events/people";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
  type RosterColumn,
  recordLeaderGrantsAs,
  remapRosterPreviewAs,
} from "@/modules/people";
import { person } from "@/modules/people/schema";
import { auditLog, importJob, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";
import { currentTermCode, seedCommittee, seedMember, seedTerm } from "./factories";

// Una importación del roster sale de la vista previa una sola vez (ADR-113 regla 7) y los permisos de
// líder se registran sobre la importación ya aplicada (ADR-114 regla 7), por la interfaz pública de
// `people`.

const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";
const ANA = "prueba.ana@eafit.edu.co";
const JUAN = "prueba.juan@eafit.edu.co";

/** Lo que la página registra después de otorgar los permisos, uno por uno. */
const GRANTS = {
  granted: ["Ana Sintética · A3"],
  failed: ["Juan Sintética · A3: motivo de prueba"],
};

/** Las columnas del archivo con NOMBRE y APELLIDO cruzadas: un cambio que se nota en lo aplicado. */
const SWAPPED: Array<RosterColumn | null> = [
  "lastName",
  "firstName",
  "email",
  "phone",
  "program",
  "committees",
  "entry",
  "status",
  "role",
];

const db = () => getDb();

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function row(firstName: string, email: string): string {
  return `${firstName};Sintética;${email};;Derecho;A3;${currentTermCode()};Activo;`;
}

/** Un admin, el comité del archivo y una vista previa con esas filas. */
async function previewOf(lines: string[]): Promise<{ admin: { personId: string }; jobId: string }> {
  const termId = await seedTerm();
  await seedCommittee("a3");
  const admin = { personId: await seedMember("admin.importa@eafit.edu.co") };
  const bytes = new TextEncoder().encode(`${[HEADER, ...lines].join("\r\n")}\r\n`);
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "roster.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  return { admin, jobId };
}

/** Lo que una aplicación deja por fila: su auditoría y su evento. */
async function importedBy(jobId: string): Promise<{ audits: number; events: number }> {
  const [audits] = await db()
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(eq(auditLog.action, "person.imported"), sql`${auditLog.after}->>'jobId' = ${jobId}`),
    );
  const [events] = await db()
    .select({ n: count() })
    .from(outbox)
    .where(
      and(eq(outbox.eventType, personImported.type), sql`${outbox.payload}->>'jobId' = ${jobId}`),
    );
  return { audits: audits?.n ?? 0, events: events?.n ?? 0 };
}

async function statusOf(jobId: string): Promise<string | undefined> {
  return (await getRosterPreview(jobId))?.status;
}

/** Cuántas veces se reescribió el trabajo: cada escritura deja su auditoría. */
async function rewritesOf(jobId: string): Promise<number> {
  const [found] = await db()
    .select({ n: count() })
    .from(auditLog)
    .where(and(eq(auditLog.action, "import.updated"), eq(auditLog.entityId, jobId)));
  return found?.n ?? 0;
}

/** Cómo quedó todo tras unas llamadas: quién se rechazó y con qué texto, el estado y lo aplicado. */
async function outcomeOf(jobId: string, results: PromiseSettledResult<unknown>[]) {
  return {
    rejected: rejections(results),
    status: await statusOf(jobId),
    ...(await importedBy(jobId)),
  };
}

/** El texto de cada rechazo; uno que no es de dominio se nombra para que la prueba lo muestre. */
function rejections(results: PromiseSettledResult<unknown>[]): string[] {
  return results.flatMap((result) => {
    if (result.status === "fulfilled") return [];
    return [
      result.reason instanceof DomainError
        ? result.reason.message
        : `no es de dominio: ${String(result.reason)}`,
    ];
  });
}

/** Conexiones ya abiertas, para que las dos transacciones corran de verdad a la vez. */
async function warmUp(jobId: string): Promise<void> {
  await Promise.all([getRosterPreview(jobId), getRosterPreview(jobId)]);
}

function settled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return Promise.allSettled([promise]).then(([result]) => result);
}

/** Otra transacción retiene la fila que bloquea `lock` hasta que se suelte. */
async function hold(
  lock: (tx: Tx) => Promise<unknown>,
): Promise<{ pid: number; release: () => Promise<void> }> {
  let ready: (pid: number) => void = () => {};
  let release: () => void = () => {};
  const taken = new Promise<number>((resolve) => {
    ready = resolve;
  });
  const freed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = db().transaction(async (tx) => {
    await lock(tx);
    const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready(result.rows[0]?.pid ?? 0);
    await freed;
  });
  return {
    pid: await taken,
    release: async () => {
      release();
      await done;
    },
  };
}

/**
 * Retiene la fila de una persona: la aplicación que llegue a esa fila se queda ahí, a medias y con el
 * trabajo ya tomado, hasta que se suelte.
 */
function holdPerson(email: string) {
  return hold((tx) =>
    tx.select({ id: person.id }).from(person).where(eq(person.email, email)).for("update"),
  );
}

/** Retiene el trabajo: quien lo quiera tomar hace fila detrás, en el orden en que llegó. */
function holdJob(jobId: string) {
  return hold((tx) =>
    tx.select({ id: importJob.id }).from(importJob).where(eq(importJob.id, jobId)).for("update"),
  );
}

/** Evidencia de PostgreSQL de quién espera detrás de una transacción: se espera un hecho, no un tiempo. */
async function blockedBy(pid: number): Promise<number[]> {
  const result = await db().execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows.map((found) => found.pid);
}

afterAll(() => closeDb());

describe("una importación del roster se aplica o se descarta una sola vez", () => {
  beforeEach(truncateAll);

  it("aplicarla otra vez se rechaza y no vuelve a auditar ni a emitir", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA), row("Juan", JUAN)]);
    await applyRosterImportAs(admin, jobId);
    const applied = await getRosterPreview(jobId);

    const again = await Promise.allSettled([applyRosterImportAs(admin, jobId)]);

    expect(rejections(again)).toEqual([t("T-3210")]);
    expect(await importedBy(jobId)).toEqual({ audits: 2, events: 2 });
    expect(await getRosterPreview(jobId)).toEqual(applied);
  });

  it("dos aplicaciones a la vez: una aplica y la otra se rechaza, sin repetir auditoría ni evento por fila", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA), row("Juan", JUAN)]);
    await warmUp(jobId);

    const results = await Promise.allSettled([
      applyRosterImportAs(admin, jobId),
      applyRosterImportAs(admin, jobId),
    ]);

    expect(await outcomeOf(jobId, results)).toEqual({
      rejected: [t("T-3210")],
      status: "APPLIED",
      audits: 2,
      events: 2,
    });
    expect(results.find((result) => result.status === "fulfilled")).toMatchObject({
      value: { created: 1, updated: 1, unchanged: 0, skipped: 0 },
    });
  });

  it("dos aplicaciones a la vez con solo personas nuevas: la que pierde recibe el error de dominio", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA), row("Juan", JUAN)]);
    await warmUp(jobId);

    const results = await Promise.allSettled([
      applyRosterImportAs(admin, jobId),
      applyRosterImportAs(admin, jobId),
    ]);

    expect(await outcomeOf(jobId, results)).toEqual({
      rejected: [t("T-3210")],
      status: "APPLIED",
      audits: 2,
      events: 2,
    });
    expect(results.find((result) => result.status === "fulfilled")).toMatchObject({
      value: { created: 2, updated: 0 },
    });
  });

  it("descartar una importación aplicada se rechaza y no cambia su estado", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    await applyRosterImportAs(admin, jobId);
    const applied = await getRosterPreview(jobId);

    const discarded = await Promise.allSettled([discardRosterImportAs(admin, jobId)]);

    expect(rejections(discarded)).toEqual([t("T-3210")]);
    expect(applied?.status).toBe("APPLIED");
    expect(await getRosterPreview(jobId)).toEqual(applied);
  });

  it("descartar una importación que se está aplicando espera y se rechaza: queda aplicada", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const held = await holdPerson(ANA);
    const applying = settled(applyRosterImportAs(admin, jobId));
    let discarding: Promise<PromiseSettledResult<void>> | undefined;
    try {
      // La aplicación ya va a medias: espera la fila de Ana detrás de quien la retiene.
      await expect.poll(async () => blockedBy(held.pid), { timeout: 10_000 }).toHaveLength(1);
      const [applyingPid = 0] = await blockedBy(held.pid);
      let over = false;
      discarding = settled(discardRosterImportAs(admin, jobId)).finally(() => {
        over = true;
      });
      // El descarte termina o se queda esperando detrás de la aplicación.
      await expect
        .poll(async () => over || (await blockedBy(applyingPid)).length > 0, { timeout: 10_000 })
        .toBe(true);
    } finally {
      await held.release();
    }

    expect(await outcomeOf(jobId, [await applying, await discarding])).toEqual({
      rejected: [t("T-3210")],
      status: "APPLIED",
      audits: 1,
      events: 1,
    });
  });

  it("descartar y aplicar a la vez: vale una sola y el estado es el de la que valió", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    await warmUp(jobId);

    const [applying, discarding] = await Promise.allSettled([
      applyRosterImportAs(admin, jobId),
      discardRosterImportAs(admin, jobId),
    ]);

    // Cualquiera de las dos puede llegar primero; lo que no puede pasar es que valgan las dos.
    const applied = applying.status === "fulfilled";
    expect(await outcomeOf(jobId, [applying, discarding])).toEqual({
      rejected: [t("T-3210")],
      status: applied ? "APPLIED" : "DISCARDED",
      audits: applied ? 1 : 0,
      events: applied ? 1 : 0,
    });
  });

  it("una descartada no se aplica ni se vuelve a descartar", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    await discardRosterImportAs(admin, jobId);

    const results = await Promise.allSettled([
      applyRosterImportAs(admin, jobId),
      discardRosterImportAs(admin, jobId),
    ]);

    expect(await outcomeOf(jobId, results)).toEqual({
      rejected: [t("T-3210"), t("T-3210")],
      status: "DISCARDED",
      audits: 0,
      events: 0,
    });
  });

  it("a una importación ya aplicada no se le cambian las columnas", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    await applyRosterImportAs(admin, jobId);
    const applied = await getRosterPreview(jobId);

    const remapped = await Promise.allSettled([remapRosterPreviewAs(admin, jobId, SWAPPED)]);

    expect(rejections(remapped)).toEqual([t("T-3210")]);
    expect(await getRosterPreview(jobId)).toEqual(applied);
  });

  it("cambiar las columnas de una importación que se está aplicando espera y se rechaza: lo aplicado conserva su resumen", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const reviewed = await getRosterPreview(jobId);
    const held = await holdPerson(ANA);
    const applying = settled(applyRosterImportAs(admin, jobId));
    let remapping: Promise<PromiseSettledResult<void>> | undefined;
    try {
      // La aplicación ya va a medias: espera la fila de Ana detrás de quien la retiene.
      await expect.poll(async () => blockedBy(held.pid), { timeout: 10_000 }).toHaveLength(1);
      const [applyingPid = 0] = await blockedBy(held.pid);
      let over = false;
      remapping = settled(remapRosterPreviewAs(admin, jobId, SWAPPED)).finally(() => {
        over = true;
      });
      // El cambio de columnas termina o se queda esperando detrás de la aplicación.
      await expect
        .poll(async () => over || (await blockedBy(applyingPid)).length > 0, { timeout: 10_000 })
        .toBe(true);
    } finally {
      await held.release();
    }

    const applied = await applying;
    expect(rejections([applied, await remapping])).toEqual([t("T-3210")]);
    const after = await getRosterPreview(jobId);
    expect(after).toMatchObject({ status: "APPLIED", mapping: reviewed?.mapping });
    expect(after?.summary).toEqual({
      ...(applied.status === "fulfilled" ? applied.value : {}),
      leaders: { granted: [], failed: [] },
    });
  });

  it("aplica con las columnas del trabajo que toma: un cambio que confirma justo antes es el que vale", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const held = await holdJob(jobId);
    let remapping: Promise<PromiseSettledResult<void>> | undefined;
    let applying: Promise<PromiseSettledResult<unknown>> | undefined;
    try {
      // El cambio de columnas llega primero y hace fila detrás de quien retiene el trabajo.
      remapping = settled(remapRosterPreviewAs(admin, jobId, SWAPPED));
      await expect.poll(async () => blockedBy(held.pid), { timeout: 10_000 }).toHaveLength(1);
      const [remappingPid = 0] = await blockedBy(held.pid);
      // La aplicación lee el trabajo, todavía con las columnas de antes, y queda detrás del cambio.
      applying = settled(applyRosterImportAs(admin, jobId));
      await expect.poll(async () => blockedBy(remappingPid), { timeout: 10_000 }).toHaveLength(1);
    } finally {
      await held.release();
    }

    expect(rejections([await remapping, await applying])).toEqual([]);
    const applied = await getRosterPreview(jobId);
    expect(applied).toMatchObject({ status: "APPLIED", mapping: SWAPPED });
    // Las columnas cruzadas dicen que el nombre viene de APELLIDO: eso es lo que quedó en la persona.
    const [ana] = await db()
      .select({ firstName: person.firstName, lastName: person.lastName })
      .from(person)
      .where(eq(person.email, ANA));
    expect(ana).toEqual({ firstName: "Sintética", lastName: "Ana" });
  });

  it("una importación que no existe ni se aplica ni se descarta", async () => {
    const { admin } = await previewOf([row("Ana", ANA)]);

    const results = await Promise.allSettled([
      applyRosterImportAs(admin, "no-existe"),
      discardRosterImportAs(admin, "no-existe"),
    ]);

    expect(rejections(results)).toEqual([t("T-032"), t("T-032")]);
  });
});

describe("los permisos de líder se registran sobre la importación ya aplicada", () => {
  beforeEach(truncateAll);

  it("quedan en el resumen de la importación aplicada, que conserva lo demás", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA), row("Juan", JUAN)]);
    const applied = await applyRosterImportAs(admin, jobId);

    await recordLeaderGrantsAs(admin, jobId, GRANTS);

    const after = await getRosterPreview(jobId);
    expect(after?.status).toBe("APPLIED");
    expect(after?.summary).toEqual({ ...applied, leaders: GRANTS });
  });

  it("registrarlos mientras la importación se está aplicando espera a que cierre y conserva el resumen de lo aplicado", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const held = await holdPerson(ANA);
    const applying = settled(applyRosterImportAs(admin, jobId));
    let recording: Promise<PromiseSettledResult<void>> | undefined;
    try {
      // La aplicación ya va a medias: espera la fila de Ana detrás de quien la retiene.
      await expect.poll(async () => blockedBy(held.pid), { timeout: 10_000 }).toHaveLength(1);
      const [applyingPid = 0] = await blockedBy(held.pid);
      let over = false;
      recording = settled(recordLeaderGrantsAs(admin, jobId, GRANTS)).finally(() => {
        over = true;
      });
      // El registro termina o se queda esperando detrás de la aplicación.
      await expect
        .poll(async () => over || (await blockedBy(applyingPid)).length > 0, { timeout: 10_000 })
        .toBe(true);
    } finally {
      await held.release();
    }

    const applied = await applying;
    expect(rejections([applied, await recording])).toEqual([]);
    const after = await getRosterPreview(jobId);
    expect(after?.status).toBe("APPLIED");
    // El resumen es el que dejó la aplicación más los permisos, no el de la vista previa que había
    // cuando el registro llegó.
    expect(after?.summary).toEqual({
      ...(applied.status === "fulfilled" ? applied.value : {}),
      leaders: GRANTS,
    });
  });

  it("no se registran en una importación que sigue en revisión: su resumen no cambia", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const reviewed = await getRosterPreview(jobId);

    const recorded = await Promise.allSettled([recordLeaderGrantsAs(admin, jobId, GRANTS)]);

    expect(rejections(recorded)).toEqual([t("T-3212")]);
    expect(await getRosterPreview(jobId)).toEqual(reviewed);
    expect(await rewritesOf(jobId)).toBe(0);
  });

  it("no se registran en una importación descartada", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    await discardRosterImportAs(admin, jobId);
    const discarded = await getRosterPreview(jobId);

    const recorded = await Promise.allSettled([recordLeaderGrantsAs(admin, jobId, GRANTS)]);

    expect(rejections(recorded)).toEqual([t("T-3212")]);
    expect(await getRosterPreview(jobId)).toEqual(discarded);
    // La única escritura del trabajo es la del descarte.
    expect(await rewritesOf(jobId)).toBe(1);
  });

  it("no se registran en una importación fallida", async () => {
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    // Ningún comando deja hoy un trabajo en `FAILED`: el estado se pone a mano.
    await db().update(importJob).set({ status: "FAILED" }).where(eq(importJob.id, jobId));
    const failed = await getRosterPreview(jobId);

    const recorded = await Promise.allSettled([recordLeaderGrantsAs(admin, jobId, GRANTS)]);

    expect(rejections(recorded)).toEqual([t("T-3212")]);
    expect(failed?.status).toBe("FAILED");
    expect(await getRosterPreview(jobId)).toEqual(failed);
    expect(await rewritesOf(jobId)).toBe(0);
  });

  it("no se registran en una importación que no existe", async () => {
    const { admin } = await previewOf([row("Ana", ANA)]);

    const recorded = await Promise.allSettled([recordLeaderGrantsAs(admin, "no-existe", GRANTS)]);

    expect(rejections(recorded)).toEqual([t("T-032")]);
    expect(await rewritesOf("no-existe")).toBe(0);
  });

  it("ocho registros a la vez: queda el de uno de los ocho, entero, y lo demás del resumen no cambia", async () => {
    await seedMember(ANA);
    const { admin, jobId } = await previewOf([row("Ana", ANA)]);
    const applied = await applyRosterImportAs(admin, jobId);
    await warmUp(jobId);
    const each = Array.from({ length: 8 }, (_, index) => ({
      granted: [`Persona ${index} · A3`],
      failed: [`Persona ${index} · A3: motivo de prueba`],
    }));

    const results = await Promise.allSettled(
      each.map((result) => recordLeaderGrantsAs(admin, jobId, result)),
    );

    expect(rejections(results)).toEqual([]);
    const after = await getRosterPreview(jobId);
    expect(after?.status).toBe("APPLIED");
    expect(each.map((result) => ({ ...applied, leaders: result }))).toContainEqual(after?.summary);
    // La aplicación y los ocho registros: cada escritura con su auditoría.
    expect(await rewritesOf(jobId)).toBe(9);
  });
});
