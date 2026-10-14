"use client";

import { t } from "@/shared/copy/client";
import styles from "./photos.module.css";

export default function PhotosError({ reset }: { reset: () => void }) {
  return (
    <div className={styles.gallery}>
      <h1>{t("T-3270")}</h1>
      <p className={styles.empty} role="alert">
        {t("T-3292")}
      </p>
      <button type="button" className="boton-secundario" onClick={reset}>
        {t("T-3293")}
      </button>
    </div>
  );
}
