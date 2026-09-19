import { t } from "@/shared/copy/client";

type Props = {
  tamano?: "sm" | "md" | "lg";
  className?: string;
};

const tamanos = { sm: "text-display-md", md: "text-display-lg", lg: "text-display-xl" };

// "¡OE OE OE!": cierra confirmaciones, éxitos y estados vacíos; nunca errores (07-marca.md §1).
export function SelloOE({ tamano = "md", className = "" }: Props) {
  return <p className={`sello-oe inline-block ${tamanos[tamano]} ${className}`}>{t("T-037")}</p>;
}
