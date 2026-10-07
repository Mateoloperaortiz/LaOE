import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { listCommitteeViability } from "@/modules/participation";
import { createCommittee } from "@/modules/people";
import { truncateAll } from "./db";
import { seedCommitteeMembership, seedMembership, seedPerson, seedTerm } from "./factories";

// Viabilidad del comité (ADR-060 regla 8): los días que le quedan a la prueba se cuentan desde el
// día civil de Colombia (ADR-020), que de 7 p. m. a medianoche va un día atrás del de UTC.

describe("viabilidad del comité", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("de 7 p. m. a medianoche de Colombia cuenta los días de la prueba desde el día de Colombia", async () => {
    const termId = await seedTerm("2026-2");
    // La prueba termina el 1 de octubre: a 31 días del 31 de agosto y a 30 del 1 de septiembre.
    const { id: committeeId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "sintetico",
        name: "Comité sintético",
        status: "ON_TRIAL",
        trialStartsOn: "2026-04-01",
        trialEndsOn: "2026-10-01",
      }),
    );
    const personId = await seedPerson("miembro-sintetico@eafit.edu.co");
    await seedMembership(personId, termId);
    await seedCommitteeMembership(personId, committeeId, termId);

    const alertsAt = async (now: Date) => {
      const rows = await listCommitteeViability(termId, now);
      const row = rows.find((item) => item.committeeId === committeeId);
      if (!row) throw new Error("el comité en prueba no salió en la viabilidad");
      return row.alerts;
    };

    // 31 de agosto a las 7:30 p. m. y a las 11:59 p. m. de Colombia: en UTC ya es 1 de septiembre.
    expect(await alertsAt(new Date("2026-09-01T00:30:00Z"))).not.toContain("TRIAL_ENDING");
    expect(await alertsAt(new Date("2026-09-01T04:59:00Z"))).not.toContain("TRIAL_ENDING");
    // 1 de septiembre a las 12:00 a. m. de Colombia: ahí sí quedan 30 días.
    expect(await alertsAt(new Date("2026-09-01T05:00:00Z"))).toContain("TRIAL_ENDING");
  });

  it("de 7 p. m. a medianoche de Colombia de la víspera el término todavía no pasó su mitad", async () => {
    // 2026-1 va del 1 de enero al 30 de junio: 180 días, y su mitad es el 1 de abril.
    const termId = await seedTerm("2026-1");
    const { id: committeeId } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "sintetico",
        name: "Comité sintético",
        status: "ON_TRIAL",
        trialStartsOn: "2026-04-01",
        trialEndsOn: "2026-10-01",
      }),
    );
    const personId = await seedPerson("miembro-sintetico@eafit.edu.co");
    await seedMembership(personId, termId);
    await seedCommitteeMembership(personId, committeeId, termId);

    const alertsAt = async (now: Date) => {
      const rows = await listCommitteeViability(termId, now);
      const row = rows.find((item) => item.committeeId === committeeId);
      if (!row) throw new Error("el comité no salió en la viabilidad");
      return row.alerts;
    };

    // 31 de marzo a las 7:30 p. m. y a las 11:59 p. m. de Colombia: en UTC ya es 1 de abril.
    expect(await alertsAt(new Date("2026-04-01T00:30:00Z"))).not.toContain("NO_EVENT");
    expect(await alertsAt(new Date("2026-04-01T04:59:00Z"))).not.toContain("NO_EVENT");
    // 1 de abril a las 12:00 a. m. de Colombia: pasó la mitad y el comité sigue sin evento propio.
    expect(await alertsAt(new Date("2026-04-01T05:00:00Z"))).toContain("NO_EVENT");
  });
});
