"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { LogoComite } from "@/shared/brand/LogoComite";
import { t } from "@/shared/copy/client";
import { stripAccents } from "@/shared/lib/accents";
import { ArrowRightIcon } from "@/shared/ui/icons/ArrowRightIcon";
import { SearchIcon } from "@/shared/ui/icons/SearchIcon";
import styles from "./committees.module.css";

type Committee = {
  id: string;
  slug: string;
  name: string;
  logoKey: string | null;
  summary: string;
};

function normalize(value: string) {
  return stripAccents(value).toLocaleLowerCase("es");
}

function CommitteeCard({ item, own = false }: { item: Committee; own?: boolean }) {
  // El acento pertenece a la sigla y no cambia cuando se filtra la lista.
  const tone = [...item.slug].reduce((total, letter) => total + letter.charCodeAt(0), 0) % 3;
  return (
    <li>
      <Link
        href={`/app/comites/${item.slug}`}
        className={`${styles.card} ${own ? styles.ownCard : ""}`}
        aria-label={t("T-2596", { comité: item.name })}
      >
        <div className={styles.cardHeader}>
          <div className={styles.logoPanel} data-tone={tone} aria-hidden="true">
            {item.logoKey ? (
              <LogoComite slug={item.logoKey} name={item.name} size={88} />
            ) : (
              <span className={styles.monogram}>{item.slug.slice(0, 3).toUpperCase()}</span>
            )}
          </div>
          <div className={styles.identity}>
            <h3 className={styles.cardTitle}>{item.name}</h3>
            {own ? <p className={styles.role}>{item.summary}</p> : null}
          </div>
          {own ? <ArrowRightIcon size={20} /> : null}
        </div>
        {!own ? (
          <>
            <p className={styles.summary}>{item.summary || t("T-310")}</p>
            <span className={styles.cardAction}>
              {t("T-2595")}
              <ArrowRightIcon size={20} />
            </span>
          </>
        ) : null}
      </Link>
    </li>
  );
}

export function CommitteeDirectory({ mine, others }: { mine: Committee[]; others: Committee[] }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const term = normalize(query.trim());
  const matching = others.filter((item) => normalize(`${item.name} ${item.slug}`).includes(term));
  function clearSearch() {
    setQuery("");
    input.current?.focus();
  }
  return (
    <div className={styles.directory}>
      <header className={styles.header}>
        <h1>{t("T-309")}</h1>
        <p>{t("T-073")}</p>
      </header>
      <section aria-labelledby="tus-comites" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 id="tus-comites">{t("T-375")}</h2>
          <span className={styles.count}>{mine.length}</span>
        </div>
        {mine.length === 0 ? (
          <p className={styles.membershipEmpty}>{t("T-376")}</p>
        ) : (
          <ul className={styles.ownGrid}>
            {mine.map((item) => (
              <CommitteeCard key={item.id} item={item} own />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="los-demas" className={styles.section}>
        <div className={styles.sectionHeading}>
          <h2 id="los-demas">{t("T-382")}</h2>
          <span className={styles.count}>{others.length}</span>
        </div>
        {others.length > 0 ? (
          <>
            <search aria-label={t("T-2597")} className={styles.search}>
              <label className={styles.searchLabel} htmlFor={searchId}>
                {t("T-2597")}
              </label>
              <div className={styles.searchRow}>
                <div className={styles.searchField}>
                  <SearchIcon size={20} />
                  <input
                    ref={input}
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("T-2598")}
                    maxLength={120}
                    autoComplete="off"
                    aria-controls={`${searchId}-results`}
                  />
                </div>
                <div className={styles.searchMeta}>
                  <output className={styles.resultsCount} aria-live="polite" aria-atomic="true">
                    {t("T-1547", { n: matching.length, total: others.length })}
                  </output>
                  {query ? (
                    <button type="button" className={styles.clearSearch} onClick={clearSearch}>
                      {t("T-1474")}
                    </button>
                  ) : null}
                </div>
              </div>
            </search>
            <div id={`${searchId}-results`}>
              {matching.length > 0 ? (
                <ul className={styles.grid}>
                  {matching.map((item) => (
                    <CommitteeCard key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>{t("T-1550")}</p>
              )}
            </div>
          </>
        ) : (
          <p className={styles.membershipEmpty}>{t("T-2599")}</p>
        )}
      </section>
    </div>
  );
}
