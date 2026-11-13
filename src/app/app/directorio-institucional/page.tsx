import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { getPublicMediaRef, Imagen } from "@/modules/content";
import { listInstitutionalDirectory } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import { tList } from "@/shared/copy";

// El directorio institucional (ADR-197 regla 3): las personas de la Universidad con las que trabaja la
// OE, para saber a quién le corresponde cada asunto. Lo ve toda la OE; solo trae datos de trabajo, y la
// foto solo de quien autorizó publicarla.

const [titulo] = tList("T-5141");
export const metadata: Metadata = { title: titulo };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function Page({ searchParams }: PageProps<"/app/directorio-institucional">) {
  await requireActor("/app/directorio-institucional");
  const query = await searchParams;
  const q = (single(query.q) ?? "").trim().toLowerCase();
  const units = await listInstitutionalDirectory({ publishedOnly: true });
  const matches = (text: string) => q.length === 0 || text.toLowerCase().includes(q);
  const shown = units
    .map((unit) => ({
      ...unit,
      people: unit.people.filter((item) =>
        matches(`${unit.name} ${item.fullName} ${item.role} ${item.functions} ${item.handles}`),
      ),
    }))
    .filter((unit) => unit.people.length > 0);
  const photos = new Map(
    await Promise.all(
      shown
        .flatMap((unit) => unit.people)
        .flatMap((item) => (item.photoAssetId ? [item.photoAssetId] : []))
        .map(async (id) => [id, await getPublicMediaRef(id)] as const),
    ),
  );
  const [heading, intro, buscar, botonBuscar, vacio, funciones, atiende] = tList("T-5141");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{heading}</h1>
        <p className="text-secundario text-tinta-secundaria">{intro}</p>
      </header>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="etiqueta-corta">{buscar}</span>
          <input
            name="q"
            type="search"
            defaultValue={single(query.q) ?? ""}
            className="min-h-11 rounded-xl border border-borde bg-fondo px-3"
          />
        </label>
        <button type="submit" className="boton-secundario min-h-11 px-4">
          {botonBuscar}
        </button>
      </form>
      {shown.length === 0 ? <p className="text-tinta-secundaria">{vacio}</p> : null}
      {shown.map((unit) => (
        <section
          key={unit.id}
          aria-labelledby={`unidad-${unit.id}`}
          className="flex flex-col gap-3"
        >
          <h2 id={`unidad-${unit.id}`} className="titulo-seccion">
            {unit.name}
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
            {unit.people.map((item) => {
              const photo = item.photoAssetId ? photos.get(item.photoAssetId) : null;
              return (
                <li key={item.contactId} className="flex gap-3 rounded-tarjeta bg-superficie p-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-oe-sky">
                    {photo ? (
                      <Imagen
                        asset={photo}
                        alt={item.fullName}
                        sizes="56px"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-full w-full items-center justify-center font-semibold text-oe-navy"
                      >
                        {initials(item.fullName)}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 text-sm">
                    <p className="m-0 font-semibold">{item.fullName}</p>
                    <p className="m-0 text-tinta-secundaria">{item.role}</p>
                    {item.functions ? (
                      <p className="m-0">
                        <span className="font-semibold">{funciones}: </span>
                        {item.functions}
                      </p>
                    ) : null}
                    {item.handles ? (
                      <p className="m-0">
                        <span className="font-semibold">{atiende}: </span>
                        {item.handles}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
