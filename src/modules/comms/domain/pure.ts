// Reglas de enrutamiento del correo sin I/O (ADR-023).

export type Route = "primary" | "overflow";

/** Resend mientras el contador del día esté por debajo del límite; desde ahí, SES. */
export function chooseRoute(
  sentTodayViaPrimary: number,
  dailyLimit: number,
  overflowAvailable: boolean,
): Route {
  if (!overflowAvailable) {
    return "primary";
  }
  return sentTodayViaPrimary >= dailyLimit ? "overflow" : "primary";
}
