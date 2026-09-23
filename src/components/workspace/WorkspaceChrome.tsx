"use client";

import { useEffect, useMemo, useRef } from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Checkmark, ChevronLeft, ChevronRight, Dashboard, Document, Grid, List, Pen, Share, Timeline } from "@carbon/icons-react";
import { filtersToQuery, matchesFilters, parseFilters, sortWithinQuarters, type FilterableProject } from "@/lib/filters";
import type { ThemePref } from "@/lib/theme";
import { ShellButton, ShellDivider, ShellHeader, shellStyles } from "@/components/ShellHeader";
import { useCopy } from "@/components/Toast";
import { useTimelineBadge } from "@/stores/timeline-badge";
import styles from "./workspace.module.scss";

function useFilterQuery() {
  const searchParams = useSearchParams();
  return useMemo(() => {
    const filters = parseFilters(new URLSearchParams(searchParams.toString()));
    return { filters, query: filtersToQuery(filters) };
  }, [searchParams]);
}

type HeaderProps = {
  projectKey: string;
  projectName: string;
  projects: FilterableProject[];
  themePref: ThemePref;
};

/** Shell header: back to the roadmap, and previous/next through its current filter. */
export function WorkspaceHeader({ projectKey, projectName, projects, themePref }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { filters, query } = useFilterQuery();
  const copy = useCopy();

  const tab = pathname.split("/")[3] ?? "";
  // Same list, same order as the roadmap shows.
  const visible = sortWithinQuarters(
    projects.filter((p) => matchesFilters(p, filters)),
    filters.sort,
  );
  const i = visible.findIndex((p) => p.key === projectKey);
  const step = (dir: -1 | 1) => {
    if (i === -1 || visible.length < 2) return;
    const next = visible[(i + dir + visible.length) % visible.length];
    router.push(`/projects/${next.key}${tab ? `/${tab}` : ""}${query}`);
  };
  const back = () => router.push(`/roadmap${query}`);

  // Escape returns to the roadmap; [ and ] step through projects.
  const stepRef = useRef(step);
  const backRef = useRef(back);
  stepRef.current = step;
  backRef.current = back;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") backRef.current();
      else if (e.key === "[") stepRef.current(-1);
      else if (e.key === "]") stepRef.current(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const canStep = i !== -1 && visible.length > 1;

  return (
    <ShellHeader
      label={`${projectKey} ${projectName}`}
      themePref={themePref}
      actions={
        <>
          <ShellButton aria-label="Previous project" title="Previous project ([)" disabled={!canStep} onClick={() => step(-1)}>
            <ChevronLeft size={16} />
          </ShellButton>
          <ShellButton aria-label="Next project" title="Next project (])" disabled={!canStep} onClick={() => step(1)}>
            <ChevronRight size={16} />
          </ShellButton>
          <ShellButton primary onClick={() => copy(window.location.href, "Link copied.")}>
            Share
            <Share size={16} />
          </ShellButton>
        </>
      }
    >
      <NextLink href={`/roadmap${query}`} className={shellStyles.shellBtn}>
        <ArrowLeft size={16} />
        Roadmap
      </NextLink>
      <ShellDivider />
      <div className={shellStyles.scope}>
        <span className={shellStyles.tag}>{projectKey}</span>
        <em>{projectName}</em>
      </div>
    </ShellHeader>
  );
}

const NAV = [
  { tab: "", label: "Overview", Icon: Dashboard },
  { tab: "design", label: "Design", Icon: Pen },
  { tab: "mural", label: "Mural", Icon: Grid },
  { tab: "tickets", label: "Jira tickets", Icon: List },
  { tab: "timeline", label: "Timeline", Icon: Timeline },
  { tab: "documents", label: "Documents", Icon: Document },
] as const;

type NavProps = {
  projectKey: string;
  /** Approvals waiting on reviewers; replaced by a check once both docs merge. */
  pendingReviews: number;
  designMerged: boolean;
  /** "done/total" for the Timeline badge; the Timeline tab keeps it live. */
  timelineProgress: string;
};

export function WorkspaceNav({ projectKey, pendingReviews, designMerged, timelineProgress }: NavProps) {
  const pathname = usePathname();
  const liveProgress = useTimelineBadge((s) => s.byProject[projectKey]);
  const { query } = useFilterQuery();
  const current = pathname.split("/")[3] ?? "";

  return (
    <nav className={styles.nav} aria-label="Project">
      <div className={`${styles.navGroup} pw-label`}>Project</div>
      {NAV.map(({ tab, label, Icon }) => (
        <NextLink
          key={tab}
          href={`/projects/${projectKey}${tab ? `/${tab}` : ""}${query}`}
          className={styles.navItem}
          aria-current={current === tab ? "page" : undefined}
        >
          <Icon size={16} />
          <span>{label}</span>
          {tab === "design" &&
            (designMerged ? (
              <span className={styles.navDone} title="Both design documents are merged">
                <Checkmark size={14} aria-label="Both design documents are merged" />
              </span>
            ) : pendingReviews > 0 ? (
              <span className={styles.navCount} title={`${pendingReviews} reviews pending`}>
                {pendingReviews}
              </span>
            ) : null)}
          {tab === "timeline" && (
            <span className={styles.navCount} title="Lifecycle items done">
              {liveProgress ?? timelineProgress}
            </span>
          )}
        </NextLink>
      ))}
    </nav>
  );
}

/** The scrolling content column; resets to the top when the tab or project changes. */
export function WorkspaceMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <main ref={ref} className={styles.main} id="main">
      {children}
    </main>
  );
}
