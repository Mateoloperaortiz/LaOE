import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { task } from "@/modules/crm/schema";
import { changeMembershipStatusAs } from "@/modules/people";
import { listExpiredLeaves } from "@/modules/people/domain/membership";
import { membership, membershipEvent } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { leaveUntilSoon, seedMember } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

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

  // ADR-118 regla 10 (DT-204). La prórroga no existe: si debe existir es la decisión abierta 35.
  it("pedir licencia a quien ya está en licencia responde un error y no mueve su regreso (decisión abierta 35)", async () => {
    const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
    const personId = await seedMember("sigue@eafit.edu.co");
    const regreso = leaveUntilSoon(30);
    await changeMembershipStatusAs(gh, personId, {
      to: "ON_LEAVE",
      reason: "Intercambio",
      leaveUntil: regreso,
    });

    await expect(
      changeMembershipStatusAs(gh, personId, {
        to: "ON_LEAVE",
        reason: "Sigue un mes más",
        leaveUntil: leaveUntilSoon(60),
      }),
    ).rejects.toThrow(new DomainError(t("T-3245"), "to"));

    const [fila] = await getDb()
      .select({ status: membership.status, leaveUntil: membership.leaveUntil })
      .from(membership)
      .where(eq(membership.personId, personId));
    expect(fila).toEqual({ status: "ON_LEAVE", leaveUntil: regreso });
    const eventos = await getDb()
      .select({ toStatus: membershipEvent.toStatus })
      .from(membershipEvent)
      .where(eq(membershipEvent.membershipId, (await membershipId(personId)) ?? ""));
    expect(eventos).toEqual([{ toStatus: "ON_LEAVE" }]);
  });

  it("pedir el estado que la persona ya tiene responde un error en vez de «guardado»", async () => {
    const gh = { personId: await seedMember("gh@eafit.edu.co"), ip: null };
    const personId = await seedMember("activa@eafit.edu.co");
    await expect(
      changeMembershipStatusAs(gh, personId, { to: "ACTIVE", reason: "Sin cambio" }),
    ).rejects.toThrow(new DomainError(t("T-3245"), "to"));
  });
});

async function membershipId(personId: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ id: membership.id })
    .from(membership)
    .where(eq(membership.personId, personId));
  return row?.id;
}
