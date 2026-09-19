"use server";

import "server-only";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { getEnv } from "@/env";
import {
  assertBoard,
  ForbiddenError,
  getActor,
  hasRecentStepUp,
  issueAccessGrantAs,
} from "@/modules/identity";
import { DomainError } from "@/shared/admin-kit";
import { t } from "@/shared/copy";
import type { IssueGrantState } from "./acceso-state";

// Emisión del enlace de acceso (ADR-051). Vive en src/app porque compone identity —actor, guard y
// step-up— con la ficha de la persona. Devuelve la URL una sola vez, en el estado del formulario:
// no se guarda, no pasa por `message` y no vuelve a mostrarse.

const inputSchema = z.object({
  personId: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(["ACTIVATION", "RECOVERY"]),
});

export async function issueGrantAction(
  _previous: IssueGrantState,
  formData: FormData,
): Promise<IssueGrantState> {
  const parsed = inputSchema.safeParse({
    personId: formData.get("personId"),
    kind: formData.get("kind"),
  });
  const returnTo = z.string().safeParse(formData.get("returnTo")).data ?? "/admin/personas";
  const actor = await getActor();
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(returnTo)}`);
  }
  try {
    assertBoard(actor);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/app");
    }
    throw error;
  }
  if (!hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(returnTo)}`);
  }
  if (!parsed.success) {
    return { personId: null, url: null, qrSvg: null, expiresAt: null, error: t("T-2127") };
  }
  try {
    const { token, expiresAt } = await issueAccessGrantAs(await actorContext(actor), parsed.data);
    const url = `${getEnv().APP_URL}/activar/${token}`;
    // El QR se dibuja en el servidor, en el mismo paso: así el enlace no viaja por ningún otro lado.
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return {
      personId: parsed.data.personId,
      url,
      qrSvg,
      expiresAt: expiresAt.toISOString(),
      error: null,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { personId: null, url: null, qrSvg: null, expiresAt: null, error: error.message };
    }
    throw error;
  }
}
