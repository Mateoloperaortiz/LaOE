import type { z } from "zod";

// Contratos de los eventos de dominio (ADR-084). Un evento es un nombre y el esquema de su payload. Viven
// en esta capa neutral, un archivo por módulo productor, y no en el `index.ts` del productor: quien
// escucha un evento casi nunca puede importar a quien lo emite (crm escucha a permanence, comms a crm,
// permanence a crm), y para eso existen los eventos. Aquí no entra nada de módulos ni de la base.

export interface DomainEventDefinition<
  Type extends string = string,
  Schema extends z.ZodType = z.ZodType,
> {
  readonly type: Type;
  readonly schema: Schema;
}

export function defineEvent<const Type extends string, Schema extends z.ZodType>(
  type: Type,
  schema: Schema,
): DomainEventDefinition<Type, Schema> {
  return { type, schema };
}

/** Lo que recibe un handler: el payload ya validado contra el contrato. */
export type EventPayload<Definition extends DomainEventDefinition> = z.output<Definition["schema"]>;

export interface EmittedEvent {
  type: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}

/**
 * El evento listo para `ctx.emit`. El payload se comprueba al compilar contra el contrato; al emitir no se
 * valida en tiempo de ejecución, así que tipar un evento no cambia lo que hace el productor.
 */
export function eventOf<Schema extends z.ZodType>(
  definition: DomainEventDefinition<string, Schema>,
  payload: z.input<Schema> & Record<string, unknown>,
  options: { dedupeKey?: string } = {},
): EmittedEvent {
  return {
    type: definition.type,
    payload,
    ...(options.dedupeKey === undefined ? {} : { dedupeKey: options.dedupeKey }),
  };
}
