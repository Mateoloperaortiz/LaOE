import { type Actor, runCommand } from "@/db/tx";
import { addNote, editNote } from "./interactions";
import { completeTask, createTask, type TaskInput } from "./tasks";

// Comandos con su propia transacción para las acciones de página (src/app no importa src/db).

export function addNoteAs(actor: Actor, personId: string, body: string): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addNote(ctx, personId, body));
}

export function editNoteAs(actor: Actor, id: string, body: string): Promise<void> {
  return runCommand(actor, (ctx) => editNote(ctx, id, body));
}

export function createTaskAs(actor: Actor, input: TaskInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createTask(ctx, input));
}

export function completeTaskAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => completeTask(ctx, id));
}
