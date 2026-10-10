import { and, eq, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Executor, runCommand, SYSTEM_ACTOR, type Tx } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { carnetTokenRotated } from "@/domain-events/identity";
import {
  canParticipate,
  getWalletMemberState,
  lockWalletMember,
  type WalletMemberState,
} from "@/modules/people";
import { carnetToken } from "../schema";
import type { Actor } from "./actor";
import { CARNET_TOKEN, createWalletCarnetToken } from "./carnet-pure";
import { ForbiddenError } from "./errors";
import { assertAdmin } from "./guards";

export { CARNET_TOKEN } from "./carnet-pure";

export interface CarnetCredential {
  personId: string;
  token: string;
  walletEpoch: number;
  revision: number;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export type CarnetMetadata = Omit<CarnetCredential, "token">;

const metadataColumns = {
  personId: carnetToken.personId,
  walletEpoch: carnetToken.walletEpoch,
  revision: carnetToken.revision,
  createdAt: carnetToken.createdAt,
  lastUsedAt: carnetToken.lastUsedAt,
};

const credentialColumns = { ...metadataColumns, token: carnetToken.token };

/** Lectura de la credencial almacenada: el consumidor compara su epoch con el estado de people. */
export async function getCarnetCredential(
  personId: string,
  exec: Executor = getDb(),
): Promise<CarnetCredential | null> {
  const [row] = await exec
    .select(credentialColumns)
    .from(carnetToken)
    .where(eq(carnetToken.personId, personId))
    .limit(1);
  return row ?? null;
}

/** Metadata vigente para avisos y exportación, sin leer ni devolver la capacidad secreta. */
export async function getCarnetMetadata(
  personId: string,
  exec: Executor = getDb(),
): Promise<CarnetMetadata | null> {
  const state = await getWalletMemberState(exec, personId);
  if (!state || state.anonymizedAt || state.status === "INACTIVE") {
    return null;
  }
  const [row] = await exec
    .select(metadataColumns)
    .from(carnetToken)
    .where(eq(carnetToken.personId, personId))
    .limit(1);
  return row?.walletEpoch === state.walletEpoch ? row : null;
}

function requireMember(state: WalletMemberState | null): WalletMemberState {
  if (!state || state.anonymizedAt || !canParticipate(state.status)) {
    throw new ForbiddenError();
  }
  return state;
}

/** El llamador ya sostiene el lock corto de la persona dentro de esta misma transacción. */
async function replaceCredential(
  tx: Tx,
  personId: string,
  walletEpoch: number,
  revision: number,
): Promise<CarnetCredential> {
  const values = {
    token: createWalletCarnetToken(),
    walletEpoch,
    revision,
    createdAt: new Date(),
    lastUsedAt: null,
  };
  const [row] = await tx
    .insert(carnetToken)
    .values({ personId, ...values })
    .onConflictDoUpdate({ target: carnetToken.personId, set: values })
    .returning(credentialColumns);
  if (!row) {
    throw new Error("No se pudo guardar la credencial del carnet");
  }
  return row;
}

/**
 * Obtiene o crea la credencial dentro de la transacción corta de reserva de un pase. Nunca se usa
 * desde un job de refresco ni se sostiene este lock mientras se llama a un proveedor externo.
 */
export async function getOrCreateCarnetCredential(
  tx: Tx,
  personId: string,
): Promise<CarnetCredential> {
  const state = requireMember(await lockWalletMember(tx, personId));
  const existing = await getCarnetCredential(personId, tx);
  if (existing?.walletEpoch === state.walletEpoch) {
    return existing;
  }
  return replaceCredential(tx, personId, state.walletEpoch, 1);
}

export async function getOrCreateCarnetToken(personId: string): Promise<string> {
  const credential = await runCommand(SYSTEM_ACTOR, (ctx) =>
    getOrCreateCarnetCredential(ctx.tx, personId),
  );
  return credential.token;
}

/**
 * Rota el QR propio o, solo para ADMIN, el de otra persona; no cambia los tokens oe1 de la app.
 * Recibe la sesión con la IP del request (`sessionActorContext`, ADR-082 regla 3).
 */
export async function rotateCarnetTokenAs(
  actor: Actor & { ip: string | null },
  personId = actor.personId,
): Promise<string> {
  if (personId !== actor.personId) {
    assertAdmin(actor);
  }
  return runCommand(actor, async (ctx) => {
    const state = requireMember(await lockWalletMember(ctx.tx, personId));
    const previous = await getCarnetCredential(personId, ctx.tx);
    // Revocar solo renueva una credencial vigente; la primera emisión siempre exige agregar el pase.
    if (!previous || previous.walletEpoch !== state.walletEpoch) {
      throw new ForbiddenError();
    }
    const revision = previous.revision + 1;
    const credential = await replaceCredential(ctx.tx, personId, state.walletEpoch, revision);
    await ctx.audit({
      action: "carnet-token.rotated",
      entityType: "carnet_token",
      entityId: personId,
      after: { walletEpoch: credential.walletEpoch, revision: credential.revision },
    });
    // Cada rotación conserva su evento: una clave solo por persona perdería cambios en vuelo.
    await ctx.emit(
      eventOf(carnetTokenRotated, {
        personId,
        walletEpoch: credential.walletEpoch,
        revision: credential.revision,
      }),
    );
    return credential.token;
  });
}

/** Valida el formato antes de consultar Postgres; el UPDATE es el punto de validación del token. */
export async function resolveCarnetToken(token: string, now = new Date()): Promise<string | null> {
  if (!CARNET_TOKEN.test(token)) {
    return null;
  }
  const db = getDb();
  const [row] = await db
    .update(carnetToken)
    .set({ lastUsedAt: now })
    .where(eq(carnetToken.token, token))
    .returning({ personId: carnetToken.personId, walletEpoch: carnetToken.walletEpoch });
  if (!row) {
    return null;
  }
  const state = await getWalletMemberState(db, row.personId);
  if (
    !state ||
    state.anonymizedAt ||
    state.status === "INACTIVE" ||
    state.walletEpoch !== row.walletEpoch
  ) {
    return null;
  }
  return row.personId;
}

/** Un evento atrasado de baja nunca borra una credencial emitida tras la reactivación. */
export async function deleteCarnetTokenFor(personId: string): Promise<number> {
  return runCommand(SYSTEM_ACTOR, async (ctx) => {
    const state = await lockWalletMember(ctx.tx, personId);
    if (!state) {
      return 0;
    }
    const deleted = await ctx.tx
      .delete(carnetToken)
      .where(
        and(eq(carnetToken.personId, personId), lt(carnetToken.walletEpoch, state.walletEpoch)),
      )
      .returning({ id: carnetToken.id });
    return deleted.length;
  });
}
