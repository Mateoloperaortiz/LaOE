"use client";

import Link from "next/link";
import type { GalleryAlbum } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { ArrowUpRightIcon } from "@/shared/ui/icons/ArrowUpRightIcon";
import { PhotoImage } from "./PhotoImage";
import styles from "./photos.module.css";

export function AlbumCards({
  albums,
  collectionSlug,
}: {
  albums: GalleryAlbum[];
  collectionSlug: string;
}) {
  return (
    <ul className={styles.albumGrid}>
      {albums.map((album) => (
        <li key={album.id}>
          <Link
            href={`/app/fotos/${encodeURIComponent(collectionSlug)}/${encodeURIComponent(album.slug)}`}
            prefetch={false}
            className={styles.album}
            aria-label={t("T-3285", { album: album.title })}
          >
            <span className={styles.albumPicture}>
              {album.cover ? (
                <PhotoImage
                  photo={album.cover}
                  sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 360px"
                />
              ) : null}
              <span className={styles.albumArrow}>
                <ArrowUpRightIcon />
              </span>
            </span>
            <span className={styles.albumName}>{album.title}</span>
            <span className={styles.albumMeta}>
              {album.caption ? <span>{album.caption}</span> : null}
              <span>{t("T-3282", { n: album.photoCount.toLocaleString("es-CO") })}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
