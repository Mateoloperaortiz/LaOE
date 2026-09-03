type Props = {
  slug: string;
  name: string;
  size?: number;
  className?: string;
};

// Los 27 logos de comités son SVG monocromos: se tintan con currentColor.
export function LogoComite({ slug, name, size = 64, className = "" }: Props) {
  const url = `/logos/committees/${slug}.svg`;
  return (
    <span
      role="img"
      aria-label={name}
      className={`logo-mascara ${className}`}
      style={{
        width: size,
        height: size,
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
      }}
    />
  );
}
