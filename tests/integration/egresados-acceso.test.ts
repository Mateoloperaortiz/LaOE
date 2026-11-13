import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { grantPermissionAs } from "@/modules/identity";
import { consumeAccessGrant, issueAccessGrantAs } from "@/modules/identity/domain/access-grant";
import { findPasswordHash } from "@/modules/identity/domain/password";
import { createSession, resolveActor } from "@/modules/identity/domain/session";
import { session } from "@/modules/identity/schema";
import { endMembershipAs, findEligibleMemberByEmail } from "@/modules/people";
import { t } from "@/shared/copy";
import { seedCredential, seedMembership, seedPerson, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Egresados con acceso (ADR-184): quien salió por grado vuelve a entrar con el enlace de la junta, como
// egresado y sin permisos; las demás salidas no. La baja depura lo de antes, no lo que vino después.

const CLAVE = "trapecio verde 41";

beforeEach(truncateAll);
afterAll(() => closeDb());

async function seedActive(email: string): Promise<string> {
  const termId = await seedTerm("2026-2", { startsOn: "2026-07-13", endsOn: "2026-12-05" });
  const personId = await seedPerson(email, { firstName: "Camila" });
  await seedMembership(personId, termId, "ACTIVE");
  return personId;
}

async function seedBoard(): Promise<string> {
  const id = await seedActive("junta.egresados@eafit.edu.co");
  await grantPermissionAs(SYSTEM_ACTOR, { email: "junta.egresados@eafit.edu.co", code: "BOARD" });
  return id;
}

function leave(board: string, personId: string, endReason: "GRADUATION" | "RESIGNATION") {
  return endMembershipAs({ personId: board, ip: null }, personId, {
    endReason,
    memorialConsent: true,
    contactConsent: false,
  });
}

describe("egresados con acceso", () => {
  it("quien egresó recibe su enlace, entra como egresado y sin permisos", async () => {
    const board = await seedBoard();
    const egresada = await seedActive("egresada@eafit.edu.co");
    await grantPermissionAs(SYSTEM_ACTOR, { email: "egresada@eafit.edu.co", code: "BOARD" });
    await leave(board, egresada, "GRADUATION");
    await drainOutbox();

    expect((await findEligibleMemberByEmail("egresada@eafit.edu.co"))?.access).toBe("ALUMNI");
    const { token } = await issueAccessGrantAs(
      { personId: board, ip: null },
      { personId: egresada, kind: "ACTIVATION" },
    );
    const result = await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const actor = await resolveActor(result.token);
    expect(actor).toMatchObject({
      personId: egresada,
      access: "ALUMNI",
      membershipStatus: "INACTIVE",
    });
    expect(actor?.permissions).toEqual([]);
    expect(actor?.isAdmin).toBe(false);
  });

  it("quien renunció no recibe enlace ni entra", async () => {
    const board = await seedBoard();
    const salio = await seedActive("renuncia@eafit.edu.co");
    await leave(board, salio, "RESIGNATION");

    expect(await findEligibleMemberByEmail("renuncia@eafit.edu.co")).toBeNull();
    await expect(
      issueAccessGrantAs({ personId: board, ip: null }, { personId: salio, kind: "ACTIVATION" }),
    ).rejects.toThrow(t("T-2127"));
  });

  it("la baja retira la contraseña y las sesiones de antes, no las del enlace nuevo", async () => {
    const board = await seedBoard();
    const egresada = await seedActive("tarde@eafit.edu.co");
    await seedCredential(egresada, "la clave de miembro");
    const vieja = await getDb().transaction((tx) =>
      createSession(tx, { personId: egresada, remember: true, userAgent: null, ip: null }),
    );
    await leave(board, egresada, "GRADUATION");
    // La sesión de miembro dejó de valer en la misma transacción de la baja (ADR-034).
    expect(await resolveActor(vieja.token)).toBeNull();

    // La junta le emite el enlace antes de que el outbox corra los efectos de la baja.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { token } = await issueAccessGrantAs(
      { personId: board, ip: null },
      { personId: egresada, kind: "RECOVERY" },
    );
    const nueva = await consumeAccessGrant({ token, password: CLAVE, ip: null, userAgent: null });
    if (!nueva.ok) throw new Error("el enlace del egresado no se consumió");
    await drainOutbox();

    expect(await findPasswordHash(egresada)).not.toBeNull();
    expect(await resolveActor(nueva.token)).toMatchObject({ access: "ALUMNI" });
    const sesiones = await getDb()
      .select({ id: session.id })
      .from(session)
      .where(eq(session.personId, egresada));
    expect(sesiones).toEqual([{ id: nueva.sessionId }]);
  });
});
