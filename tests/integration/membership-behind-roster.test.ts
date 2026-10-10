import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  applyRosterImportAs,
  changeMembershipStatusAs,
  createRosterPreviewAs,
  reactivateMembershipAs,
} from "@/modules/people";
import { membership, person } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { holdTransaction, outcome, waitingForLock, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

// ADR-120 regla 3, los otros dos caminos del ciclo de membresía: cambiar el estado y reactivar hacen
// cola detrás de una importación del roster que ya pasó por la persona, igual que anonimizar y dar de
// baja (`roster-anonymize-locks.test.ts`). Deciden con lo que la importación confirmó, y ninguno
// responde con un error sin traducir.

const SALE = "prueba.sale@eafit.edu.co";
const SIGUE = "prueba.sigue@eafit.edu.co";

async function estadoDe(personId: string) {
  const [row] = await getDb()
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  return row?.status;
}

/** El roster ya dio de baja a la persona y espera la fila siguiente; el comando llega detrás. */
async function detrasDeLaImportacion(
  command: (admin: { personId: string }, personId: string) => Promise<unknown>,
) {
  const termId = await seedTerm();
  const admin = { personId: await seedMember("admin.roster@eafit.edu.co") };
  const sale = await seedMember(SALE);
  const sigue = await seedMember(SIGUE);
  const bytes = new TextEncoder().encode(
    `${["CORREO;ESTADO", `${SALE};Retirado`, `${SIGUE};Activo`].join("\r\n")}\r\n`,
  );
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "estados.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  // La importación es una sola transacción: da de baja a la primera persona y se queda esperando la
  // fila de la segunda, que alguien retiene, con el candado del ciclo de la primera todavía tomado.
  const held = await holdTransaction((tx) =>
    tx.select({ id: person.id }).from(person).where(eq(person.id, sigue)).for("update"),
  );
  let results: PromiseSettledResult<unknown>[];
  try {
    const importing = applyRosterImportAs(admin, jobId);
    await vi.waitFor(async () => expect(await waitingOn(held.pid)).toBe(1), { timeout: 5_000 });
    const acting = command(admin, sale);
    await vi.waitFor(async () => expect(await waitingForLock()).toBe(2), { timeout: 5_000 });
    held.release();
    results = await Promise.allSettled([importing, acting]);
  } finally {
    held.release();
    await held.done;
  }
  return { results, sale };
}

describe("cambiar el estado o reactivar a quien el roster acaba de dar de baja", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("el cambio de estado que llega detrás responde, con un error de dominio, que esa persona ya está de baja", async () => {
    const { results, sale } = await detrasDeLaImportacion((admin, personId) =>
      changeMembershipStatusAs(admin, personId, { to: "HONORARY", reason: "Pasa a honoraria" }),
    );

    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    const [, rejected] = results as [unknown, PromiseRejectedResult];
    expect(rejected.reason).toBeInstanceOf(DomainError);
    expect((rejected.reason as Error).message).toBe(t("T-3258"));
    expect(await estadoDe(sale)).toBe("INACTIVE");
  });

  it("la reactivación que llega detrás la deja activa, sin error", async () => {
    const { results, sale } = await detrasDeLaImportacion((admin, personId) =>
      reactivateMembershipAs(admin, personId, { reason: "Vuelve" }),
    );

    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    expect(await estadoDe(sale)).toBe("ACTIVE");
  });
});
