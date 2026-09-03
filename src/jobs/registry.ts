import type pino from "pino";

// Registro de handlers del outbox. Cada módulo registra los suyos en su jobs.ts.

export interface JobContext {
  id: string;
  attempt: number;
  log: pino.Logger;
}

export type JobHandler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(eventType: string, handler: JobHandler): void {
  if (handlers.has(eventType)) {
    throw new Error(`Handler repetido para ${eventType}`);
  }
  handlers.set(eventType, handler);
}

export function getHandler(eventType: string): JobHandler | undefined {
  return handlers.get(eventType);
}

/** Solo para pruebas. */
export function resetHandlersForTests(): void {
  handlers.clear();
}
