import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  balanceFor,
  checkInSelfAs,
  grantBoosterAs,
  hostCheckInAs,
  listBoostersFor,
  listCheckIns,
  setBoosterTargetAs,
} from "@/modules/participation";
import { boosterItem } from "@/modules/participation/schema";
import { setConfigAs } from "@/modules/system";
import { t } from "@/shared/copy";
import { holdTransaction, outcome, waitingForLock, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedMember, seedOccasion, seedTerm } from "./factories";

// ADR-119 regla 3 (DT-163): crear una asistencia ocupa el lugar de «asistencias» en el orden de
// candados de ADR-116 regla 2. El premio de la persona (`reward:<persona>`) y su booster se toman
// después de insertar, también cuando el booster se elige en el mismo registro.

const POINTS = 10;
const BOOST = 5;
const NAME = "Persona Sintética";

describe("el registro propio con booster y el del organizador a la vez", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("no se interbloquean: entra uno y el otro recibe que ya estaba registrado", async () => {
    const termId = await seedTerm();
    const admin = { personId: await seedMember("gh.orden.candados@eafit.edu.co") };
    const personId = await seedMember("miembro.orden.candados@eafit.edu.co");
    await setConfigAs(admin, "gamification.enabled", true);
    const occasion = await seedOccasion(termId, { points: POINTS, approval: "AUTO" });
    const booster = await grantBoosterAs(admin, {
      personId,
      termId,
      kind: "PLUS_50",
      reason: "Premio de prueba",
    });
    // El booster ya apunta a la ocasión: el registro del organizador también va por el premio.
    await setBoosterTargetAs(
      { personId },
      { boosterId: booster.id, target: { occasionId: occasion.id } },
    );
    // Con el booster retenido, el registro propio se detiene justo al ir por él: la prueba decide
    // cuándo lo alcanza el del organizador.
    const held = await holdTransaction((tx) =>
      tx
        .select({ id: boosterItem.id })
        .from(boosterItem)
        .where(eq(boosterItem.id, booster.id))
        .for("update"),
    );
    const own = checkInSelfAs({ personId }, { publicId: occasion.publicId, boosterId: booster.id });
    void own.catch(() => undefined);
    let host: Promise<unknown> = Promise.resolve();
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      host = hostCheckInAs(admin, {
        occasionId: occasion.id,
        personId,
        personName: NAME,
        source: "HOST",
      });
      void host.catch(() => undefined);
      await expect.poll(() => waitingForLock()).toBe(2);
    } finally {
      held.release();
      await held.done;
    }

    const [mine, theirs] = await Promise.allSettled([own, host]);
    expect(mine && outcome(mine)).toBe("ok");
    expect(mine).toMatchObject({ value: { ok: true, status: "APPROVED" } });
    expect(theirs && outcome(theirs)).toBe(t("T-601", { nombre: NAME }));
    expect(await listCheckIns(occasion.id)).toEqual([
      expect.objectContaining({ personId, status: "APPROVED", source: "SELF_QR" }),
    ]);
    expect(await balanceFor(personId, termId)).toBe(POINTS + BOOST);
    expect(await listBoostersFor(personId)).toEqual([
      expect.objectContaining({ id: booster.id, state: "CONSUMED" }),
    ]);
  });
});
