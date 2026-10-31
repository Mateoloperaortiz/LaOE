import { t } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";

/** Aviso compartido por los flujos que capturan una autorización (ADR-039). */
export function PrivacyPolicyNotice({ admin = false }: { admin?: boolean }) {
  return (
    <p className="max-w-prose rounded-xl border border-borde bg-fondo-suave px-4 py-3 text-sm">
      {t(admin ? "T-1179" : "T-1178")}{" "}
      <Link href="/privacidad" className="underline">
        {t("T-865")}
      </Link>
    </p>
  );
}
