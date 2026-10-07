import { and, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { personImported } from "@/domain-events/people";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  discardRosterImportAs,
  getRosterPreview,
} from "@/modules/people";
import { person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";
import { currentTermCode, seedCommittee, seedMember, seedTerm } from "./factories";

// Una importación del roster sale de la vista previa una sola vez (ADR-113 regla 7), por la interfaz
// pública de `people`.

const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";
const ANA = "prueba.ana@eafit.edu.co";
const JUAN = "prueba.juan@eafit.edu.co";

const db = () => getDb();

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

/**
 * Otra transacción retiene la fila de una persona: la aplicación que llegue a esa fila se queda ahí,
 * a medias y con el trabajo ya tomado, hasta que se suelte.
 */
async function holdPerson(email: string): Promise<{ pid: number; release: () => Promise<void> }> {
  let ready: (pid: number) => void = () => {};
  let release: () => void = () => {};
  const taken = new Promise<number>((resolve) => {
    ready = resolve;
  });
  const freed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const done = db().transaction(async (tx) => {
    await tx.select({ id: person.id }).from(person).where(eq(person.email, email)).for("update");
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

/** Evidencia de PostgreSQL de quién espera detrás de una transacción: se espera un hecho, no un tiempo. */
async function blockedBy(pid: number): Promise<number[]> {
  const result = await db().execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows.map((found) => found.pid);
}

describe("una importación del roster se aplica o se descarta una sola vez", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

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

  it("una importación que no existe ni se aplica ni se descarta", async () => {
    const { admin } = await previewOf([row("Ana", ANA)]);

    const results = await Promise.allSettled([
      applyRosterImportAs(admin, "no-existe"),
      discardRosterImportAs(admin, "no-existe"),
    ]);

    expect(rejections(results)).toEqual([t("T-032"), t("T-032")]);
  });
});
