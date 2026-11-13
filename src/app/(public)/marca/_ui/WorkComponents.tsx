import { AppLink } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { BatchBar } from "@/shared/ui/BatchBar";
import { BottomSheet } from "@/shared/ui/BottomSheet";
import { Button, buttonClass } from "@/shared/ui/Button";
import { chipClass } from "@/shared/ui/Chip";
import { Checkbox, RadioGroup, Switch } from "@/shared/ui/Choice";
import { DetailPanel } from "@/shared/ui/DetailPanel";
import { ErrorSummary } from "@/shared/ui/ErrorSummary";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import { ChevronRightIcon } from "@/shared/ui/icons/ChevronRightIcon";
import { IdIcon } from "@/shared/ui/icons/IdIcon";
import { MaximizeIcon } from "@/shared/ui/icons/MaximizeIcon";
import { PencilIcon } from "@/shared/ui/icons/PencilIcon";
import { ListShortcuts } from "@/shared/ui/ListShortcuts";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";
import { SplitView } from "@/shared/ui/SplitView";
import { Surface } from "@/shared/ui/Surface";
import { WorkTable, type WorkTableDensity } from "@/shared/ui/WorkTable";

// Componentes de trabajo del tramo R6-B en el muestrario (solo en desarrollo). Datos ficticios y cadenas
// fijas, como el resto de /marca. La URL lleva el estado: densidad, orden, registro abierto y hoja.

type Persona = {
  id: string;
  nombre: string;
  comites: string;
  membresia: string;
  activacion: { texto: string; tono: "exito" | "aviso" };
  permanencia: number | null;
};

const PERSONAS: Persona[] = [
  {
    id: "valeria",
    nombre: "Valeria Ochoa Restrepo",
    comites: "GEMIS",
    membresia: "Activa",
    activacion: { texto: "Activada", tono: "exito" },
    permanencia: 62,
  },
  {
    id: "santiago",
    nombre: "Santiago Restrepo Zapata",
    comites: "A3 · GEMIS",
    membresia: "Activo",
    activacion: { texto: "Activada", tono: "exito" },
    permanencia: 81,
  },
  {
    id: "juliana",
    nombre: "Juliana Zapata Arango",
    comites: "Agro",
    membresia: "En licencia",
    activacion: { texto: "Activada", tono: "exito" },
    permanencia: null,
  },
  {
    id: "andres",
    nombre: "Andrés Gil",
    comites: "Conexión",
    membresia: "Activo",
    activacion: { texto: "Sin activar", tono: "aviso" },
    permanencia: 0,
  },
  {
    id: "mariana",
    nombre: "Mariana López",
    comites: "Visión",
    membresia: "Activa",
    activacion: { texto: "Activada", tono: "exito" },
    permanencia: 74,
  },
  {
    id: "samuel",
    nombre: "Samuel Arango",
    comites: "Pixel",
    membresia: "Activo",
    activacion: { texto: "Sin activar", tono: "aviso" },
    permanencia: 20,
  },
];

export type WorkParams = {
  densidad?: string;
  orden?: string;
  dir?: string;
  registro?: string;
  hoja?: string;
};

function href(
  params: WorkParams,
  change: Partial<Record<keyof WorkParams, string | null>>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...change })) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return `/marca${query ? `?${query}` : ""}#trabajo`;
}

export function WorkComponents({ params }: { params: WorkParams }) {
  const density: WorkTableDensity = params.densidad === "compacta" ? "compacta" : "comoda";
  const orden = params.orden === "permanencia" ? "permanencia" : "nombre";
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
  const sorted = [...PERSONAS].sort((a, b) => {
    const value =
      orden === "nombre"
        ? a.nombre.localeCompare(b.nombre, "es")
        : (a.permanencia ?? -1) - (b.permanencia ?? -1);
    return dir === "asc" ? value : -value;
  });
  const abierta = PERSONAS.find((persona) => persona.id === params.registro) ?? null;
  const sortFor = (key: "nombre" | "permanencia") => ({
    href: href(params, { orden: key, dir: orden === key && dir === "asc" ? "desc" : "asc" }),
    direction: orden === key ? dir : null,
  });

  return (
    <div className="flex flex-col gap-4">
      <div
        data-densidad="escritorio"
        className="fondo-sobrio flex flex-col gap-3 rounded-marco p-3"
      >
        <p className="etiqueta-corta px-2 text-tinta-sobre-fondo">
          Operación · tabla de trabajo, vista dividida y lote
        </p>
        <section className="flex flex-col gap-4 rounded-marco border border-superficie-borde bg-superficie p-5 text-tinta sombra-flota">
          <ScreenHeader
            trail={[{ label: "Operación" }, { label: "Personas" }]}
            trailLabel="Ruta"
            title="Miembros · 2026-2"
            description={`${PERSONAS.length} personas en esta vista · J y K para moverte, X para marcar`}
            actions={
              <nav aria-label="Densidad" className="flex gap-1.5">
                <AppLink
                  href={href(params, { densidad: null })}
                  scroll={false}
                  aria-current={density === "comoda" ? "true" : undefined}
                  className={chipClass({ area: "operacion", selected: density === "comoda" })}
                >
                  Cómoda
                </AppLink>
                <AppLink
                  href={href(params, { densidad: "compacta" })}
                  scroll={false}
                  aria-current={density === "compacta" ? "true" : undefined}
                  className={chipClass({ area: "operacion", selected: density === "compacta" })}
                >
                  Compacta
                </AppLink>
              </nav>
            }
          />
          <ListShortcuts>
            <SplitView
              narrow="detail"
              list={
                <div className="flex flex-col gap-3">
                  <WorkTable
                    caption="Personas de la vista Miembros · 2026-2"
                    density={density}
                    selection={{ form: "lote-marca", name: "ids", allLabel: "Seleccionar todas" }}
                    columns={[
                      { key: "nombre", label: "Persona", sort: sortFor("nombre") },
                      { key: "comites", label: "Comités" },
                      { key: "membresia", label: "Membresía" },
                      { key: "activacion", label: "Activación" },
                      {
                        key: "permanencia",
                        label: "Permanencia",
                        numeric: true,
                        sort: sortFor("permanencia"),
                      },
                    ]}
                    rows={sorted.map((persona) => ({
                      id: persona.id,
                      current: persona.id === abierta?.id,
                      selectLabel: `Seleccionar a ${persona.nombre}`,
                      cells: {
                        nombre: (
                          <AppLink
                            href={href(params, { registro: persona.id })}
                            scroll={false}
                            className="font-semibold text-tinta no-underline hover:underline"
                          >
                            {persona.nombre}
                          </AppLink>
                        ),
                        comites: persona.comites,
                        membresia: persona.membresia,
                        activacion: (
                          <Badge tone={persona.activacion.tono}>{persona.activacion.texto}</Badge>
                        ),
                        permanencia:
                          persona.permanencia === null ? "—" : `${persona.permanencia} %`,
                      },
                    }))}
                  />
                  <BatchBar
                    form="lote-marca"
                    name="ids"
                    countLabel={{ one: "{n} seleccionada", other: "{n} seleccionadas" }}
                  >
                    <Button area="operacion" size="compacto" onFloating>
                      Emitir enlaces de activación
                    </Button>
                    <Button area="operacion" size="compacto" variant="secundaria" onFloating>
                      Agregar etiqueta
                    </Button>
                  </BatchBar>
                </div>
              }
              detail={
                abierta ? (
                  <DetailPanel
                    title={abierta.nombre}
                    eyebrow="Vista rápida"
                    closeHref={href(params, { registro: null })}
                    closeLabel="Cerrar la vista rápida"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={abierta.activacion.tono}>{abierta.activacion.texto}</Badge>
                      <Badge>{abierta.membresia}</Badge>
                    </div>
                    <dl className="m-0 grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-etiqueta text-tinta-secundaria">Comités</dt>
                        <dd className="m-0 font-medium">{abierta.comites}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-etiqueta text-tinta-secundaria">Permanencia</dt>
                        <dd className="m-0 font-medium">
                          {abierta.permanencia === null ? "—" : `${abierta.permanencia} % de 70 %`}
                        </dd>
                      </div>
                    </dl>
                    <Field
                      id="nota-marca"
                      label="Nota para GH"
                      help="Queda en la línea de tiempo de la persona."
                    >
                      <TextArea id="nota-marca" name="nota" rows={3} />
                    </Field>
                    <Switch
                      id="aviso-marca"
                      name="aviso"
                      label="Avisarle por correo"
                      defaultChecked
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button area="operacion">
                        <MaximizeIcon size={15} />
                        Abrir la ficha
                      </Button>
                      <Button area="operacion" variant="secundaria">
                        <PencilIcon size={15} />
                        Editar
                      </Button>
                    </div>
                  </DetailPanel>
                ) : null
              }
            />
          </ListShortcuts>
        </section>
      </div>

      <div className="fondo-sobrio grid gap-4 rounded-marco p-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="etiqueta-corta text-tinta-sobre-fondo">Mi OE · campos sobre el fondo</p>
          <ErrorSummary
            title="Revisa dos datos"
            errors={[
              { field: "codigo-marca", message: "El código tiene 6 dígitos" },
              { field: "comite-marca", message: "Elige un comité" },
            ]}
          />
          <Field
            id="codigo-marca"
            label="Código de la reunión"
            help="Está en la pantalla de la reunión."
            error="El código tiene 6 dígitos. Míralo en la pantalla de la reunión."
          >
            <TextInput id="codigo-marca" name="codigo" inputMode="numeric" defaultValue="48219" />
          </Field>
          <Field id="comite-marca" label="Comité" error="Elige un comité.">
            <Select id="comite-marca" name="comite" defaultValue="">
              <option value="">Elige uno</option>
              <option value="gemis">GEMIS</option>
              <option value="pixel">Pixel</option>
            </Select>
          </Field>
          <Field id="nombre-marca" label="Nombre para mostrar">
            <TextInput id="nombre-marca" name="nombre" placeholder="Como te dicen en la OE" />
          </Field>
        </div>
        <Surface className="flex flex-col gap-2 p-5">
          <p className="titulo-tarjeta">Ajustes de avisos</p>
          <Switch
            id="push-marca"
            name="push"
            label="Avisos en el celular"
            help="Recordatorios de tus reuniones."
            defaultChecked
          />
          <Checkbox id="correo-marca" name="correo" label="Campañas por correo" />
          <RadioGroup
            legend="Cuándo recordarte"
            name="recordatorio-marca"
            defaultValue="vispera"
            options={[
              { value: "vispera", label: "La víspera" },
              { value: "dia", label: "El mismo día", help: "A las 7:00 a. m." },
            ]}
          />
          <AppLink
            href={href(params, { hoja: "asistencia" })}
            scroll={false}
            className={buttonClass({ className: "mt-2" })}
          >
            <IdIcon size={18} />
            Registrar asistencia
          </AppLink>
        </Surface>
      </div>

      {params.hoja === "asistencia" ? (
        <BottomSheet
          title="Registrar asistencia"
          description="Reunión de GEMIS · hasta las 5:15 p. m."
          closeHref={href(params, { hoja: null })}
          closeLabel="Cerrar"
        >
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {[
              "Escanear el QR de la reunión",
              "Escribir el código de 6 dígitos",
              "Mostrar mi carnet al anfitrión",
            ].map((opcion) => (
              <li key={opcion}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-control bg-relleno px-4 text-left font-semibold text-titulo"
                >
                  {opcion}
                  <ChevronRightIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      ) : null}
    </div>
  );
}
