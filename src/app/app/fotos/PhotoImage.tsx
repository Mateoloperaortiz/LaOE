"use client";

import { useState } from "react";
import type { GalleryPhoto } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { photoSource, photoSources } from "./photo-source";
import styles from "./photos.module.css";

export function PhotoImage({
  photo,
  sizes,
  eager = false,
}: {
  photo: GalleryPhoto;
  sizes: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className={styles.imageError} role="img" aria-label={photo.alt}>
        {t("T-3292")}
      </span>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: la ruta privada ya sirve variantes saneadas; el optimizador no reenvía la sesión.
    <img
      src={photoSource(photo, eager ? 1600 : 480)}
      srcSet={photoSources(photo)}
      sizes={sizes}
      alt={photo.alt}
      width={photo.width}
      height={photo.height}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
