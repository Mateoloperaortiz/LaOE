"use client";

import { useEffect, useRef, useState } from "react";
import type { GalleryAlbumPage } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { ArrowLeftIcon } from "@/shared/ui/icons/ArrowLeftIcon";
import { LockIcon } from "@/shared/ui/icons/LockIcon";
import { PhotoGrid } from "./PhotoGrid";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./photos.module.css";

export function GalleryAlbum({ album }: { album: GalleryAlbumPage }) {
  const [photos, setPhotos] = useState(album.photos);
  const [page, setPage] = useState(album.page);
  const [totalPages, setTotalPages] = useState(album.totalPages);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewer, setViewer] = useState<{ index: number; trigger: HTMLButtonElement } | null>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  const loadMore = async () => {
    if (pending.current || page >= totalPages) return 0;
    pending.current = true;
    setLoading(true);
    setFailed(false);
    const request = new AbortController();
    controller.current = request;
    try {
      const collection = encodeURIComponent(album.collectionSlug);
      const slug = encodeURIComponent(album.slug);
      const response = await fetch(
        `/api/fotos/colecciones/${collection}/albumes/${slug}?pagina=${page + 1}`,
        { cache: "no-store", signal: request.signal },
      );
      if (!response.ok) throw new Error("gallery-page-unavailable");
      const next: GalleryAlbumPage = await response.json();
      if (!alive.current) return 0;
      setPhotos((current) => [...current, ...next.photos]);
      setPage(next.page);
      setTotalPages(next.totalPages);
      return next.photos.length;
    } catch {
      if (alive.current && !request.signal.aborted) setFailed(true);
      return 0;
    } finally {
      pending.current = false;
      if (alive.current) setLoading(false);
    }
  };
  return (
    <div className={styles.gallery}>
      <Link href="/app/fotos" className={styles.back}>
        <ArrowLeftIcon size={18} />
        {t("T-3283", { coleccion: album.collectionTitle })}
      </Link>
      <header className={styles.albumIntro}>
        <div>
          <h1>{album.title}</h1>
          <p>
            {album.caption ? <span>{album.caption}</span> : null}
            <span>{t("T-3282", { n: album.photoCount.toLocaleString("es-CO") })}</span>
          </p>
        </div>
        <span className={styles.privateLabel}>
          <LockIcon size={16} />
          {t("T-3271")}
        </span>
      </header>
      {photos.length ? (
        <PhotoGrid photos={photos} onOpen={(index, trigger) => setViewer({ index, trigger })} />
      ) : (
        <p className={styles.empty}>{t("T-3295")}</p>
      )}
      <div className={styles.pagination}>
        <output aria-live="polite" aria-atomic="true">
          {failed
            ? t("T-3292")
            : loading
              ? t("T-3291")
              : t("T-3289", { actual: photos.length, total: album.photoCount })}
        </output>
        {page < totalPages ? (
          <button
            type="button"
            className="boton-secundario"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            {t(failed ? "T-3293" : "T-3290")}
          </button>
        ) : null}
      </div>
      <footer className={styles.endnote}>
        <span>{t("T-3296", { coleccion: album.collectionTitle })}</span>
        <strong>{t("T-037")}</strong>
      </footer>
      <PhotoViewer
        photos={photos}
        title={album.title}
        total={album.photoCount}
        viewer={viewer}
        hasMore={page < totalPages}
        loadingMore={loading}
        failedMore={failed}
        loadMore={loadMore}
        onChange={(index) => setViewer((current) => (current ? { ...current, index } : null))}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}
