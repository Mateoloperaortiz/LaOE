import { SESv2Client, type SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { CreateEmailResponse } from "resend";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleTransport, ResendTransport, SesTransport } from "@/shared/adapters/mail";
import { logger } from "@/shared/log";

// La clave de idempotencia del proveedor (ADR-116 regla 18): Resend la recibe en el encabezado
// `Idempotency-Key`, que es como su API la documenta; SES y la consola la ignoran.

const FROM = "OE <noreply@example.test>";
const KEY = "casa.example.test/event:5f0c2a:T-200/persona-de-prueba";
const message = {
  to: "persona@example.test",
  subject: "Prueba",
  text: "Mensaje de prueba",
  html: "<p>Mensaje de prueba</p>",
  headers: { "List-Unsubscribe": "<https://example.test/baja/prueba>" },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** El transporte con el SDK de verdad y la red reemplazada: se mira la petición HTTP que sale. */
function resendOverHttp() {
  const request = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: "email-prueba" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", request);
  return { request, mail: new ResendTransport("re_prueba", FROM) };
}

describe("Resend: clave de idempotencia", () => {
  it("la clave viaja en el encabezado Idempotency-Key de la petición, y no en el cuerpo del correo", async () => {
    const { mail, request } = resendOverHttp();

    await expect(mail.send({ ...message, idempotencyKey: KEY })).resolves.toEqual({
      id: "email-prueba",
    });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/emails$/);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(KEY);
    const body = String(init?.body);
    expect(body).not.toContain(KEY);
    expect(JSON.parse(body)).toMatchObject({
      from: FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: message.headers,
    });
  });

  it("un correo sin clave sale sin ese encabezado", async () => {
    const { mail, request } = resendOverHttp();

    await mail.send(message);

    const [, init] = request.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).has("Idempotency-Key")).toBe(false);
  });

  it("los reintentos de ráfaga repiten la misma clave", async () => {
    const limited: CreateEmailResponse = {
      data: null,
      error: { name: "rate_limit_exceeded", message: "error de prueba", statusCode: 429 },
      headers: { "retry-after": "1" },
    };
    const send = vi
      .fn<(_message: unknown, _options?: unknown) => Promise<CreateEmailResponse>>()
      .mockResolvedValueOnce(limited)
      .mockResolvedValue({ data: { id: "email-prueba" }, error: null, headers: null });
    const wait = vi.fn<(_: number) => Promise<void>>().mockResolvedValue(undefined);
    const mail = new ResendTransport("re_prueba", FROM, { send, wait });

    await expect(mail.send({ ...message, idempotencyKey: KEY })).resolves.toEqual({
      id: "email-prueba",
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: KEY },
      { idempotencyKey: KEY },
    ]);
    // El cuerpo es el mismo en las dos llamadas y no lleva la clave.
    expect(send.mock.calls[0]?.[0]).toEqual({ ...message, from: FROM });
    expect(send.mock.calls[1]?.[0]).toEqual(send.mock.calls[0]?.[0]);
  });
});

describe("los transportes sin clave de idempotencia", () => {
  it("SES la ignora: el correo sale igual y la clave no viaja en ninguna parte del comando", async () => {
    const sent = vi
      .spyOn(SESv2Client.prototype, "send")
      .mockImplementation((async () => ({ MessageId: "ses-prueba" })) as never);
    const mail = new SesTransport("us-east-1", FROM);

    await expect(mail.send({ ...message, idempotencyKey: KEY })).resolves.toEqual({
      id: "ses-prueba",
    });

    expect(sent).toHaveBeenCalledOnce();
    const { input } = sent.mock.calls[0]?.[0] as unknown as SendEmailCommand;
    expect(JSON.stringify(input)).not.toContain(KEY);
    expect(input.Destination).toEqual({ ToAddresses: [message.to] });
    expect(input.Content?.Simple?.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: message.headers["List-Unsubscribe"] },
    ]);
  });

  it("la consola la ignora: imprime el correo sin la clave", async () => {
    const printed = vi.spyOn(logger, "info").mockImplementation(() => undefined);

    await expect(new ConsoleTransport().send({ ...message, idempotencyKey: KEY })).resolves.toEqual(
      { id: null },
    );

    expect(printed).toHaveBeenCalledOnce();
    expect(JSON.stringify(printed.mock.calls[0])).not.toContain(KEY);
  });
});
