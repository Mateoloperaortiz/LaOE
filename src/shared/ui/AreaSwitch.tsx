import { t } from "@/shared/copy/client";
import { AppLink as Link } from "@/shared/ui/AppLink";

export function AreaSwitch({ to }: { to: "admin" | "member" }) {
  return (
    <Link
      href={to === "admin" ? "/admin" : "/app"}
      className="boton-secundario"
      aria-label={t(to === "admin" ? "T-2090" : "T-2091")}
    >
      {t(to === "admin" ? "T-236" : "T-1660")}
    </Link>
  );
}
