"use client";

import { useEffect, useRef, useState } from "react";
import type { GalleryPhoto } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { ArrowLeftIcon } from "@/shared/ui/icons/ArrowLeftIcon";
import { ArrowRightIcon } from "@/shared/ui/icons/ArrowRightIcon";
import { XIcon } from "@/shared/ui/icons/XIcon";
import { photoSource } from "./photo-source";
import styles from "./photos.module.css";

type ViewerState = { index: number; trigger: HTMLButtonElement };

export function PhotoViewer({
  photos,
  title,
  total,
  viewer,
  hasMore = false,
  loadingMore = false,
  failedMore = false,
  loadMore,
  onChange,
  onClose,
}: {
  photos: GalleryPhoto[];
  title: string;
  total: number;
  viewer: ViewerState | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  failedMore?: boolean;
  loadMore?: () => Promise<number>;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const navigationRequest = useRef(0);
  const [imageResult, setImageResult] = useState<{
    id: string;
    attempt: number;
    status: "ready" | "error";
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const isOpen = viewer !== null;
  const index = viewer?.index ?? 0;
  const photo = photos[index];
  const imageState =
    imageResult?.id === photo?.id && imageResult?.attempt === attempt
      ? imageResult?.status
      : "loading";
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);
  const move = (offset: number) => {
    const request = ++navigationRequest.current;
    const next = index + offset;
    if (next < 0) return;
    if (next >= photos.length) {
      if (hasMore && loadMore && !loadingMore) {
        void loadMore().then((added) => {
          if (added && request === navigationRequest.current && dialog.current?.open) {
            setImageResult(null);
            setAttempt(0);
            onChange(next);
          }
        });
      }
      return;
    }
    setImageResult(null);
    setAttempt(0);
    onChange(next);
  };
  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      aria-label={t("T-3297")}
      onClose={() => {
        navigationRequest.current += 1;
        const trigger = viewer?.trigger;
        onClose();
        setImageResult(null);
        trigger?.focus({ preventScroll: true });
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
        if (event.key !== "Tab") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
        );
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      {viewer && photo ? (
        <div className={styles.viewerContent}>
          <header className={styles.viewerToolbar}>
            <div>
              <p>{title}</p>
              <p className={styles.viewerCount} aria-live="polite" aria-atomic="true">
                {t("T-3289", { actual: index + 1, total })}
              </p>
            </div>
            <button
              type="button"
              className={styles.viewerButton}
              aria-label={t("T-3286")}
              title={t("T-3286")}
              onClick={() => dialog.current?.close()}
            >
              <XIcon size={24} />
            </button>
          </header>
          <div className={styles.viewerMain}>
            <button
              type="button"
              className={styles.viewerButton}
              disabled={index === 0}
              aria-label={t("T-3287")}
              title={t("T-3287")}
              onClick={() => move(-1)}
            >
              <ArrowLeftIcon size={24} />
            </button>
            <figure
              className={styles.viewerPicture}
              onTouchStart={(event) => {
                const touch = event.touches[0];
                touchStart.current =
                  touch && event.touches.length === 1
                    ? { x: touch.clientX, y: touch.clientY }
                    : null;
              }}
              onTouchEnd={(event) => {
                const touch = event.changedTouches[0];
                const start = touchStart.current;
                touchStart.current = null;
                if (!start || !touch) return;
                const dx = touch.clientX - start.x;
                const dy = touch.clientY - start.y;
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                  move(dx > 0 ? -1 : 1);
                }
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: bytes privados con sesión; solo se carga la versión grande al abrir el visor. */}
              <img
                key={`${photo.id}:${attempt}`}
                src={photoSource(photo, 2400)}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                decoding="async"
                draggable={false}
                className={imageState === "error" ? styles.failedPhoto : undefined}
                onLoad={() => setImageResult({ id: photo.id, attempt, status: "ready" })}
                onError={() => setImageResult({ id: photo.id, attempt, status: "error" })}
              />
              {imageState !== "ready" ? (
                <div className={styles.viewerImageStatus}>
                  <output>{t(imageState === "error" ? "T-3292" : "T-3291")}</output>
                  {imageState === "error" ? (
                    <button
                      type="button"
                      className={styles.viewerRetry}
                      onClick={() => {
                        setImageResult(null);
                        setAttempt((value) => value + 1);
                      }}
                    >
                      {t("T-3293")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </figure>
            <button
              type="button"
              className={styles.viewerButton}
              disabled={loadingMore || (index === photos.length - 1 && !hasMore)}
              aria-label={t("T-3288")}
              title={t("T-3288")}
              onClick={() => move(1)}
            >
              <ArrowRightIcon size={24} />
            </button>
          </div>
          <div className={styles.viewerPageStatus}>
            <output aria-live="polite">
              {loadingMore ? t("T-3291") : failedMore ? t("T-3292") : null}
            </output>
            {failedMore ? (
              <button type="button" className={styles.viewerRetry} onClick={() => move(1)}>
                {t("T-3293")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
