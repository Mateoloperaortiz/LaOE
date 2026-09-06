/** Origen efectivo de las URL S3 prefirmadas, compartido por la CSP y la verificación (ADR-039). */
export function bucketOrigin(input: {
  endpoint: string;
  bucket: string;
  forcePathStyle: boolean;
}): string {
  const url = new URL(input.endpoint);
  if (!input.forcePathStyle) {
    url.hostname = `${input.bucket}.${url.hostname}`;
  }
  return url.origin;
}
