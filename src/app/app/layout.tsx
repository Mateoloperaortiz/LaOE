import { redirect } from "next/navigation";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { listSubscriptionsFor } from "@/modules/comms";
import { PwaRegistrar } from "@/modules/comms/components/PwaRegistrar";
import { requireActor } from "@/modules/identity";
import { hasLiveConsent } from "@/modules/people";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { CalendarEventFilledIcon } from "@/shared/ui/icons/CalendarEventFilledIcon";
import { CalendarEventIcon } from "@/shared/ui/icons/CalendarEventIcon";
import { DeviceGamepad2FilledIcon } from "@/shared/ui/icons/DeviceGamepad2FilledIcon";
import { DeviceGamepad2Icon } from "@/shared/ui/icons/DeviceGamepad2Icon";
import { HomeFilledIcon } from "@/shared/ui/icons/HomeFilledIcon";
import { HomeIcon } from "@/shared/ui/icons/HomeIcon";
import { QrcodeIcon } from "@/shared/ui/icons/QrcodeIcon";
import { UserFilledIcon } from "@/shared/ui/icons/UserFilledIcon";
import { UserIcon } from "@/shared/ui/icons/UserIcon";
import { MemberShell } from "./_ui/MemberShell";
import "./member.css";

// Lo que «Yo» recoge (ADR-160 regla 1): en esas rutas, la pestaña activa es «Yo».
const YO_ROUTES = [
  "/app/comites",
  "/app/personas",
  "/app/egresados",
  "/app/fotos",
  "/app/disponibilidad",
  "/app/gh-points",
  "/app/permanencia",
  "/app/solicitudes",
  "/app/convocatorias",
  "/app/normativa",
  "/app/ajustes",
];

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
  const [hoy, agenda, asistencia, juegos, yo] = tList("T-4872");
  const [welcomeTitle, welcomeText, welcomeButton] = tList("T-4878");
  return (
    <>
      <PwaRegistrar endpointsKey={devices.map((item) => item.endpoint).join("\n")} />
      <MemberShell
        canAccessAdmin={roles.any}
        tabs={[
          {
            href: "/app",
            label: hoy,
            icon: <HomeIcon size={TAB_ICON} />,
            iconActive: <HomeFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/agenda",
            label: agenda,
            icon: <CalendarEventIcon size={TAB_ICON} />,
            iconActive: <CalendarEventFilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/asistencia",
            label: asistencia,
            icon: <QrcodeIcon size={TAB_ICON} />,
            iconActive: <QrcodeIcon size={TAB_ICON} />,
            also: ["/app/carnet"],
            central: true,
          },
          {
            href: "/app/juegos",
            label: juegos,
            icon: <DeviceGamepad2Icon size={TAB_ICON} />,
            iconActive: <DeviceGamepad2FilledIcon size={TAB_ICON} />,
          },
          {
            href: "/app/yo",
            label: yo,
            icon: <UserIcon size={TAB_ICON} />,
            iconActive: <UserFilledIcon size={TAB_ICON} />,
            also: YO_ROUTES,
          },
        ]}
        welcome={{ title: welcomeTitle, text: welcomeText, button: welcomeButton }}
        theme={<ThemeToggle etiquetas={[temaOscuro, temaClaro]} />}
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
