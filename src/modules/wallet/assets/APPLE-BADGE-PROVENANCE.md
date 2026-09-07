# Candidato de badge Apple para La OE

Archivo `apple-wallet-badge.svg`: copia sin modificar del SVG español (México), que muestra «Agregar a Apple Wallet», distribuido públicamente por The Wallet Crew en `@neostore/cinto@1.0.98`, entrada `package/dist/apple/es-MX.svg`.

- Distribución: https://registry.npmjs.org/@neostore/cinto/-/cinto-1.0.98.tgz
- Archivo directo de la misma versión: https://cdn.jsdelivr.net/npm/@neostore/cinto@1.0.98/dist/apple/es-MX.svg
- Distribuidor declarado en package.json: Cyril DURAND - CTO, The Wallet Crew, https://www.thewalletcrew.io .
- Guía Apple de artes: https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/
- SHA-256 del SVG: f49a464ad965be2f5cbe2f7333ffa132e7714d4f8a050ce8c906ff5881ea476a
- Integridad npm del tarball: sha512-Bb/K4hNb4FRtuBWtbhJCPpXwyj0VILvuJC9FvmfVNQr2kXjG98uZKndujC77u4s8ZgxIOQPwW30fkUXYN5u8nw==

## Alcance de la verificación

El paquete conserva las 45 localizaciones del set Apple y el identificador SVG `Artwork`; la distribución está optimizada con SVGO y no conserva el comentario Adobe ni otros metadatos del original. El badge coreano de esta misma distribución se contrastó con la copia pública de Apple `https://developer.apple.com/assets/elements/badges/add-to-apple-wallet/add-to-apple-wallet-kr.svg` (que declara Adobe Illustrator 25.4.1). Ambos usan geometría y paleta del mismo arte. Renderizados a 4x, la diferencia media por canal es 0.01346 sobre 255, atribuible a la optimización geométrica y el rasterizado. El SVG español muestra el texto vectorial correspondiente; se inspeccionó su render.

La procedencia de la geometría del set está bien sustentada, pero **no se verificó igualdad byte a byte de este SVG español con el ZIP distribuido por Apple**. Debe describirse como distribución pública optimizada del arte Apple, no como extracción exacta del ZIP oficial. Si se exige el SVG español original sin optimización del distribuidor, sigue pendiente obtener el paquete original. No se aceptó el acuerdo de descarga ni se usó cuenta Apple.
