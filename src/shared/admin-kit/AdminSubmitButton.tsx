"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { t } from "@/shared/copy";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string };

/** Conserva el submitter de los formularios con varias decisiones y evita envíos repetidos. */
export function AdminSubmitButton({
  children,
  disabled,
  pendingLabel,
  type = "submit",
  ...props
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type={type} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? t("T-1501")) : children}
    </button>
  );
}
