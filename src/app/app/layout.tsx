import { redirect } from "next/navigation";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { listSubscriptionsFor } from "@/modules/comms";
import { PwaRegistrar } from "@/modules/comms/components/PwaRegistrar";
import { requireActor } from "@/modules/identity";
import { SignOutForm } from "@/modules/identity/components/SignOutForm";
import { hasLiveConsent } from "@/modules/people";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { CalendarEventFilledIcon } from "@/shared/ui/icons/CalendarEventFilledIcon";
import { CalendarEventIcon } from "@/shared/ui/icons/CalendarEventIcon";
import { DeviceGamepad2FilledIcon } from "@/shared/ui/icons/DeviceGamepad2FilledIcon";
import { DeviceGamepad2Icon } from "@/shared/ui/icons/DeviceGamepad2Icon";
import { HomeFilledIcon } from "@/shared/ui/icons/HomeFilledIcon";
import { HomeIcon } from "@/shared/ui/icons/HomeIcon";
import { IdFilledIcon } from "@/shared/ui/icons/IdFilledIcon";
import { IdIcon } from "@/shared/ui/icons/IdIcon";
import { StarFilledIcon } from "@/shared/ui/icons/StarFilledIcon";
import { StarIcon } from "@/shared/ui/icons/StarIcon";
import { MemberShell } from "./_ui/MemberShell";
import "./member.css";

// Mi OE incluye la consulta y la autogestión de miembros en licencia.
const RUTAS: Record<string, string> = {
  Inicio: "/app",
  Comités: "/app/comites",
  Personas: "/app/personas",
  Egresados: "/app/egresados",
  Fotos: "/app/fotos",
  "GH Points": "/app/gh-points",
  Permanencia: "/app/permanencia",
  Solicitudes: "/app/solicitudes",
  Convocatorias: "/app/convocatorias",
  Normativa: "/app/normativa",
  Carnet: "/app/carnet",
  Ajustes: "/app/ajustes",
  Juegos: "/app/juegos",
};

// Lado de los iconos de la barra: no acompañan a una línea de texto, van sobre ella (ADR-076 regla 3).
const TAB_ICON = 22;

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const actor = await requireActor("/app");
  // ADR-048: sin autorización viva, la persona pasa primero por la pantalla de autorización.
  if (!(await hasLiveConsent(actor.personId, "MEMBERSHIP"))) {
    redirect("/autorizacion");
  }
  const [devices, roles] = await Promise.all([
    listSubscriptionsFor(actor.personId),
    adminAreaRoles(actor),
  ]);
  const [temaOscuro, temaClaro] = tList("T-034");
  const pestañas = tList("T-061").filter((nombre) => nombre in RUTAS);
  const groups = [
    { label: t("T-1664"), names: ["Comités", "Personas", "Egresados", "Fotos"] },
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
        canAccessAdmin={roles.any}
        primary={[
          {
            href: "/app",
            label: pestañas[0] ?? "",
            icon: <HomeIcon size={TAB_ICON} />,
            iconActive: <HomeFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/agenda",
            label: t("T-1661"),
            icon: <CalendarEventIcon size={TAB_ICON} />,
            iconActive: <CalendarEventFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/carnet",
            label: pestañas.find((name) => RUTAS[name] === "/app/carnet") ?? t("T-131"),
            icon: <IdIcon size={TAB_ICON} />,
            iconActive: <IdFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/gh-points",
            label: t("T-080"),
            icon: <StarIcon size={TAB_ICON} />,
            iconActive: <StarFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/juegos",
            label: t("T-2621"),
            icon: <DeviceGamepad2Icon size={TAB_ICON} />,
            iconActive: <DeviceGamepad2FilledIcon size={TAB_ICON} />,
          },
        ]}
        groups={groups}
        theme={<ThemeToggle etiquetas={[temaOscuro, temaClaro]} />}
        account={
          <SignOutForm>
            <button type="submit" className="boton-secundario">
              {t("T-231")}
            </button>
          </SignOutForm>
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
