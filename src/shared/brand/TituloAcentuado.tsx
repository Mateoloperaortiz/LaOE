type Props = {
  texto: string;
  /** Cuántas palabras finales van en el color de acento (recurso de portada, no de interfaz). */
  acento?: number;
  claseAcento?: string;
};

// Título con las últimas palabras en otro color de la paleta, como en los carteles del manual.
export function TituloAcentuado({ texto, acento = 2, claseAcento = "text-oe-orange" }: Props) {
  const palabras = texto.trim().split(/\s+/);
  const corte = Math.max(0, palabras.length - acento);
  const principio = palabras.slice(0, corte).join(" ");
  const final = palabras.slice(corte).join(" ");
  return (
    <>
      {principio ? (
        <>
          <span>{principio}</span>
          <br />
        </>
      ) : null}
      <span className={claseAcento}>{final}</span>
    </>
  );
}
