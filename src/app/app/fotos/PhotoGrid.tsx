"use client";

import type { CSSProperties } from "react";
import type { GalleryPhoto } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { MaximizeIcon } from "@/shared/ui/icons/MaximizeIcon";
import { PhotoImage } from "./PhotoImage";
import styles from "./photos.module.css";

export function PhotoGrid({
  photos,
  onOpen,
}: {
  photos: GalleryPhoto[];
  onOpen: (index: number, trigger: HTMLButtonElement) => void;
}) {
  return (
    <ul className={styles.photoGrid}>
      {photos.map((photo, index) => (
        <li
          key={photo.id}
          className={styles.photoTile}
          style={{ "--photo-ratio": photo.width / photo.height } as CSSProperties}
        >
          <button
            type="button"
            aria-label={t("T-3284", { n: index + 1 })}
            aria-haspopup="dialog"
            onClick={(event) => onOpen(index, event.currentTarget)}
          >
            <PhotoImage
              photo={photo}
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 360px"
            />
            <span className={styles.expand}>
              <MaximizeIcon />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
