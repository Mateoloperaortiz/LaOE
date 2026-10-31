"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";

export function AdminSectionSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; href: string }>;
}) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5 text-sm font-semibold md:hidden">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const href = options.find((option) => option.value === event.target.value)?.href;
          if (href)
            router.push(href, {
              scroll: !preservePageScroll(href, window.location.pathname, window.location.origin),
            });
        }}
        className="min-h-11 w-full rounded-lg border border-borde bg-fondo px-3 py-2"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
