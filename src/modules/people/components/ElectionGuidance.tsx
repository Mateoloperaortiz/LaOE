import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

/** Procedimiento humano actualizado: no otorga permisos ni sustituye un acta. */
export function ElectionGuidance({ board = false }: { board?: boolean }) {
  return (
    <details className="rounded-xl border border-borde p-4">
      <summary className="cursor-pointer font-semibold">{t("T-4844")}</summary>
      <div className="mt-3 flex max-w-prose flex-col gap-3 text-sm text-tinta-suave">
        <p>{t(board ? "T-4845" : "T-4846")}</p>
        <p>{t("T-4847")}</p>
        {!board ? <p>{t("T-4848")}</p> : null}
        <Link href="/app/normativa" className="underline">
          {t("T-4849")}
        </Link>
      </div>
    </details>
  );
}
