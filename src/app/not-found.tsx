import Link from "next/link";
import { Elemento } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

export default function NotFound() {
  const [inicio] = tList("T-038");
  const [mensaje, accion] = t("T-032").split(". ");
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-start justify-center gap-6 px-4 py-16">
      <Elemento tipo="destello" className="size-16 text-oe-orange" />
      <h1 className="text-display-lg">{mensaje}.</h1>
      <Link href="/" className="boton-primario">
        {(accion ?? inicio).replace(/\.$/, "")}
      </Link>
    </main>
  );
}
