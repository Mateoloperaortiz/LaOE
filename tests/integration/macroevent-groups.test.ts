import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createGroup, getGroupDetail } from "@/modules/permanence/domain/groups";
import {
  configureMacroeventGroupAs,
  findMacroeventGroup,
  prepareMacroeventGroup,
} from "@/modules/permanence/domain/macroevents";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import { seedEdition, seedEvent, seedMember, seedTerm } from "../factories";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

async function setup() {
  const termId = await seedTerm();
  return { eventId: await seedEvent("inventiva", "Inventiva"), termId };
}

describe("equipo del macroevento por semestre", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("preparar dos veces, incluso en paralelo, conserva un solo equipo", async () => {
    const { eventId, termId } = await setup();
    await warmPool();
    const groups = await Promise.all(
      [1, 2].map(() =>
        runCommand(SYSTEM_ACTOR, (ctx) => prepareMacroeventGroup(ctx, eventId, termId)),
      ),
    );
    expect(groups[0]?.id).toBe(groups[1]?.id);
    expect(await findMacroeventGroup(eventId, termId)).toMatchObject({
      id: groups[0]?.id,
      eventId,
      kind: "GT_MACROEVENT",
    });
    expect(await getDb().select().from(workGroup)).toHaveLength(1);
    const otherTerm = await seedTerm("2025-2");
    const other = await runCommand(SYSTEM_ACTOR, (ctx) =>
      prepareMacroeventGroup(ctx, eventId, otherTerm),
    );
    expect(other.id).not.toBe(groups[0]?.id);
  });

  it("reutiliza el GT vinculado por edición y rechaza otro GT del mismo evento", async () => {
    const { eventId, termId } = await setup();
    const edition = { id: await seedEdition(eventId, "prueba", "Edición de prueba") };
    const group = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createGroup(ctx, {
        name: "GT existente",
        kind: "GT_MACROEVENT",
        termId,
        editionId: edition.id,
      }),
    );
    const again = await runCommand(SYSTEM_ACTOR, (ctx) =>
      prepareMacroeventGroup(ctx, eventId, termId),
    );
    expect(again.id).toBe(group.id);
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createGroup(ctx, { name: "Duplicado", kind: "GT_MACROEVENT", termId, eventId }),
      ),
    ).rejects.toThrow(t("T-2352"));
  });

  it("guarda responsables juntos y revierte si la edición pertenece a otro evento", async () => {
    const { eventId, termId } = await setup();
    const group = await runCommand(SYSTEM_ACTOR, (ctx) =>
      prepareMacroeventGroup(ctx, eventId, termId),
    );
    const leader = await seedMember("lider@example.com");
    const evaluator = await seedMember("evaluador@example.com");
    await configureMacroeventGroupAs(SYSTEM_ACTOR, group.id, {
      leaderPersonId: leader,
      evaluatorIds: [evaluator],
      editionId: undefined,
    });
    const other = { id: await seedEvent("enfemenino", "Otro") };
    const edition = { id: await seedEdition(other.id, "prueba", "Prueba") };
    await expect(
      configureMacroeventGroupAs(SYSTEM_ACTOR, group.id, {
        leaderPersonId: undefined,
        evaluatorIds: [],
        editionId: edition.id,
      }),
    ).rejects.toThrow(t("T-2353"));
    const detail = await getGroupDetail(group.id);
    expect(detail?.group.leaderPersonId).toBe(leader);
    expect(detail?.evaluators.map((row) => row.personId)).toEqual([evaluator]);
    await getDb().update(term).set({ permanenceClosedAt: new Date() }).where(eq(term.id, termId));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => prepareMacroeventGroup(ctx, eventId, termId)),
    ).rejects.toThrow();
  });
});
