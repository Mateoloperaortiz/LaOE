"use client";

import { useFormStatus } from "react-dom";
import { t } from "@/shared/copy";

export function ResourceSubmitButton({
  label,
  className = "boton-secundario min-h-11 px-4 py-2 text-sm",
}: {
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-60`}
    >
      {pending ? t("T-1431") : label}
    </button>
  );
}
