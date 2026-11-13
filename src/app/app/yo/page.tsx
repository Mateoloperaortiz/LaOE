import type { Metadata } from "next";
import type { ReactNode } from "react";
import { adminAreaRoles } from "@/app/_authz/admin-area";
import { requireActor } from "@/modules/identity";
import { SignOutForm } from "@/modules/identity/components/SignOutForm";
import { balanceFor } from "@/modules/participation";
import { getMyMembership } from "@/modules/people";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";

// «Yo» (ADR-160 regla 1): recoge lo que estaba en «Más», más GH Points con su saldo y el enlace a la
// Operación para quien tiene un rol (ADR-049). Solo enlaces: cada destino conserva su pantalla.

export const metadata: Metadata = { title: tList("T-4872")[4] };

type Row = { href: string; label: string; detail?: string | undefined };

function Group({
  id,
  title,
  rows,
  footer,
}: {
  id: string;
  title: string;
  rows: Row[];
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="titulo-seccion">
        {title}
      </h2>
      <ul className="flex list-none flex-col rounded-tarjeta border border-superficie-borde bg-superficie p-1 sombra-flota">
        {rows.map((row) => (
          <li key={row.href}>
            <Link
              href={row.href}
              className="flex min-h-12 items-center gap-3 rounded-control px-3 py-2 text-titulo no-underline hover:bg-relleno"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{row.label}</span>
                {row.detail ? (
                  <span className="text-secundario text-tinta-secundaria">{row.detail}</span>
                ) : null}
              </span>
              <ChevronRightIcon size={16} className="shrink-0 text-tinta-secundaria" />
            </Link>
          </li>
        ))}
      </ul>
      {footer}
    </section>
  );
}

export default async function YoPage() {
  const actor = await requireActor("/app/yo");
  const [mine, roles] = await Promise.all([getMyMembership(actor.personId), adminAreaRoles(actor)]);
  const saldo = mine.term ? await balanceFor(actor.personId, mine.term.id) : null;
  const [
    ,
    ,
    comites,
    personas,
    egresados,
    ghPoints,
    permanencia,
    solicitudes,
    convocatorias,
    normativa,
    carnet,
    ajustes,
    ,
    fotos,
  ] = tList("T-061");
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{actor.name}</h1>
        {mine.term ? (
          <p className="text-secundario text-tinta-secundaria">{mine.term.code}</p>
        ) : null}
      </header>
      <Group
        id="yo-participacion"
        title={t("T-1665")}
        rows={[
          {
            href: "/app/gh-points",
            label: ghPoints,
            detail: saldo === null ? undefined : t("T-4877", { n: saldo }),
          },
          { href: "/app/permanencia", label: permanencia },
          { href: "/app/solicitudes", label: solicitudes },
          { href: "/app/convocatorias", label: convocatorias },
          { href: "/app/carnet", label: carnet },
          { href: "/app/normativa", label: normativa },
        ]}
      />
      <Group
        id="yo-comunidad"
        title={t("T-1664")}
        rows={[
          { href: "/app/comites", label: comites },
          { href: "/app/personas", label: personas },
          { href: "/app/disponibilidad", label: t("T-4600") },
          { href: "/app/egresados", label: egresados },
          { href: "/app/fotos", label: fotos },
        ]}
      />
      <Group
        id="yo-cuenta"
        title={t("T-1666")}
        rows={[
          { href: "/app/ajustes", label: ajustes },
          ...(roles.any ? [{ href: "/admin", label: t("T-236") }] : []),
        ]}
        footer={
          <SignOutForm>
            <button type="submit" className="boton-secundario self-start">
              {t("T-231")}
            </button>
          </SignOutForm>
        }
      />
    </div>
  );
}
