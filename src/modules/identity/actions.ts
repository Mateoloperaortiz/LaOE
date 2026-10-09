"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/env";
import { t } from "@/shared/copy";
import { clientIp, userAgent } from "@/shared/lib/request";
import { SESSION_COOKIE } from "./cookie";
import { getActor } from "./current";
import { requestOtp, verifyOtp, verifyStepUp } from "./domain/otp";
import { signInWithPassword, verifyStepUpPassword } from "./domain/password";
import { normalizeEmail, safeNextPath } from "./domain/pure";
import { destroySessionsFor, signOut } from "./domain/session";

export interface LoginState {
  email: string;
  next: string;
  error: string | null;
  fieldError: string | null;
}

export async function initialLoginState(next: string): Promise<LoginState> {
  return { email: "", next: safeNextPath(next), error: null, fieldError: null };
}

/**
 * Ingreso con la contraseña propia (ADR-051). El error es el mismo para un correo que no existe,
 * para quien todavía no eligió contraseña y para una contraseña equivocada.
 */
export async function loginAction(previous: LoginState, formData: FormData): Promise<LoginState> {
  const next = safeNextPath(formData.get("next"), previous.next);
  const email = emailSchema.safeParse(formData.get("email"));
  const password = formData.get("password");
  const base: LoginState = { ...previous, next, error: null, fieldError: null };
  if (!email.success) {
    return { ...base, fieldError: t("T-239") };
  }
  if (typeof password !== "string" || password.length === 0) {
    return { ...base, email: email.data, error: t("T-2096") };
  }
  const remember = formData.get("remember") === "on";
  const result = await signInWithPassword({
    email: email.data,
    password,
    ip: await clientIp(),
    userAgent: await userAgent(),
    remember,
  });
  if (!result.ok) {
    return {
      ...base,
      email: email.data,
      error: result.reason === "LOCKED" ? t("T-2097") : t("T-2096"),
    };
  }
  await setSessionCookie(result.token, result.expiresAt, remember);
  redirect(next);
}

export interface CodeLoginState {
  step: "email" | "code";
  email: string;
  next: string;
  message: string | null;
  error: string | null;
  fieldError: string | null;
}

export async function initialCodeLoginState(next: string): Promise<CodeLoginState> {
  return {
    step: "email",
    email: "",
    next: safeNextPath(next),
    message: null,
    error: null,
    fieldError: null,
  };
}

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

async function setSessionCookie(token: string, expiresAt: Date, remember: boolean): Promise<void> {
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    ...(remember ? { expires: expiresAt } : {}),
  });
}

/** Método alterno (ADR-051): un solo formulario en dos pasos, pedir el código y verificarlo. */
export async function codeLoginAction(
  previous: CodeLoginState,
  formData: FormData,
): Promise<CodeLoginState> {
  const intent = formData.get("intent");
  const next = safeNextPath(formData.get("next"), previous.next);
  const base: CodeLoginState = { ...previous, next, message: null, error: null, fieldError: null };

  if (intent === "restart") {
    return { ...base, step: "email" };
  }

  if (intent === "request") {
    const parsed = emailSchema.safeParse(formData.get("email"));
    if (!parsed.success) {
      return { ...base, step: "email", fieldError: t("T-239") };
    }
    await requestOtp({ email: parsed.data, ip: await clientIp(), purpose: "LOGIN" });
    return { ...base, step: "code", email: parsed.data, message: t("T-044") };
  }

  if (intent === "verify") {
    const email = emailSchema.safeParse(formData.get("email"));
    const code = codeSchema.safeParse(formData.get("code"));
    if (!email.success) {
      return { ...base, step: "email", fieldError: t("T-239") };
    }
    if (!code.success) {
      return { ...base, step: "code", email: email.data, error: t("T-048") };
    }
    const remember = formData.get("remember") === "on";
    const result = await verifyOtp({
      email: normalizeEmail(email.data),
      code: code.data,
      ip: await clientIp(),
      userAgent: await userAgent(),
      remember,
    });
    if (!result.ok) {
      const error =
        result.reason === "EXPIRED"
          ? t("T-048")
          : result.reason === "LOCKED"
            ? t("T-050")
            : t("T-049", { n: result.attemptsLeft });
      return { ...base, step: "code", email: email.data, error };
    }
    await setSessionCookie(result.token, result.expiresAt, remember);
    redirect(next);
  }

  return base;
}

const signOutEndpointSchema = z.url().max(2000);

/**
 * Cierra la sesión de este navegador. `pushEndpoint` es la suscripción que el navegador dijo tener, o
 * `null` si no tenía: la casa retira ese dispositivo solo si es de quien sale (ADR-118 regla 17). Un
 * valor que no es una URL no retira nada y la salida sigue.
 */
export async function signOutAction(pushEndpoint: string | null): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const endpoint = signOutEndpointSchema.safeParse(pushEndpoint);
    await signOut(token, {
      pushEndpoint: endpoint.success ? endpoint.data : null,
      ip: await clientIp(),
    });
  }
  store.delete(SESSION_COOKIE);
  redirect("/");
}

export interface CloseOthersState {
  done: boolean;
  closed: number;
}

export async function closeOtherSessionsAction(): Promise<CloseOthersState> {
  const actor = await getActor();
  if (!actor) {
    redirect("/ingresar?next=%2Fapp%2Fajustes");
  }
  const closed = await destroySessionsFor(getDb(), actor.personId, actor.sessionId);
  revalidatePath("/app/ajustes");
  return { done: true, closed };
}

export interface StepUpState {
  /** La contraseña es el camino principal; el código queda para cuando el correo llegue. */
  mode: "password" | "code";
  /** En modo código: si ya se pidió uno. */
  sent: boolean;
  next: string;
  error: string | null;
}

export async function initialStepUpState(next: string): Promise<StepUpState> {
  return { mode: "password", sent: false, next: safeNextPath(next, "/admin"), error: null };
}

/** Step-up (ADR-051, regla 7): la contraseña del actor, o un código al correo si llega. */
export async function stepUpAction(
  previous: StepUpState,
  formData: FormData,
): Promise<StepUpState> {
  const actor = await getActor();
  const next = safeNextPath(formData.get("next"), previous.next);
  if (!actor) {
    redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  }
  const intent = formData.get("intent");
  const base: StepUpState = { ...previous, next, error: null };

  if (intent === "use-code") {
    await requestOtp({ email: actor.email, ip: await clientIp(), purpose: "STEP_UP" });
    return { ...base, mode: "code", sent: true };
  }
  if (intent === "use-password") {
    return { ...base, mode: "password", sent: false };
  }

  if (intent === "verify-code") {
    const code = codeSchema.safeParse(formData.get("code"));
    if (!code.success) {
      return { ...base, mode: "code", sent: true, error: t("T-048") };
    }
    const result = await verifyStepUp({
      email: actor.email,
      code: code.data,
      sessionId: actor.sessionId,
    });
    if (!result.ok) {
      const error =
        result.reason === "EXPIRED"
          ? t("T-048")
          : result.reason === "LOCKED"
            ? t("T-050")
            : t("T-049", { n: result.attemptsLeft });
      return { ...base, mode: "code", sent: true, error };
    }
    redirect(next);
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { ...base, mode: "password", error: t("T-2118") };
  }
  const result = await verifyStepUpPassword({
    personId: actor.personId,
    password,
    sessionId: actor.sessionId,
    ip: await clientIp(),
  });
  if (!result.ok) {
    return {
      ...base,
      mode: "password",
      error: result.reason === "LOCKED" ? t("T-2097") : t("T-2118"),
    };
  }
  redirect(next);
}
