import styles from "./workspace.module.scss";

export function PlaceholderTab({ title, note }: { title: string; note: string }) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.secHead}>
        <h2>{title}</h2>
      </div>
      <p className={styles.placeholder}>{note}</p>
    </section>
  );
}
