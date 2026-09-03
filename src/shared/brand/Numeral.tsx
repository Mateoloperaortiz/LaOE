type Props = {
  valor: number | string;
  className?: string;
};

// Numerales de sección del manual: peso ligero y muy grande de la familia de títulos.
export function Numeral({ valor, className = "" }: Props) {
  const texto = typeof valor === "number" ? String(valor).padStart(2, "0") : valor;
  return (
    <span aria-hidden="true" className={`font-display font-extralight leading-none ${className}`}>
      {texto}
    </span>
  );
}
