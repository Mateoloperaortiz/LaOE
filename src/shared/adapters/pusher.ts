import webPush, { type PushSubscription, type SendResult } from "web-push";
import { getEnv } from "@/env";

// Push web con VAPID (ADR-015). El módulo comms decide a quién y qué; aquí solo se envía.

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 120;

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Título hasta 40 caracteres y cuerpo hasta 120 (14-copy-y-textos.md §1). */
export function buildPushPayload(input: PushPayload): PushPayload {
  return {
    ...input,
    title: truncate(input.title, PUSH_TITLE_MAX),
    body: truncate(input.body, PUSH_BODY_MAX),
  };
}

let configured = false;

/** @public API del adaptador; la usa comms desde la fase 6. */
export function isPushConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function ensureConfigured(): void {
  if (configured) {
    return;
  }
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error(
      "Push sin configurar: faltan VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT",
    );
  }
  webPush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  configured = true;
}

export type PushOutcome =
  | { ok: true; statusCode: number }
  | { ok: false; gone: boolean; error: string };

/** @public Envía una notificación; `gone` indica que la suscripción ya no existe y debe borrarse. */
export async function sendPush(
  subscription: PushSubscription,
  payload: PushPayload,
): Promise<PushOutcome> {
  ensureConfigured();
  try {
    const result: SendResult = await webPush.sendNotification(
      subscription,
      JSON.stringify(buildPushPayload(payload)),
      {
        TTL: 60 * 60,
      },
    );
    return { ok: true, statusCode: result.statusCode };
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    return {
      ok: false,
      gone: statusCode === 404 || statusCode === 410,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
