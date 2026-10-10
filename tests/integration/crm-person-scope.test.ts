import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { addNoteAs, completeTaskAs, createTaskAs, editNoteAs } from "@/modules/crm";
import { interaction, task } from "@/modules/crm/schema";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// DT-146 inciso (b), ADR-122 regla 1: la ficha de una persona edita sus notas y completa sus tareas.
// Los dos comandos reciben la persona de la ficha y la comprueban: la nota o la tarea de otra persona
// responde como una que no existe (T-032) y queda como estaba.

const BODY = "Nota sintética";

async function setup() {
  const authorId = await seedMember("gh.ficha@eafit.edu.co");
  const pageId = await seedMember("ficha.abierta@eafit.edu.co");
  const otherId = await seedMember("otra.ficha@eafit.edu.co");
  const author = { personId: authorId, ip: null };
  const note = await addNoteAs(author, otherId, BODY);
  const created = await createTaskAs(author, {
    title: "Tarea sintética",
    kind: "GENERAL",
    personId: otherId,
  });
  return { author, pageId, otherId, noteId: note.id, taskId: created.id };
}

async function noteOf(id: string) {
  const [row] = await getDb()
    .select({ body: interaction.body, editedAt: interaction.editedAt })
    .from(interaction)
    .where(eq(interaction.id, id));
  return row;
}

async function taskStatus(id: string): Promise<string | undefined> {
  const [row] = await getDb().select({ status: task.status }).from(task).where(eq(task.id, id));
  return row?.status;
}

async function audits(): Promise<number> {
  return (await getDb().select({ id: auditLog.id }).from(auditLog)).length;
}

describe("la nota y la tarea desde la ficha de su persona", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("desde la ficha de una persona, la nota de otra responde como si no existiera y no se edita", async () => {
    const f = await setup();
    const before = await audits();

    await expect(
      editNoteAs(f.author, f.noteId, "Cambiada desde otra ficha", { personId: f.pageId }),
    ).rejects.toThrow(t("T-032"));

    expect(await noteOf(f.noteId)).toEqual({ body: BODY, editedAt: null });
    expect(await audits()).toBe(before);
  });

  it("sin la persona de la ficha no se edita la nota", async () => {
    const f = await setup();

    for (const scope of [undefined, null, {}, { personId: "" }]) {
      await expect(
        editNoteAs(f.author, f.noteId, "Cambiada sin ficha", scope as never),
      ).rejects.toThrow(t("T-032"));
    }

    expect(await noteOf(f.noteId)).toEqual({ body: BODY, editedAt: null });
  });

  it("desde la ficha de su persona, la nota se edita", async () => {
    const f = await setup();

    await editNoteAs(f.author, f.noteId, "Corregida", { personId: f.otherId });

    expect((await noteOf(f.noteId))?.body).toBe("Corregida");
  });

  it("desde la ficha de una persona, la tarea de otra responde como si no existiera y sigue abierta", async () => {
    const f = await setup();
    const before = await audits();

    await expect(completeTaskAs(f.author, f.taskId, { personId: f.pageId })).rejects.toThrow(
      t("T-032"),
    );

    expect(await taskStatus(f.taskId)).toBe("OPEN");
    expect(await audits()).toBe(before);
  });

  it("sin la persona de la ficha no se completa la tarea", async () => {
    const f = await setup();

    for (const scope of [undefined, null, {}, { personId: "" }]) {
      await expect(completeTaskAs(f.author, f.taskId, scope as never)).rejects.toThrow(t("T-032"));
    }

    expect(await taskStatus(f.taskId)).toBe("OPEN");
  });

  it("desde la ficha de su persona, la tarea se completa", async () => {
    const f = await setup();

    await completeTaskAs(f.author, f.taskId, { personId: f.otherId });

    expect(await taskStatus(f.taskId)).toBe("DONE");
  });
});
