// Qué ve el líder de base en cada enfrentamiento (ADR-106), sin I/O. La base empieza con la rotación:
// los poderes siguen abiertos hasta que el líder los confirma o registra el resultado, y el resultado
// queda bloqueado para él apenas lo registra.

export interface JudgeStageInput {
  /** Base normal: las inflables no tienen poderes (ADR-098). */
  normal: boolean;
  /** Los poderes ya se cerraron: `startedAt` tiene hora. */
  powersClosed: boolean;
  recorded: boolean;
  /** Poderes registrados y vigentes en el enfrentamiento. */
  declared: number;
  /** Tarjetas que los dos equipos todavía pueden usar. */
  available: number;
}

export interface JudgeStage {
  /** Registrar o quitar tarjetas y confirmar los poderes. */
  powers: boolean;
  /** Hay poderes registrados sin confirmar: se confirman antes del resultado. */
  confirmFirst: boolean;
  /** Los botones del resultado, cada uno con su aviso. */
  results: boolean;
  /** El resultado ya está registrado: solo la operación lo cambia. */
  locked: boolean;
}

export function judgeStage(input: JudgeStageInput): JudgeStage {
  const locked = input.recorded;
  const powers =
    input.normal && !input.powersClosed && !locked && input.declared + input.available > 0;
  const confirmFirst = powers && input.declared > 0;
  return { powers, confirmFirst, results: !locked && !confirmFirst, locked };
}
