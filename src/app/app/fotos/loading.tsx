import { t } from "@/shared/copy";
import styles from "./photos.module.css";

export default function PhotosLoading() {
  return (
    <div className={styles.gallery}>
      <h1>{t("T-3270")}</h1>
      <output className={styles.loading}>{t("T-3291")}</output>
      <div className={styles.loadingSurface} aria-hidden="true" />
    </div>
  );
}
