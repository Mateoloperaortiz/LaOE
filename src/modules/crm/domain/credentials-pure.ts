// El enlace de LinkedIn para agregar una credencial como licencia o certificación (ADR-171 regla 4).
// La casa no se conecta con LinkedIn: arma el enlace y la persona lo abre.

export function linkedInAddUrl(input: {
  title: string;
  organization: string;
  publishedAt: Date;
  url: string;
  certId: string;
}): string {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: input.title,
    organizationName: input.organization,
    issueYear: String(input.publishedAt.getUTCFullYear()),
    issueMonth: String(input.publishedAt.getUTCMonth() + 1),
    certUrl: input.url,
    certId: input.certId,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}
