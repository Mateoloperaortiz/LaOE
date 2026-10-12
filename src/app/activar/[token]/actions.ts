"use server";

import "server-only";
import { redirect } from "next/navigation";
import { consumeAccessGrant, writeSessionCookie } from "@/modules/identity";
import { t } from "@/shared/copy";
import { clientIp, userAgent } from "@/shared/lib/request";
import type { ActivateState } from "./state";

// Activación y recuperación (ADR-051): la única ruta pública que fija una contraseña. El token
// viaja en la URL, nunca se guarda en claro y sirve una sola vez.

const problemas = {
  SHORT: "T-2108",
  COMMON: "T-2110",
  PERSONAL: "T-2110",
} as const;

export async function activateAction(
  _previous: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");
  if (typeof token !== "string" || token.length === 0) {
    return { error: t("T-2107") };
  }
  if (typeof password !== "string" || typeof confirmation !== "string") {
    return { error: t("T-2108") };
  }
  if (password !== confirmation) {
    return { error: t("T-2109") };
  }
  const result = await consumeAccessGrant({
    token,
    password,
    ip: await clientIp(),
    userAgent: await userAgent(),
  });
  if (!result.ok) {
    return { error: result.reason === "INVALID" ? t("T-2107") : t(problemas[result.problem]) };
  }
  // El enlace abre una sesión recordada (`consumeAccessGrant`) y el formulario no pregunta: la
  // cookie lleva siempre su vencimiento.
  await writeSessionCookie({ token: result.token, expiresAt: result.expiresAt, remember: true });
  redirect("/app");
}
