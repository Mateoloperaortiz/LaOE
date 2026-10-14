import type pino from "pino";
import type { DomainEventDefinition, EventPayload } from "@/domain-events/define";

// Registro de handlers del outbox. Cada módulo registra los suyos en su jobs.ts. Un evento puede
// tener varios handlers (uno por módulo interesado, ADR-034): el poller los corre en orden y, si uno
// falla, el evento entero se reintenta, así que cada uno es idempotente por su cuenta.

export interface JobContext {
  id: string;
  attempt: number;
  log: pino.Logger;
  /**
   * El instante de esta entrega según el reloj del poller, leído cuando arranca el handler (ADR-118
   * regla 2). El handler que decide por la hora usa este y no `new Date()`: así una prueba lo adelanta
   * con `drainOutbox({ now })` sin esperar.
   */
  now: Date;
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

/**
 * Handler de un evento del catálogo (ADR-084): recibe el payload ya validado contra su contrato. Un payload
 * que no lo cumple hace fallar el intento, igual que antes lo hacía el `parse` escrito en cada handler.
 */
export function onEvent<Definition extends DomainEventDefinition>(
  definition: Definition,
  handler: (payload: EventPayload<Definition>, ctx: JobContext) => Promise<void>,
): void {
  registerHandler(definition.type, (raw, ctx) =>
    // `parse` devuelve la salida del esquema: TypeScript no la relaciona con el genérico, pero lo es.
    handler(definition.schema.parse(raw) as EventPayload<Definition>, ctx),
  );
}

/** El mismo handler para varios eventos: recibe la unión de sus payloads y el tipo que lo disparó. */
export function onEvents<const Definitions extends readonly DomainEventDefinition[]>(
  definitions: Definitions,
  handler: (
    payload: EventPayload<Definitions[number]>,
    ctx: JobContext,
    type: Definitions[number]["type"],
  ) => Promise<void>,
): void {
  for (const definition of definitions) {
    registerHandler(definition.type, (raw, ctx) =>
      handler(
        definition.schema.parse(raw) as EventPayload<Definitions[number]>,
        ctx,
        definition.type,
      ),
    );
  }
}

export function getHandlers(eventType: string): JobHandler[] {
  return handlers.get(eventType) ?? [];
}

/** Solo para pruebas. */
export function resetHandlersForTests(): void {
  handlers.clear();
}
