import type { CreateEmailResponse, ErrorResponse } from "resend";
import { describe, expect, it, vi } from "vitest";
import { QuotaExceededError, ResendTransport } from "@/shared/adapters/mail";

const message = {
  to: "persona@example.test",
  subject: "Prueba",
  text: "Mensaje de prueba",
  html: "<p>Mensaje de prueba</p>",
  headers: { "List-Unsubscribe": "<https://example.test/baja/prueba>" },
};
const success: CreateEmailResponse = { data: { id: "email-prueba" }, error: null, headers: null };
function failure(
  name: ErrorResponse["name"],
  headers: Record<string, string> = {},
): CreateEmailResponse {
  return { data: null, error: { name, message: "error de prueba", statusCode: 429 }, headers };
}
function transport() {
  const send = vi.fn<(_: unknown) => Promise<CreateEmailResponse>>().mockResolvedValue(success);
  const wait = vi.fn<(_: number) => Promise<void>>().mockResolvedValue(undefined);
  return {
    send,
    wait,
    mail: new ResendTransport("re_prueba", "OE <noreply@example.test>", { send, wait }),
  };
}

describe("Resend: reintentos de ráfaga", () => {
  it("entrega una vez sin esperar si no hubo error", async () => {
    const { mail, send, wait } = transport();
    await expect(mail.send(message)).resolves.toEqual({ id: "email-prueba" });
    expect(send).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("respeta retry-after y conserva cuerpo y cabeceras", async () => {
    const { mail, send, wait } = transport();
    send.mockResolvedValueOnce(failure("rate_limit_exceeded", { "retry-after": "3" }));
    await expect(mail.send(message)).resolves.toEqual({ id: "email-prueba" });
    expect(wait).toHaveBeenCalledWith(3000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toEqual({ ...message, from: "OE <noreply@example.test>" });
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  });

  it("agota tres reintentos con esperas de 1, 2 y 4 segundos", async () => {
    const { mail, send, wait } = transport();
    send.mockResolvedValue(failure("rate_limit_exceeded", { "retry-after": "inválido" }));
    await expect(mail.send(message)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(send).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls).toEqual([[1000], [2000], [4000]]);
  });

  it("interpreta Retry-After con fecha HTTP", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-01T00:00:00Z"));
    try {
      const { mail, send, wait } = transport();
      send.mockResolvedValueOnce(
        failure("rate_limit_exceeded", {
          "retry-after": "Thu, 01 Jan 2026 00:00:05 GMT",
        }),
      );
      await mail.send(message);
      expect(wait).toHaveBeenCalledWith(5000);
    } finally {
      now.mockRestore();
    }
  });

  it("mantiene tres reintentos cuando Retry-After exige más de 30 segundos", async () => {
    const { mail, send, wait } = transport();
    send.mockResolvedValue(failure("rate_limit_exceeded", { "retry-after": "60" }));
    await expect(mail.send(message)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(send).toHaveBeenCalledTimes(4);
    expect(wait.mock.calls).toEqual([[60_000], [60_000], [60_000]]);
  });

  it.each([
    "daily_quota_exceeded",
    "monthly_quota_exceeded",
  ] as const)("%s no se reintenta", async (name) => {
    const { mail, send, wait } = transport();
    send.mockResolvedValue(failure(name));
    await expect(mail.send(message)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(send).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it("no reintenta otros errores de API ni fallos de red", async () => {
    for (const error of [failure("validation_error"), new Error("conexión perdida")]) {
      const { mail, send, wait } = transport();
      if (error instanceof Error) send.mockRejectedValue(error);
      else send.mockResolvedValue(error);
      await expect(mail.send(message)).rejects.toThrow();
      expect(send).toHaveBeenCalledOnce();
      expect(wait).not.toHaveBeenCalled();
    }
  });
});
