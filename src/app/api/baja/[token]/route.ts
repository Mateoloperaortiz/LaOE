import { unsubscribeByToken } from "@/modules/comms";
import { clientIp } from "@/shared/lib/request";

// Clic único de baja (RFC 8058, ADR-038 regla 8): los clientes de correo hacen POST a la URL de la
// cabecera List-Unsubscribe con `List-Unsubscribe=One-Click`; responde 200 sin interfaz. La IP que se
// audita es la de ese POST, que puede ser la del proveedor del correo y no la de la persona (ADR-123
// regla 2).

export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export async function POST(_request: Request, context: RouteContext<"/api/baja/[token]">) {
  const { token } = await context.params;
  if (!TOKEN.test(token)) {
    return new Response("Token inválido", { status: 400 });
  }
  const ok = await unsubscribeByToken(token, await clientIp());
  return new Response(ok ? "OK" : "Token inválido", { status: ok ? 200 : 404 });
}
