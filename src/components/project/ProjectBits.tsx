// The status light pill, shown in the workspace header. No hooks, so it
// renders on the server or the client.

import { ragMeta } from "@/lib/domain";
import type { ProjectRag } from "@/lib/supabase/types";
import styles from "./project.module.scss";

export function StatusLight({ rag, withLabel = true }: { rag: ProjectRag; withLabel?: boolean }) {
  const meta = ragMeta(rag);
  return (
    <span className={`${styles.rag} ${styles[rag]}`} title={meta.label}>
      <i aria-hidden="true" />
      {withLabel ? meta.label : <span className="cds--visually-hidden">{meta.label}</span>}
    </span>
  );
}
