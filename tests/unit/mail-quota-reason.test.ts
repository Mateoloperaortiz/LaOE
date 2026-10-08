import type { CreateEmailResponse, ErrorResponse } from "resend";
import { describe, expect, it, vi } from "vitest";
import { QuotaExceededError, ResendTransport } from "@/shared/adapters/mail";

// DT-117 (ADR-116 regla 19): el error de cuota dice su causa desde el adaptador, y la ráfaga que no
// cedió lleva lo que el proveedor pidió esperar en su último rechazo.

const message = { to: "persona@example.test", subject: "Prueba", text: "Mensaje de prueba" };

function failure(
  name: ErrorResponse["name"],
  headers: Record<string, string> = {},
): CreateEmailResponse {
  return { data: null, error: { name, message: "error de prueba", statusCode: 429 }, headers };
}

/** El rechazo por cuota con el que termina un envío al que el proveedor siempre le responde eso. */
async function rejection(response: CreateEmailResponse): Promise<QuotaExceededError> {
  const send = vi.fn<(_: unknown) => Promise<CreateEmailResponse>>().mockResolvedValue(response);
  const wait = vi.fn<(_: number) => Promise<void>>().mockResolvedValue(undefined);
  const mail = new ResendTransport("re_prueba", "OE <noreply@example.test>", { send, wait });
  const error = await mail.send(message).catch((caught: unknown) => caught);
  if (!(error instanceof QuotaExceededError)) {
    throw new Error("se esperaba un rechazo por cuota");
  }
  return error;
}

describe("Resend: la causa del rechazo por cuota", () => {
  it.each([
    ["rate_limit_exceeded", "BURST"],
    ["daily_quota_exceeded", "DAILY"],
    ["monthly_quota_exceeded", "MONTHLY"],
  ] as const)("%s sale con la causa %s", async (name, reason) => {
    expect((await rejection(failure(name))).reason).toBe(reason);
  });

  it("la ráfaga que no cedió lleva la espera que pidió el proveedor en su último rechazo", async () => {
    const error = await rejection(failure("rate_limit_exceeded", { "retry-after": "90" }));
    expect(error.retryAfterMs).toBe(90_000);
  });

  it.each([
    ["sin cabecera de reintento", {}],
    ["con una cabecera que no se entiende", { "retry-after": "inválido" }],
  ])("%s, la ráfaga no lleva espera", async (_case, headers) => {
    expect((await rejection(failure("rate_limit_exceeded", headers))).retryAfterMs).toBeNull();
  });

  it.each([
    "daily_quota_exceeded",
    "monthly_quota_exceeded",
  ] as const)("%s no lleva espera aunque venga la cabecera", async (name) => {
    expect((await rejection(failure(name, { "retry-after": "3600" }))).retryAfterMs).toBeNull();
  });

  it("quien arma el error sin decir la causa obtiene la del cupo del día, y sigue siendo el mismo error", () => {
    const error = new QuotaExceededError("daily_quota_exceeded: se acabó el cupo de hoy");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("QuotaExceededError");
    expect(error.message).toBe("daily_quota_exceeded: se acabó el cupo de hoy");
    expect(error.reason).toBe("DAILY");
    expect(error.retryAfterMs).toBeNull();
  });
});
