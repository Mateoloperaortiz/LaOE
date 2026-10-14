"use client";

import { useRef, useState } from "react";
import type { GalleryCollectionView } from "@/modules/content";
import { t } from "@/shared/copy/client";
import { ArrowUpRightIcon } from "@/shared/ui/icons/ArrowUpRightIcon";
import { LockIcon } from "@/shared/ui/icons/LockIcon";
import { AlbumCards } from "./AlbumCards";
import { PhotoGrid } from "./PhotoGrid";
import { PhotoImage } from "./PhotoImage";
import { PhotoViewer } from "./PhotoViewer";
import styles from "./photos.module.css";

export function GalleryHome({ collection }: { collection: GalleryCollectionView | null }) {
  const [section, setSection] = useState<"featured" | "albums">("featured");
  const [viewer, setViewer] = useState<{ index: number; trigger: HTMLButtonElement } | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const chooseTab = (index: number) => {
    setSection(index === 0 ? "featured" : "albums");
    tabs.current[index]?.focus();
  };
  return (
    <div className={styles.gallery}>
      <div className={styles.breadcrumb}>
        <span>{t("T-3299")}</span>
        <ArrowUpRightIcon size={14} />
        <span>{t("T-3270")}</span>
      </div>
      <header className={styles.headingRow}>
        <h1>{t("T-3270")}</h1>
        <span className={styles.privateLabel}>
          <LockIcon size={16} />
          {t("T-3271")}
        </span>
      </header>
      {collection ? (
        <>
          <section className={styles.hero} aria-label={collection.title}>
            <div className={styles.heroCopy}>
              <h2>{collection.title.replace(/ (\d{4})$/, "\n$1")}</h2>
              <p>{collection.description || t("T-3272")}</p>
            </div>
            {collection.hero ? (
              <figure className={styles.heroPhoto}>
                <PhotoImage
                  photo={collection.hero}
                  eager
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 64vw, 710px"
                />
                <figcaption>{t("T-3273")}</figcaption>
              </figure>
            ) : null}
          </section>
          <div className={styles.sectionNav} role="tablist" aria-label={t("T-3270")}>
            {(["featured", "albums"] as const).map((name, index) => (
              <button
                key={name}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`photos-${name}-tab`}
                aria-controls={`photos-${name}-panel`}
                aria-selected={section === name}
                tabIndex={section === name ? 0 : -1}
                onClick={() => setSection(name)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  chooseTab(
                    event.key === "Home" ? 0 : event.key === "End" ? 1 : index === 0 ? 1 : 0,
                  );
                }}
              >
                {t(name === "featured" ? "T-3274" : "T-3275")}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id="photos-featured-panel"
            aria-labelledby="photos-featured-tab"
            hidden={section !== "featured"}
          >
            <div className={styles.sectionHeading}>
              <div>
                <h2>{t("T-3276")}</h2>
                <p>{t("T-3277")}</p>
              </div>
              <button type="button" className={styles.textAction} onClick={() => chooseTab(1)}>
                {t("T-3278")}
                <ArrowUpRightIcon size={16} />
              </button>
            </div>
            {collection.featured.length ? (
              <PhotoGrid
                photos={collection.featured}
                onOpen={(index, trigger) => setViewer({ index, trigger })}
              />
            ) : (
              <p className={styles.empty}>{t("T-3294")}</p>
            )}
            {collection.albums.length ? (
              <section className={styles.albumSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <h2>{t("T-3279")}</h2>
                    <p>{t("T-3280")}</p>
                  </div>
                </div>
                <AlbumCards albums={collection.albums} collectionSlug={collection.slug} />
              </section>
            ) : null}
          </section>
          <section
            role="tabpanel"
            id="photos-albums-panel"
            aria-labelledby="photos-albums-tab"
            hidden={section !== "albums"}
          >
            <div className={styles.sectionHeading}>
              <h2>{t("T-3281")}</h2>
            </div>
            {collection.albums.length ? (
              <AlbumCards albums={collection.albums} collectionSlug={collection.slug} />
            ) : (
              <p className={styles.empty}>{t("T-3294")}</p>
            )}
          </section>
          <footer className={styles.endnote}>
            <span>{t("T-3296", { coleccion: collection.title })}</span>
            <strong>{t("T-037")}</strong>
          </footer>
          <PhotoViewer
            photos={collection.featured}
            title={collection.title}
            total={collection.featured.length}
            viewer={viewer}
            onChange={(index) => setViewer((current) => (current ? { ...current, index } : null))}
            onClose={() => setViewer(null)}
          />
        </>
      ) : (
        <p className={styles.empty}>{t("T-3294")}</p>
      )}
    </div>
  );
}
