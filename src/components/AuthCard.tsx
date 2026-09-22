import type { ReactNode } from "react";
import styles from "./AuthCard.module.scss";

export function AuthCard({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <p className={styles.brand}>
          <strong>IBM</strong> Program Wall
        </p>
        <h1 className={styles.title}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </main>
  );
}
