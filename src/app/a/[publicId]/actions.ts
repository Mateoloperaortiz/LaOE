"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actorContext } from "@/app/_lib/actor";
import { requireActor } from "@/modules/identity";
import { checkInSelfAs, type SelfCheckInResult } from "@/modules/participation";

// Check-in propio (ADR-035 regla 5): la acción llama al dominio y vuelve a la página con un código
// de resultado; la página lo traduce a los textos T-092 a T-099 y T-523 a T-533.

const inputSchema = z.object({
  publicId: z
    .string()
    .trim()
    .regex(/^[0-9a-z]{10}$/),
  code: z
    .string()
    .trim()
    .max(12)
    .optional()
    .transform((value) => (value ? value : null)),
  boosterId: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((value) => (value ? value : null)),
});

export type CheckInResultCode =
  | "puntos"
  | "registrado"
  | "pendiente"
  | "repetido"
  | "codigo"
  | "falta-codigo"
  | "cerrado"
  | "no-abre"
  | "nuevos"
  | "inactivo"
  | "sin-semestre"
  | "no-existe"
  | "booster";

function codeFor(result: SelfCheckInResult): CheckInResultCode {
  if (result.ok) {
    if (result.outcome === "APPROVED_WITH_POINTS") return "puntos";
    return result.outcome === "PENDING" ? "pendiente" : "registrado";
  }
  switch (result.reason) {
    case "ALREADY":
      return "repetido";
    case "BAD_CODE":
      return "codigo";
    case "CODE_REQUIRED":
      return "falta-codigo";
    case "NOT_OPEN_YET":
      return "no-abre";
    case "NEW_MEMBERS_ONLY":
      return "nuevos";
    case "NOT_ELIGIBLE":
      return "inactivo";
    case "TERM_CLOSED":
      return "sin-semestre";
    case "NOT_FOUND":
      return "no-existe";
    case "BOOSTER":
      return "booster";
    default:
      return "cerrado";
  }
}

export async function checkInAction(formData: FormData): Promise<void> {
  const parsed = inputSchema.safeParse({
    publicId: formData.get("publicId"),
    code: formData.get("code") ?? undefined,
    boosterId: formData.get("boosterId") ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app");
  }
  const { publicId, code, boosterId } = parsed.data;
  const actor = await requireActor(`/a/${publicId}`);
  const result = await checkInSelfAs(await actorContext(actor), { publicId, code, boosterId });
  const params = new URLSearchParams({ r: codeFor(result) });
  if (code && result.ok === false && result.reason === "BAD_CODE") {
    params.set("c", code);
  }
  if (result.ok === false && result.reason === "BOOSTER" && result.message) {
    params.set("m", result.message.slice(0, 200));
  }
  if (result.ok && boosterId) {
    params.set("b", boosterId);
  }
  redirect(`/a/${publicId}?${params.toString()}`);
}
