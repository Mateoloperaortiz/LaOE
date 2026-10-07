import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { task } from "@/modules/crm/schema";
import { listExpiredLeaves } from "@/modules/people/domain/membership";
import { membership } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Licencia vencida sin regreso (Est. art. 11.3; ADR-060 regla 10): el programado abre una tarea a GH
// por persona, una sola vez mientras siga abierta.

describe("licencias vencidas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("abre una tarea a GH por licencia vencida y no la repite mientras siga abierta", async () => {
    const vencida = await seedMember("vencida@eafit.edu.co", {
      firstName: "Vera",
      lastName: "Vencida",
    });
    const vigente = await seedMember("vigente@eafit.edu.co");
    await getDb()
      .update(membership)
      .set({ status: "ON_LEAVE", leaveUntil: "2026-01-31" })
      .where(eq(membership.personId, vencida));
    await getDb()
      .update(membership)
      .set({ status: "ON_LEAVE", leaveUntil: "2099-01-31" })
      .where(eq(membership.personId, vigente));

    expect((await listExpiredLeaves("2026-09-13")).map((row) => row.personId)).toEqual([vencida]);

    await enqueueEvent(getDb(), { type: "membership.leave-check", payload: {} });
    await drainOutbox();
    const abiertas = () =>
      getDb()
        .select()
        .from(task)
        .where(and(eq(task.kind, "LEAVE_EXPIRED"), eq(task.status, "OPEN")));
    const [tarea] = await abiertas();
    expect(tarea).toMatchObject({
      personId: vencida,
      assigneeId: null,
      title: t("T-2277", { nombre: "Vera Vencida", fecha: "31 de enero de 2026" }),
    });

    await enqueueEvent(getDb(), { type: "membership.leave-check", payload: {} });
    await drainOutbox();
    expect(await abiertas()).toHaveLength(1);
  });
});
