import type { ReactNode } from "react";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { competitionAction } from "../actions";

// Piezas comunes del panel de The Games: cada formulario lleva la competencia, la pestaña de vuelta y
// la operación, y lo recibe el despachador de actions.ts.

export interface PanelContext {
  competitionId: string;
  area: string;
}

export function OperationForm({
  context,
  operation,
  children,
  className,
  hidden = {},
}: {
  context: PanelContext;
  operation: string;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={competitionAction} className={className}>
      <input type="hidden" name="competitionId" value={context.competitionId} />
      <input type="hidden" name="area" value={context.area} />
      <input type="hidden" name="operation" value={operation} />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}

export function Submit({
  children,
  variant = "secundario",
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primario" | "secundario" | "calido";
  name?: string;
  value?: string;
}) {
  return (
    <AdminSubmitButton
      type="submit"
      className={`boton-${variant} min-h-11`}
      {...(name ? { name } : {})}
      {...(value ? { value } : {})}
    >
      {children}
    </AdminSubmitButton>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <h2 className="text-display-md">{title}</h2>
      {children}
    </section>
  );
}

export function TeamChip({
  team,
}: {
  team: { number: number; name: string; color: string | null };
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block size-3 shrink-0 rounded-full border border-borde"
        style={team.color ? { backgroundColor: team.color } : undefined}
      />
      <span className="tabular-nums text-tinta-suave">{team.number}</span>
      <span className="font-semibold">{team.name}</span>
    </span>
  );
}
