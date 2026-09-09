import { redirect } from "next/navigation";
import { listSubscriptionsFor } from "@/modules/comms";
import { PwaRegistrar } from "@/modules/comms/components/PwaRegistrar";
import { requireActor } from "@/modules/identity";
import { signOutAction } from "@/modules/identity/actions";
import { hasLiveConsent } from "@/modules/people";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { MemberShell } from "./_ui/MemberShell";
import "./member.css";

// Mi OE incluye la consulta y la autogestión de miembros en licencia.
const RUTAS: Record<string, string> = {
  Inicio: "/app",
  Comités: "/app/comites",
  Personas: "/app/personas",
  Egresados: "/app/egresados",
  "GH Points": "/app/gh-points",
  Permanencia: "/app/permanencia",
  Solicitudes: "/app/solicitudes",
  Convocatorias: "/app/convocatorias",
  Normativa: "/app/normativa",
  Carnet: "/app/carnet",
  Ajustes: "/app/ajustes",
};

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const actor = await requireActor("/app");
  // ADR-048: sin autorización viva, la persona pasa primero por la pantalla de autorización.
  if (!(await hasLiveConsent(actor.personId, "MEMBERSHIP"))) {
    redirect("/autorizacion");
  }
  const devices = await listSubscriptionsFor(actor.personId);
  const [temaOscuro, temaClaro] = tList("T-034") as [string, string];
  const pestañas = tList("T-061").filter((nombre) => nombre in RUTAS);
  const groups = [
    { label: t("T-1664"), names: ["Comités", "Personas", "Egresados"] },
    { label: t("T-1665"), names: ["Permanencia", "Solicitudes", "Convocatorias", "Normativa"] },
    { label: t("T-1666"), names: ["Ajustes"] },
  ].map((group) => ({
    label: group.label,
    items: group.names
      .filter((name) => pestañas.includes(name))
      .map((name) => ({ href: RUTAS[name] ?? "/app", label: name })),
  }));
  return (
    <>
      <PwaRegistrar endpointsKey={devices.map((item) => item.endpoint).join("\n")} />
      <MemberShell
        primary={[
          { href: "/app", label: pestañas[0] ?? "" },
          { href: "/app/agenda", label: t("T-1661") },
          {
            href: "/app/carnet",
            label: pestañas.find((name) => RUTAS[name] === "/app/carnet") ?? t("T-131"),
          },
          { href: "/app/gh-points", label: t("T-080") },
        ]}
        groups={groups}
        theme={<ThemeToggle etiquetas={[temaOscuro, temaClaro]} />}
        account={
          <form action={signOutAction}>
            <button type="submit" className="boton-secundario">
              {t("T-231")}
            </button>
          </form>
        }
      >
        {actor.membershipStatus === "ON_LEAVE" ? (
          <output className="mb-6 block rounded-xl border border-borde bg-fondo-suave p-4">
            {t("T-2040")}
          </output>
        ) : null}
        {children}
      </MemberShell>
    </>
  );
}
