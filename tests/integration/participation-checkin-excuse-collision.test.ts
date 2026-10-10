import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  balanceFor,
  findCheckIn,
  listCheckIns,
  loadGamificationSettings,
} from "@/modules/participation";
import { hostCheckIn } from "@/modules/participation/domain/check-ins";
import { t } from "@/shared/copy";
import { holdCommand, outcome, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedMember, seedOccasion, seedTerm } from "./factories";

// ADR-119 regla 2 (DT-162): la excusa que crea la asistencia y choca con un registro que confirma en
// ese instante responde lo de siempre (T-2223), no el error del índice único.

const POINTS = 10;

describe("la excusa que crea la asistencia a la vez que un registro", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("aceptar la excusa de quien el organizador está registrando espera y responde que ya tiene asistencia", async () => {
    const termId = await seedTerm();
    const admin = { personId: await seedMember("gh.uno.choque@eafit.edu.co"), ip: null };
    const other = { personId: await seedMember("gh.dos.choque@eafit.edu.co"), ip: null };
    const personId = await seedMember("miembro.choque@eafit.edu.co");
    const occasion = await seedOccasion(termId, { points: POINTS, approval: "MANUAL" });
    const request = await createRequestAs({ personId, ip: null }, "EXCUSE", {
      occasionId: occasion.id,
      cause: "WORK",
      reason: "Turno que no se puede mover",
    });
    const settings = await loadGamificationSettings();
    // El registro del organizador queda escrito y sin confirmar: la excusa no ve la asistencia,
    // intenta crearla y espera en el índice único.
    const held = await holdCommand(admin, (ctx) =>
      hostCheckIn(
        ctx,
        { occasionId: occasion.id, personId, personName: "Persona Sintética", source: "HOST" },
        { membership: { status: "ACTIVE", firstTermId: termId }, settings },
      ),
    );
    const deciding = decideRequestAs(other, request.id, { decision: "APPROVED" });
    void deciding.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
    } finally {
      held.release();
      await held.done;
    }

    const [result] = await Promise.allSettled([deciding]);
    expect(result && outcome(result)).toBe(t("T-2223"));
    expect(await listCheckIns(occasion.id)).toEqual([
      expect.objectContaining({ personId, status: "APPROVED", source: "HOST" }),
    ]);
    expect((await findCheckIn(occasion.id, personId))?.reason).toBeNull();
    expect(await balanceFor(personId, termId)).toBe(POINTS);
  });
});
