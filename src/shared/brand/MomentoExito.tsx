import { VibrarUnaVez } from "@/shared/ui/VibrarUnaVez";
import { SelloOE } from "./SelloOE";

// Momento de marca (ADR-160 regla 5, plan maestro §4.4): el sello «¡OE OE OE!» grande que cierra un
// éxito de la persona —la asistencia registrada, el reto aprobado, la insignia nueva—, con una entrada
// breve y una vibración que salen solo sin movimiento reducido. La vibración suena una vez por `clave`.

type Props = {
  clave: string;
  tamano?: "md" | "lg";
  className?: string;
};

export function MomentoExito({ clave, tamano = "lg", className = "" }: Props) {
  return (
    <div className={`py-2 ${className}`.trim()}>
      <SelloOE tamano={tamano} />
      <VibrarUnaVez clave={clave} />
    </div>
  );
}
