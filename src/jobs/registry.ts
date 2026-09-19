import type pino from "pino";

// Registro de handlers del outbox. Cada módulo registra los suyos en su jobs.ts. Un evento puede
// tener varios handlers (uno por módulo interesado, ADR-034): el poller los corre en orden y, si uno
// falla, el evento entero se reintenta, así que cada uno es idempotente por su cuenta.

export interface JobContext {
  id: string;
  attempt: number;
  log: pino.Logger;
}

export type JobHandler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<void>;

const handlers = new Map<string, JobHandler[]>();

export function registerHandler(eventType: string, handler: JobHandler): void {
  const list = handlers.get(eventType) ?? [];
  if (list.includes(handler)) {
    throw new Error(`Handler repetido para ${eventType}`);
  }
  list.push(handler);
  handlers.set(eventType, list);
}

export function getHandlers(eventType: string): JobHandler[] {
  return handlers.get(eventType) ?? [];
}

/** Solo para pruebas. */
export function resetHandlersForTests(): void {
  handlers.clear();
}
