import pino from "pino";
import { expect } from "vitest";
import { logger } from "@/shared/log";

/** Una línea del registro tal como sale del proceso: el texto y su JSON. */
export interface LoggedLine {
  line: string;
  record: Record<string, unknown>;
}

interface LogDestination {
  write(line: string): void;
}

/**
 * Corre `run` y devuelve lo que el logger de la aplicación escribió mientras tanto: las líneas ya
 * serializadas y redactadas, que es lo que llega a los registros del despliegue. Le cambia el destino
 * al logger real por uno en memoria y se lo devuelve al terminar, sin tocar `src/shared/log.ts`.
 * Mientras captura deja pasar todos los niveles, para no depender del `LOG_LEVEL` del `.env`.
 */
export async function captureLogs<T>(
  run: () => Promise<T>,
): Promise<{ result: T; lines: LoggedLine[] }> {
  const target = logger as unknown as Record<symbol, LogDestination | undefined>;
  const original = target[pino.symbols.streamSym];
  if (!original) {
    throw new Error("captureLogs: el logger no tiene un destino que reemplazar");
  }
  const level = logger.level;
  const lines: LoggedLine[] = [];
  target[pino.symbols.streamSym] = {
    write(line) {
      lines.push({ line, record: JSON.parse(line) as Record<string, unknown> });
    },
  };
  logger.level = "debug";
  try {
    const result = await run();
    return { result, lines };
  } finally {
    logger.level = level;
    target[pino.symbols.streamSym] = original;
  }
}

/** Las líneas con ese mensaje, en el orden en que salieron. */
export function recordsOf(lines: LoggedLine[], msg: string): Record<string, unknown>[] {
  return lines.filter((entry) => entry.record.msg === msg).map((entry) => entry.record);
}

/**
 * Ninguna línea trae el correo ni lo que va antes de la arroba, se haya escrito como se haya
 * escrito, y ninguna tiene un campo `email`.
 */
export function expectNoEmail(lines: LoggedLine[], email: string): void {
  const written = email.trim().toLowerCase();
  const [localPart] = written.split("@");
  for (const { line, record } of lines) {
    expect(line.toLowerCase()).not.toContain(written);
    expect(line.toLowerCase()).not.toContain(localPart);
    expect(record).not.toHaveProperty("email");
  }
}
