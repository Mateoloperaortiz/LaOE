type Props = {
  /** Valor alcanzado, en la misma unidad que `maximo`. */
  valor: number;
  maximo: number;
  /** Marca del umbral (por ejemplo, el 60 % de permanencia); opcional. */
  umbral?: number | undefined;
  /** Nombre accesible de la barra (qué mide): el criterio o el comité. */
  nombre: string;
  /** Texto accesible del valor ("45 de 60 por ciento"); si falta, se usa `valor de maximo`. */
  etiqueta?: string | undefined;
  /** Con el umbral alcanzado la barra va en amarillo; por debajo, en azul; en rojo nunca (marca). */
  className?: string | undefined;
};

// Barra de progreso de la marca (fase 4): sobre la tinta suave, relleno azul o amarillo según se
// alcance el umbral, y una marca vertical navy en el umbral. Solo tokens; funciona en claro y oscuro.
export function Progreso({ valor, maximo, umbral, nombre, etiqueta, className = "" }: Props) {
  const max = maximo > 0 ? maximo : 1;
  const ancho = Math.max(0, Math.min(100, (valor / max) * 100));
  const marca = umbral === undefined ? null : Math.max(0, Math.min(100, (umbral / max) * 100));
  const alcanzado = umbral !== undefined && valor >= umbral;
  return (
    <div
      role="progressbar"
      aria-label={nombre}
      aria-valuemin={0}
      aria-valuemax={Math.round(maximo)}
      aria-valuenow={Math.round(valor)}
      aria-valuetext={etiqueta ?? `${Math.round(valor)} de ${Math.round(maximo)}`}
      className={`relative h-3 w-full overflow-hidden rounded-full bg-borde ${className}`}
    >
      <div
        className={`h-full rounded-full ${alcanzado ? "bg-oe-yellow" : "bg-oe-blue"}`}
        style={{ width: `${ancho}%` }}
      />
      {marca !== null ? (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-tinta"
          style={{ left: `calc(${marca}% - 1px)` }}
        />
      ) : null}
    </div>
  );
}
