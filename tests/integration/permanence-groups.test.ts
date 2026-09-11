import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  addMembersAs,
  applyMemberImportAs,
  createGroupAs,
  getGroupDetail,
  listGroups,
  listMyGroupRoles,
  previewMemberImport,
  removeMemberAs,
  seedWorkCommitteesAs,
  setEvaluatorsAs,
} from "@/modules/permanence";
import { outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedAppointment, seedMember, seedMembership, seedPerson, seedTerm } from "./factories";

// Grupos de trabajo (ADR-036 regla 6): siembra idempotente con líderes por cargo, altas solo de
// activos, roles derivados, importación por CSV y recompute por persona.

const admin = { personId: null, ip: null };

async function pendingRecomputes(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(outbox)
    .where(and(eq(outbox.eventType, "permanence.recompute"), isNull(outbox.processedAt)));
  return row?.n ?? 0;
}

describe("grupos de trabajo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("siembra los siete comités de trabajo con el líder de su cargo y no los repite", async () => {
    const termId = await seedTerm();
    const president = await seedMember("presi@eafit.edu.co");
    const vpGh = await seedMember("vpgh@eafit.edu.co");
    await seedAppointment(president, termId, "PRESIDENT");
    await seedAppointment(vpGh, termId, "VP_GH");
    expect(await seedWorkCommitteesAs(admin, termId)).toBe(7);
    expect(await seedWorkCommitteesAs(admin, termId)).toBe(0);
    const { rows, total } = await listGroups({
      q: "",
      termId,
      kind: "WORK_COMMITTEE",
      page: 1,
      pageSize: 20,
    });
    expect(total).toBe(7);
    expect(rows.find((row) => row.code === "CAP")?.leaderPersonId).toBe(president);
    expect(rows.find((row) => row.code === "CGH")?.leaderPersonId).toBe(vpGh);
    expect(rows.find((row) => row.code === "ATHLETIC")?.leaderPersonId).toBeNull();
    const roles = await listMyGroupRoles(president, termId);
    expect(roles.leads.map((group) => group.code)).toEqual(["CAP"]);
    expect(roles.evaluates).toEqual([]);
  });

  it("agrega solo miembros activos, no repite, quita con leftAt y encola el recompute de la persona", async () => {
    const termId = await seedTerm();
    const active = await seedMember("a@eafit.edu.co");
    const onLeave = await seedPerson("l@eafit.edu.co");
    await seedMembership(onLeave, termId, "ON_LEAVE");
    const evaluator = await seedMember("e@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP", name: "GAP Días EAFIT" });
    await expect(
      createGroupAs(admin, { termId, kind: "WORK_COMMITTEE", name: "CAP", code: "CAP" }).then(() =>
        createGroupAs(admin, { termId, kind: "WORK_COMMITTEE", name: "Otro", code: "CAP" }),
      ),
    ).rejects.toThrow(t("T-758"));
    expect(await addMembersAs(admin, id, [active])).toBe(1);
    expect(await addMembersAs(admin, id, [active])).toBe(0);
    await expect(addMembersAs(admin, id, [onLeave])).rejects.toThrow(
      t("T-752", { nombre: "Persona Sintética" }),
    );
    await setEvaluatorsAs(admin, id, [evaluator]);
    const detail = await getGroupDetail(id);
    expect(detail?.members.map((member) => member.personId)).toEqual([active]);
    expect(detail?.evaluators.map((item) => item.personId)).toEqual([evaluator]);
    expect((await listMyGroupRoles(evaluator, termId)).evaluates.map((g) => g.id)).toEqual([id]);
    expect(await pendingRecomputes()).toBe(1);
    expect(await removeMemberAs(admin, id, active)).toBe(true);
    expect(await removeMemberAs(admin, id, active)).toBe(false);
    expect((await getGroupDetail(id))?.members[0]?.leftAt).toBeInstanceOf(Date);
  });

  it("importa desde un CSV de correos: agrega activos, reporta repetidos, inactivos y desconocidos", async () => {
    const termId = await seedTerm();
    const one = await seedMember("uno@eafit.edu.co");
    await seedMember("dos@eafit.edu.co");
    const inactive = await seedPerson("baja@eafit.edu.co");
    await seedMembership(inactive, termId, "INACTIVE");
    const { id } = await createGroupAs(admin, {
      termId,
      kind: "GT_MACROEVENT",
      name: "GT Inventiva",
    });
    await addMembersAs(admin, id, [one]);
    const csv =
      "CORREO\nuno@eafit.edu.co\nDos@eafit.edu.co\nbaja@eafit.edu.co\nnadie@eafit.edu.co\n";
    const preview = await previewMemberImport(id, csv);
    expect(preview).toMatchObject({ add: 1, already: 1, inactive: 1, unknown: 1 });
    expect(preview.rows.map((row) => row.outcome)).toEqual([
      "ALREADY",
      "ADD",
      "INACTIVE",
      "UNKNOWN",
    ]);
    const result = await applyMemberImportAs(admin, id, csv);
    expect(result.added).toBe(1);
    expect((await getGroupDetail(id))?.members).toHaveLength(2);
    await expect(previewMemberImport(id, "NOMBRE\nAna")).rejects.toThrow(t("T-755"));
  });
});
