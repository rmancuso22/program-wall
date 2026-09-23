"use client";

import styles from "./roadmap.module.scss";

type Option<K extends string> = { key: K; label: string };

/** The toolbar's segmented toggle (density, sort), as in the mock. */
export function SegmentedControl<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option<K>[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
