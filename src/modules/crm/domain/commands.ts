import { type Actor, runCommand } from "@/db/tx";
import { addNote, addOrganizationNote, editNote } from "./interactions";
import { markOnboardingStep } from "./onboarding";
import {
  completeTask,
  createTask,
  openTaskForReason,
  type ReasonTaskInput,
  type TaskInput,
} from "./tasks";

// Comandos con su propia transacción para las acciones de página (src/app no importa src/db).

export function addNoteAs(actor: Actor, personId: string, body: string): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addNote(ctx, personId, body));
}

export function addOrganizationNoteAs(
  actor: Actor,
  organizationId: string,
  body: string,
): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => addOrganizationNote(ctx, organizationId, body));
}

export function editNoteAs(actor: Actor, id: string, body: string): Promise<void> {
  return runCommand(actor, (ctx) => editNote(ctx, id, body));
}

export function createTaskAs(actor: Actor, input: TaskInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createTask(ctx, input));
}

/** La tarea de un motivo en su propia transacción: así la abren los handlers, a nombre del sistema. */
export function openTaskForReasonAs(
  actor: Actor,
  input: ReasonTaskInput,
): Promise<{ id: string; created: boolean }> {
  return runCommand(actor, (ctx) => openTaskForReason(ctx, input));
}

export function markOnboardingStepAs(
  actor: Actor & { personId: string },
  termId: string,
  stepKey: string,
): Promise<boolean> {
  return runCommand(actor, (ctx) => markOnboardingStep(ctx, actor.personId, termId, stepKey));
}

export function completeTaskAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => completeTask(ctx, id));
}
