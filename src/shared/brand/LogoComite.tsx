type Props = {
  slug: string;
  name: string;
  /** Alto en píxeles; la caja es apaisada (2,2 veces el alto) porque varios logos son anchos. */
  size?: number;
  className?: string;
};

// Los 27 logos de comités son SVG monocromos: se tintan con currentColor y se alinean a la izquierda.
export function LogoComite({ slug, name, size = 64, className = "" }: Props) {
  const url = `/logos/committees/${slug}.svg`;
  return (
    <span
      role="img"
      aria-label={name}
      className={`logo-mascara ${className}`}
      style={{
        width: Math.round(size * 2.2),
        height: size,
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskPosition: "left center",
        WebkitMaskPosition: "left center",
      }}
    />
  );
}
