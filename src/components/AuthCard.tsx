import type { ReactNode } from "react";
import { PRODUCT } from "@/lib/config";
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
        <div className={styles.brand}>
          <p className={styles.product}>
            <strong>{PRODUCT.name}</strong>
          </p>
          <p className={styles.tagline}>{PRODUCT.tagline}</p>
        </div>
        <h1 className={styles.title}>{title}</h1>
        {lede && <p className={styles.lede}>{lede}</p>}
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </main>
  );
}
