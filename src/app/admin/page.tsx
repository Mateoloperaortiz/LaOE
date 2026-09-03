import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";

export default function AdminHome() {
  const secciones = tList("T-160");
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display-lg">{t("T-236")}</h1>
      <ul className="flex list-none flex-wrap gap-2 p-0">
        {secciones.map((nombre) => (
          <li key={nombre}>
            <Insignia fondo="sky">{nombre}</Insignia>
          </li>
        ))}
      </ul>
      <p className="text-tinta-suave">{t("T-240")}</p>
    </div>
  );
}
