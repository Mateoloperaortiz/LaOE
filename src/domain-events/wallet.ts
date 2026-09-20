import { z } from "zod";
import { defineEvent } from "./define";

// Trabajo interno de `wallet`: lo encola y lo atiende el mismo módulo.

const id = z.string().min(1);

/** Refresca el pase de Google de una persona. */
export const walletSync = defineEvent("wallet.sync", z.object({ personId: id }));

/**
 * Recorre los pases por páginas. También es el programado de las 00:05, que llega sin cursor: el
 * payload del scheduler (`scheduled`, `at`) no está en el contrato y se descarta al validar.
 */
export const walletReconcile = defineEvent("wallet.reconcile", z.object({ cursor: id.optional() }));
