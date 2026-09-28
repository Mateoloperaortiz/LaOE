"use server";

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formText } from "@/app/_lib/form";
import { getEnv } from "@/env";
import {
  enterHubAs,
  HUB_COOKIE,
  HUB_PATH,
  hubCookieValue,
  hubSessionFromCookie,
  placeHubBetAs,
} from "@/modules/competition";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { clientIp } from "@/shared/lib/request";

// Acciones del hub de capitanes (ADR-096): entrar con el código del equipo, apostar y salir. Vuelven
// a /capitanes con `?aviso=` o `?error=`; el código nunca viaja en una URL.

function back(query: Record<string, string> = {}): never {
  const search = new URLSearchParams(query).toString();
  redirect(search ? `${HUB_PATH}?${search}` : HUB_PATH);
}

export async function enterHubAction(form: FormData): Promise<void> {
  const result = await enterHubAs({ personId: null, ip: await clientIp() }, formText(form, "code"));
  if (!result.ok) back({ error: result.message });
  (await cookies()).set({
    name: HUB_COOKIE,
    value: hubCookieValue(result.session),
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: HUB_PATH,
    expires: new Date(result.session.expiresAt),
  });
  back();
}

export async function hubBetAction(form: FormData): Promise<void> {
  const session = hubSessionFromCookie((await cookies()).get(HUB_COOKIE)?.value);
  if (!session) back({ error: t("T-3056") });
  let outcome: Record<string, string>;
  try {
    const stake = Number(formText(form, "stake"));
    const placed = await placeHubBetAs({ personId: null, ip: await clientIp() }, session, {
      marketId: formText(form, "marketId"),
      pickTeamId: formText(form, "pickTeamId"),
      stake,
    });
    outcome = { aviso: t("T-3051", { puntos: stake, saldo: placed.balance }) };
  } catch (error) {
    if (error instanceof DomainError) outcome = { error: error.message };
    else if (error instanceof z.ZodError) outcome = { error: t("T-260") };
    else throw error;
  }
  back(outcome);
}

export async function leaveHubAction(): Promise<void> {
  (await cookies()).delete({ name: HUB_COOKIE, path: HUB_PATH });
  back();
}
