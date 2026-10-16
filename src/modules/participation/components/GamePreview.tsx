import type { GamerGame } from "../gamer-types";
import styles from "./GamePreview.module.css";

/** Miniaturas decorativas del gesto de cada juego, nunca resultados de una persona. */
export function GamePreview({ game, featured = false }: { game: GamerGame; featured?: boolean }) {
  if (game === "COLOR") {
    return (
      <span className={featured ? styles.colorFeature : styles.colors} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  return (
    <span className={styles.preview} aria-hidden="true">
      {game === "WORDLE" ? (
        <span className={styles.word}>
          {Array.from({ length: 5 }, (_, index) => index + 1).map((cell) => (
            <i key={cell} />
          ))}
        </span>
      ) : game === "GAME2048" ? (
        <span className={styles.numbers}>
          {[2, 4, 8, 16].map((number) => (
            <span key={number}>{number}</span>
          ))}
        </span>
      ) : game === "SUDOKU" ? (
        <span className={styles.sudoku}>
          {Array.from({ length: 9 }, (_, index) => index + 1).map((cell) => (
            <span key={cell}>{cell % 2 === 1 ? cell : null}</span>
          ))}
        </span>
      ) : (
        <span className={styles.hive}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
