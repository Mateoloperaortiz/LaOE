import type { Metadata } from "next";
import { requireActor } from "@/modules/identity";
import { LectorAsistencia } from "@/modules/participation/components/LectorAsistencia";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { buttonClass } from "@/shared/ui/Button";

// «Asistencia», el botón central de Mi OE (ADR-160 reglas 1 y 4): leer el QR de la ocasión, que abre
// la pantalla de registro de siempre (`/a/<id público>`, con su código rotativo si lo pide), o mostrar
// el carnet para que quien registra lo escanee. No lista ocasiones con enlace directo: el QR es la
// prueba de que la persona está ahí, y saltárselo cambiaría cómo se valida un registro.

export const metadata: Metadata = { title: tList("T-4872")[2] };

export default async function AttendancePage() {
  await requireActor("/app/asistencia");
  const [, , asistencia] = tList("T-4872");
  const [qrTitle, qrText] = tList("T-4874");
  const [carnetTitle, carnetText, carnetLink] = tList("T-4876");
  const [scan, stop, upload] = tList("T-4879");
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="titulo-pantalla">{asistencia}</h1>
        <p className="text-tinta-secundaria">{t("T-4873")}</p>
      </header>
      <section
        aria-labelledby="asistencia-qr"
        className="flex flex-col gap-3 rounded-tarjeta border border-superficie-borde bg-superficie p-5 sombra-flota"
      >
        <h2 id="asistencia-qr" className="titulo-seccion">
          {qrTitle}
        </h2>
        <p className="text-secundario text-tinta-secundaria">{qrText}</p>
        <LectorAsistencia
          labels={{
            scan,
            stop,
            upload,
            cameraError: t("T-4880"),
            photoError: t("T-4881"),
            scanError: t("T-4882"),
            notOccasion: t("T-4875"),
          }}
        />
      </section>
      <section
        aria-labelledby="asistencia-carnet"
        className="flex flex-col items-start gap-3 rounded-tarjeta border border-superficie-borde bg-superficie p-5 sombra-flota"
      >
        <h2 id="asistencia-carnet" className="titulo-seccion">
          {carnetTitle}
        </h2>
        <p className="text-secundario text-tinta-secundaria">{carnetText}</p>
        <Link href="/app/carnet" className={buttonClass({ variant: "secundaria" })}>
          {carnetLink}
        </Link>
      </section>
    </div>
  );
}
