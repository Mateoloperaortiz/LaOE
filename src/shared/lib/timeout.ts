// Límite de espera para trabajo que no ofrece cancelación propia (ADR-079). La promesa original sigue
// su curso: quien llama solo deja de esperarla, así que el trabajo debe tener sus propios límites de red.

export class TimeoutError extends Error {
  constructor(label: string, milliseconds: number) {
    super(`${label} superó ${milliseconds} ms`);
    this.name = "TimeoutError";
  }
}

/** Rechaza con `TimeoutError` si `work` no termina a tiempo; con 0 o menos no limita. */
export function withTimeout<T>(work: Promise<T>, milliseconds: number, label: string): Promise<T> {
  if (milliseconds <= 0) {
    return work;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, milliseconds)), milliseconds);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
