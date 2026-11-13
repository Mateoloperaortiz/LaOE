import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { single } from "@/app/_lib/search";
import { listReadyPublicMedia } from "@/modules/content";
import { listInstitutionalDirectory } from "@/modules/crm";
import { tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Banner } from "@/shared/ui/Banner";
import { Button } from "@/shared/ui/Button";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { EmptyState } from "@/shared/ui/States";
import { addUnitContactAction, createUnitAction, saveDirectoryEntryAction } from "./actions";

// El directorio institucional, del lado de la Presidencia (ADR-197 regla 3): crea dependencias, suma a
// su gente con su cargo y decide qué se publica. El correo solo sirve para no duplicar a la persona en
// el CRM: no se publica. La foto sale de la mediateca y exige la autorización de la persona.

const [titulo] = tList("T-5142");
export const metadata: Metadata = { title: titulo };

export default async function Page({ searchParams }: PageProps<"/admin/directorio-institucional">) {
  const roles = await requireAdminAreaRoles("/admin/directorio-institucional");
  if (!roles.boardSeats.some((item) => item.seat === "PRESIDENT" && item.as === "HOLDER")) {
    redirect("/admin");
  }
  const query = await searchParams;
  const [units, media] = await Promise.all([
    listInstitutionalDirectory({ publishedOnly: false }),
    listReadyPublicMedia(),
  ]);
  const [heading, intro, nuevaUnidad, nombreUnidad, crearUnidad, verEnMiOe] = tList("T-5142");
  const [nombre, apellido, correo, cargo, sumar] = tList("T-5144");
  const [funciones, atiende, publicado, autorizo, foto, sinFoto, guardar, vacio] = tList("T-5145");
  const error = single(query.error);

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={heading} description={intro} />
      <p className="text-sm">
        <Link href="/app/directorio-institucional">{verEnMiOe}</Link>
      </p>
      {error ? (
        <Banner tone="error" title={error} />
      ) : single(query.guardado) === "1" ? (
        <Banner tone="exito" title={tList("T-4302")[0]} />
      ) : null}
      <form action={createUnitAction} className="flex max-w-xl flex-wrap items-end gap-3">
        <h2 className="w-full text-display-md">{nuevaUnidad}</h2>
        <Field id="unidad-nombre" label={nombreUnidad ?? ""}>
          <TextInput id="unidad-nombre" name="name" required minLength={2} maxLength={120} />
        </Field>
        <Button type="submit" variant="secundaria" area="operacion">
          {crearUnidad}
        </Button>
      </form>
      {units.length === 0 ? <EmptyState title={vacio ?? ""} /> : null}
      {units.map((unit) => (
        <section
          key={unit.id}
          aria-labelledby={`unidad-${unit.id}`}
          className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde p-4"
        >
          <h2 id={`unidad-${unit.id}`} className="text-display-md">
            {unit.name}
          </h2>
          {unit.people.map((item) => (
            <form
              key={item.contactId}
              action={saveDirectoryEntryAction}
              className="flex flex-col gap-3 border-l-2 border-borde pl-3"
            >
              <h3 className="font-semibold">
                {item.fullName} · {item.role}
              </h3>
              <input type="hidden" name="contactId" value={item.contactId} />
              <Field id={`funciones-${item.contactId}`} label={funciones ?? ""}>
                <TextArea
                  id={`funciones-${item.contactId}`}
                  name="functions"
                  rows={2}
                  maxLength={2000}
                  defaultValue={item.functions}
                />
              </Field>
              <Field id={`atiende-${item.contactId}`} label={atiende ?? ""}>
                <TextArea
                  id={`atiende-${item.contactId}`}
                  name="handles"
                  rows={2}
                  maxLength={2000}
                  defaultValue={item.handles}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="published" defaultChecked={item.published} />
                {publicado}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="photoAuthorized"
                  defaultChecked={item.photoAuthorized}
                />
                {autorizo}
              </label>
              <Field id={`foto-${item.contactId}`} label={foto ?? ""}>
                <Select
                  id={`foto-${item.contactId}`}
                  name="photoAssetId"
                  defaultValue={item.photoAssetId ?? ""}
                >
                  <option value="">{sinFoto}</option>
                  {media.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secundaria" area="operacion" className="self-start">
                {guardar}
              </Button>
            </form>
          ))}
          <form action={addUnitContactAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={unit.id} />
            <Field id={`nombre-${unit.id}`} label={nombre ?? ""}>
              <TextInput id={`nombre-${unit.id}`} name="firstName" required maxLength={80} />
            </Field>
            <Field id={`apellido-${unit.id}`} label={apellido ?? ""}>
              <TextInput id={`apellido-${unit.id}`} name="lastName" required maxLength={80} />
            </Field>
            <Field id={`correo-${unit.id}`} label={correo ?? ""}>
              <TextInput
                id={`correo-${unit.id}`}
                name="email"
                type="email"
                required
                maxLength={254}
              />
            </Field>
            <Field id={`cargo-${unit.id}`} label={cargo ?? ""}>
              <TextInput
                id={`cargo-${unit.id}`}
                name="role"
                required
                minLength={2}
                maxLength={120}
              />
            </Field>
            <Button type="submit" variant="secundaria" area="operacion">
              {sumar}
            </Button>
          </form>
        </section>
      ))}
    </div>
  );
}
