import { redirect } from "next/navigation";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { listSubscriptionsFor } from "@/modules/comms";
import { PwaRegistrar } from "@/modules/comms/components/PwaRegistrar";
import { requireSignedIn } from "@/modules/identity";
import { hasLiveConsent } from "@/modules/people";
import { ThemeToggle } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { BriefcaseIcon } from "@/shared/ui/icons/BriefcaseIcon";
import { CalendarEventFilledIcon } from "@/shared/ui/icons/CalendarEventFilledIcon";
import { CalendarEventIcon } from "@/shared/ui/icons/CalendarEventIcon";
import { DeviceGamepad2FilledIcon } from "@/shared/ui/icons/DeviceGamepad2FilledIcon";
import { DeviceGamepad2Icon } from "@/shared/ui/icons/DeviceGamepad2Icon";
import { HeartHandshakeIcon } from "@/shared/ui/icons/HeartHandshakeIcon";
import { HomeFilledIcon } from "@/shared/ui/icons/HomeFilledIcon";
import { HomeIcon } from "@/shared/ui/icons/HomeIcon";
import { QrcodeIcon } from "@/shared/ui/icons/QrcodeIcon";
import { UserFilledIcon } from "@/shared/ui/icons/UserFilledIcon";
import { UserIcon } from "@/shared/ui/icons/UserIcon";
import { UsersGroupIcon } from "@/shared/ui/icons/UsersGroupIcon";
import { MemberShell } from "./_ui/MemberShell";
import "./member.css";

// Lo que «Yo» recoge (ADR-160 regla 1): en esas rutas, la pestaña activa es «Yo».
const YO_ROUTES = [
  "/app/comites",
  "/app/personas",
  "/app/egresados",
  "/app/padrinos",
  "/app/oportunidades",
  "/app/fotos",
  "/app/disponibilidad",
  "/app/gh-points",
  "/app/permanencia",
  "/app/solicitudes",
  "/app/convocatorias",
  "/app/normativa",
  "/app/ajustes",
  "/app/semestre",
  "/app/encuestas",
];

// Lado de los iconos de la barra: no acompañan a una línea de texto, van sobre ella (ADR-076 regla 3).
const TAB_ICON = 22;

/** La barra de un egresado (ADR-184 regla 5): su red, sus oportunidades, sus ahijados y lo suyo. */
function alumniTabs() {
  const [red, oportunidades, padrinos, tu] = tList("T-5008");
  return [
    {
      href: "/app/egresados",
      label: red,
      icon: <UsersGroupIcon size={TAB_ICON} />,
      iconActive: <UsersGroupIcon size={TAB_ICON} />,
    },
    {
      href: "/app/oportunidades",
      label: oportunidades,
      icon: <BriefcaseIcon size={TAB_ICON} />,
      iconActive: <BriefcaseIcon size={TAB_ICON} />,
    },
    {
      href: "/app/padrinos",
      label: padrinos,
      icon: <HeartHandshakeIcon size={TAB_ICON} />,
      iconActive: <HeartHandshakeIcon size={TAB_ICON} />,
    },
    {
      href: "/app/ajustes",
      label: tu,
      icon: <UserIcon size={TAB_ICON} />,
      iconActive: <UserFilledIcon size={TAB_ICON} />,
      also: ["/app/yo/trayectoria", "/app/avisos"],
    },
  ];
}

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  // El marco no conoce la ruta: cada página dice la suya con `requireActor`, que es la que lleva a un
  // egresado a su red (ADR-184 regla 4).
  const actor = await requireSignedIn("/app");
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
        canAccessAdmin={actor.access === "MEMBER" && roles.any}
        tabs={
          actor.access === "ALUMNI"
            ? alumniTabs()
            : [
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
              ]
        }
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
