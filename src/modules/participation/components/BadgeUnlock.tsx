"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { t, tLabels } from "@/shared/copy/client";
import { BOOSTER_KINDS, type BoosterKind } from "../gamification-types";
import { BadgeArt } from "./BadgeArt";

// Diálogo de desbloqueo (ADR-067 regla 10): se muestra una sola vez por logro — al cerrar o al
// desmontar se marca `seenAt` — con una entrada animada breve solo cuando la persona no pidió
// movimiento reducido; con movimiento reducido aparece la alternativa estática T-2499.

export interface UnseenBadge {
  achievementId: string;
  name: string;
  family: "EN_PARCHE" | "EXPLORADOR" | "RELAMPAGO" | "PALABRA_A_PALABRA" | "SPECIAL";
  level: number;
  boosterKind: BoosterKind | null;
}

type Props = {
  unseen: UnseenBadge[];
  onSeen: (achievementIds: string[]) => Promise<void>;
};

export function BadgeUnlock({ unseen, onSeen }: Props) {
  const router = useRouter();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const marked = useRef(false);
  const [pending, startTransition] = useTransition();
  const [reduced, setReduced] = useState(false);
  const boosterNames = tLabels("T-2451", BOOSTER_KINDS);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const latest = useRef({ unseen, onSeen });
  latest.current = { unseen, onSeen };

  useEffect(() => {
    if (latest.current.unseen.length === 0) {
      return;
    }
    const element = dialog.current;
    element?.showModal();
    return () => {
      // Solo cerrar: marcar acá dispararía la revalidación y StrictMode (dev) desmonta el
      // efecto al montar, lo que borraría el diálogo sin que la persona lo viera.
      if (element?.open) {
        element.close();
      }
    };
    // Una exhibición por montaje: los ids llegan resueltos del servidor y el ref los mantiene.
  }, []);

  if (unseen.length === 0) {
    return null;
  }

  function close(navigate: boolean) {
    if (!marked.current) {
      marked.current = true;
      startTransition(async () => {
        try {
          await onSeen(unseen.map((item) => item.achievementId));
        } catch (error) {
          // El pedido no llegó (ADR-122 regla 17): el aviso ya se cerró y la insignia queda sin
          // marcar, así que vuelve a salir en la próxima visita. Una redirección sigue su camino.
          unstable_rethrow(error);
        }
      });
    }
    dialog.current?.close();
    if (navigate) {
      router.push("/app/gh-points/coleccion");
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close(false);
      }}
      className="m-auto w-full max-w-md rounded-[var(--radius-cartel)] border border-borde bg-fondo p-6 text-tinta shadow-2xl backdrop:bg-oe-navy/50"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-display-md">
          {t("T-2495")}
        </h2>
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {unseen.map((item) => {
            const booster = item.boosterKind
              ? (boosterNames[item.boosterKind] ?? item.boosterKind)
              : null;
            return (
              <li key={item.achievementId} className="flex items-start gap-4">
                <span className="badge-unlock-art">
                  <BadgeArt family={item.family} level={item.level} unlocked />
                </span>
                <div className="flex flex-col gap-1">
                  <p>
                    {t(reduced ? "T-2499" : "T-2496", {
                      insignia: item.name,
                      nivel: item.level,
                    })}
                  </p>
                  {booster ? (
                    <p className="text-sm text-tinta-suave">{t("T-2497", { booster })}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => close(true)}
          disabled={pending}
          className="boton-primario self-start"
        >
          {t("T-2498")}
        </button>
      </div>
    </dialog>
  );
}
