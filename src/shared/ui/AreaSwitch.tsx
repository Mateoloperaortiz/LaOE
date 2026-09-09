import Link from "next/link";
import { t } from "@/shared/copy";

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
