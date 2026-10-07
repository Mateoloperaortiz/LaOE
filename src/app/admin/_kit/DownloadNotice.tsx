import { isDownloadPending } from "@/app/_lib/download";
import { t } from "@/shared/copy";

type Props = { searchParams: Record<string, string | string[] | undefined> };

/** Aviso de la pantalla del admin a la que se volvió por una descarga que no salió (ADR-113, regla 10). */
export function DownloadNotice({ searchParams }: Props) {
  if (!isDownloadPending(searchParams)) {
    return null;
  }
  return (
    <output className="admin-feedback block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 text-sm font-semibold text-oe-navy">
      {t("T-3211")}
    </output>
  );
}
